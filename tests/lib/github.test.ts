import { describe, it, expect, vi } from "vitest";
import { RecipeStore } from "../../src/lib/github";
import type { Recipe } from "../../src/lib/recipe";

const config = { owner: "rob", repo: "recipes", branch: "main" };

function b64(obj: unknown) {
  return Buffer.from(JSON.stringify(obj)).toString("base64");
}

const sampleRecipe: Recipe = {
  slug: "chili",
  title: "Chili",
  tags: ["dinner"],
  ingredients: ["beef"],
  instructions: ["cook"],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("RecipeStore", () => {
  it("lists recipes from the recipes directory", async () => {
    const client = {
      repos: {
        getContent: vi.fn(async ({ path }: { path: string }) => {
          if (path === "data/recipes") {
            return { data: [{ type: "file", name: "chili.json", path: "data/recipes/chili.json" }] };
          }
          return { data: { type: "file", content: b64(sampleRecipe), sha: "sha-1" } };
        }),
        createOrUpdateFileContents: vi.fn(),
        deleteFile: vi.fn(),
      },
    };
    const store = new RecipeStore(client as any, config);
    const recipes = await store.list();
    expect(recipes).toEqual([sampleRecipe]);
  });

  it("returns an empty list when the directory does not exist", async () => {
    const client = {
      repos: {
        getContent: vi.fn(async () => {
          const err: any = new Error("Not Found");
          err.status = 404;
          throw err;
        }),
        createOrUpdateFileContents: vi.fn(),
        deleteFile: vi.fn(),
      },
    };
    const store = new RecipeStore(client as any, config);
    expect(await store.list()).toEqual([]);
  });

  it("gets a single recipe with its sha", async () => {
    const client = {
      repos: {
        getContent: vi.fn(async () => ({ data: { type: "file", content: b64(sampleRecipe), sha: "sha-1" } })),
        createOrUpdateFileContents: vi.fn(),
        deleteFile: vi.fn(),
      },
    };
    const store = new RecipeStore(client as any, config);
    expect(await store.get("chili")).toEqual({ recipe: sampleRecipe, sha: "sha-1" });
  });

  it("returns null when a recipe is not found", async () => {
    const client = {
      repos: {
        getContent: vi.fn(async () => {
          const err: any = new Error("Not Found");
          err.status = 404;
          throw err;
        }),
        createOrUpdateFileContents: vi.fn(),
        deleteFile: vi.fn(),
      },
    };
    const store = new RecipeStore(client as any, config);
    expect(await store.get("missing")).toBeNull();
  });

  it("creates a recipe via createOrUpdateFileContents without a sha", async () => {
    const createOrUpdateFileContents = vi.fn(async () => ({}));
    const client = { repos: { getContent: vi.fn(), createOrUpdateFileContents, deleteFile: vi.fn() } };
    const store = new RecipeStore(client as any, config);
    await store.create(sampleRecipe);
    expect(createOrUpdateFileContents).toHaveBeenCalledWith(
      expect.objectContaining({ path: "data/recipes/chili.json", sha: undefined })
    );
  });

  it("updates a recipe via createOrUpdateFileContents with the given sha", async () => {
    const createOrUpdateFileContents = vi.fn(async () => ({}));
    const client = { repos: { getContent: vi.fn(), createOrUpdateFileContents, deleteFile: vi.fn() } };
    const store = new RecipeStore(client as any, config);
    await store.update(sampleRecipe, "sha-1");
    expect(createOrUpdateFileContents).toHaveBeenCalledWith(
      expect.objectContaining({ path: "data/recipes/chili.json", sha: "sha-1" })
    );
  });

  it("removes a recipe via deleteFile", async () => {
    const deleteFile = vi.fn(async () => ({}));
    const client = { repos: { getContent: vi.fn(), createOrUpdateFileContents: vi.fn(), deleteFile } };
    const store = new RecipeStore(client as any, config);
    await store.remove("chili", "sha-1", "Chili");
    expect(deleteFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: "data/recipes/chili.json", sha: "sha-1" })
    );
  });
});
