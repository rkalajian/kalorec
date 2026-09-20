import { describe, it, expect, vi, beforeEach } from "vitest";
import { Octokit } from "@octokit/rest";
import { getPublicStore, listPublicRecipes, getPublicRecipe } from "../../src/lib/publicStore";

const mockOctokitInstance = { repos: { getContent: vi.fn() } };
vi.mock("@octokit/rest", () => ({ Octokit: vi.fn(() => mockOctokitInstance) }));

function b64(obj: unknown) {
  return Buffer.from(JSON.stringify(obj)).toString("base64");
}

const publicRecipe = {
  slug: "chili",
  title: "Chili",
  public: true,
  tags: [],
  ingredients: ["beef"],
  instructions: ["cook"],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const privateRecipe = {
  slug: "secret",
  title: "Secret",
  public: false,
  tags: [],
  ingredients: [],
  instructions: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("getPublicStore", () => {
  beforeEach(() => vi.clearAllMocks());

  it("authenticates Octokit with no token", () => {
    getPublicStore("rob", "recipes");
    expect(Octokit).toHaveBeenCalledWith();
  });
});

describe("listPublicRecipes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns only recipes marked public", async () => {
    mockOctokitInstance.repos.getContent.mockImplementation(async ({ path }: { path: string }) => {
      if (path === "data/shared-recipes") {
        return {
          data: [
            { type: "file", name: "chili.json", path: "data/shared-recipes/chili.json" },
            { type: "file", name: "secret.json", path: "data/shared-recipes/secret.json" },
          ],
        };
      }
      if (path === "data/shared-recipes/chili.json") {
        return { data: { type: "file", content: b64(publicRecipe), sha: "sha-1" } };
      }
      return { data: { type: "file", content: b64(privateRecipe), sha: "sha-2" } };
    });
    const recipes = await listPublicRecipes("rob", "recipes");
    expect(recipes).toEqual([publicRecipe]);
  });

  it("rechecks the sharing repo so unshared recipes do not linger in cache", async () => {
    mockOctokitInstance.repos.getContent.mockImplementation(async ({ path }: { path: string }) => {
      if (path === "data/shared-recipes") {
        return { data: [{ type: "file", name: "chili.json", path: "data/shared-recipes/chili.json" }] };
      }
      return { data: { type: "file", content: b64(publicRecipe), sha: "sha-1" } };
    });
    const first = await listPublicRecipes("cache-owner", "cache-repo");
    const callsAfterFirst = mockOctokitInstance.repos.getContent.mock.calls.length;
    const second = await listPublicRecipes("cache-owner", "cache-repo");
    expect(second).toEqual(first);
    expect(mockOctokitInstance.repos.getContent.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });
});

describe("getPublicRecipe", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the recipe when it exists and is public", async () => {
    mockOctokitInstance.repos.getContent.mockResolvedValue({
      data: { type: "file", content: b64(publicRecipe), sha: "sha-1" },
    });
    expect(await getPublicRecipe("rob", "recipes", "chili")).toEqual(publicRecipe);
  });

  it("returns null when the recipe exists but is not public", async () => {
    mockOctokitInstance.repos.getContent.mockResolvedValue({
      data: { type: "file", content: b64(privateRecipe), sha: "sha-2" },
    });
    expect(await getPublicRecipe("rob", "recipes", "secret")).toBeNull();
  });

  it("returns null when the recipe does not exist", async () => {
    mockOctokitInstance.repos.getContent.mockImplementation(async () => {
      const err: any = new Error("Not Found");
      err.status = 404;
      throw err;
    });
    expect(await getPublicRecipe("rob", "recipes", "missing")).toBeNull();
  });

  it("rechecks a recipe after it is unpublished", async () => {
    mockOctokitInstance.repos.getContent.mockResolvedValue({
      data: { type: "file", content: b64(publicRecipe), sha: "sha-1" },
    });
    const first = await getPublicRecipe("cache-owner", "cache-repo", "chili");
    const callsAfterFirst = mockOctokitInstance.repos.getContent.mock.calls.length;
    mockOctokitInstance.repos.getContent.mockRejectedValue(Object.assign(new Error("Not Found"), { status: 404 }));
    expect(await getPublicRecipe("cache-owner", "cache-repo", "chili")).toBeNull();
    expect(mockOctokitInstance.repos.getContent.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it("rejects a public file whose slug does not match its path", async () => {
    mockOctokitInstance.repos.getContent.mockResolvedValue({
      data: { type: "file", content: b64({ ...publicRecipe, slug: "different" }), sha: "sha-1" },
    });
    expect(await getPublicRecipe("rob", "recipes", "chili")).toBeNull();
  });

  it("does not read invalid slugs", async () => {
    expect(await getPublicRecipe("rob", "recipes", "../secret")).toBeNull();
    expect(mockOctokitInstance.repos.getContent).not.toHaveBeenCalled();
  });
});
