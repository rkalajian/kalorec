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
      if (path === "data/recipes") {
        return {
          data: [
            { type: "file", name: "chili.json", path: "data/recipes/chili.json" },
            { type: "file", name: "secret.json", path: "data/recipes/secret.json" },
          ],
        };
      }
      if (path === "data/recipes/chili.json") {
        return { data: { type: "file", content: b64(publicRecipe), sha: "sha-1" } };
      }
      return { data: { type: "file", content: b64(privateRecipe), sha: "sha-2" } };
    });
    const recipes = await listPublicRecipes("rob", "recipes");
    expect(recipes).toEqual([publicRecipe]);
  });

  it("caches results so a second call within the TTL doesn't hit the API again", async () => {
    mockOctokitInstance.repos.getContent.mockImplementation(async ({ path }: { path: string }) => {
      if (path === "data/recipes") {
        return { data: [{ type: "file", name: "chili.json", path: "data/recipes/chili.json" }] };
      }
      return { data: { type: "file", content: b64(publicRecipe), sha: "sha-1" } };
    });
    const first = await listPublicRecipes("cache-owner", "cache-repo");
    const callsAfterFirst = mockOctokitInstance.repos.getContent.mock.calls.length;
    const second = await listPublicRecipes("cache-owner", "cache-repo");
    expect(second).toEqual(first);
    expect(mockOctokitInstance.repos.getContent.mock.calls.length).toBe(callsAfterFirst);
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

  it("caches results so a second call within the TTL doesn't hit the API again", async () => {
    mockOctokitInstance.repos.getContent.mockResolvedValue({
      data: { type: "file", content: b64(publicRecipe), sha: "sha-1" },
    });
    const first = await getPublicRecipe("cache-owner", "cache-repo", "chili");
    const callsAfterFirst = mockOctokitInstance.repos.getContent.mock.calls.length;
    const second = await getPublicRecipe("cache-owner", "cache-repo", "chili");
    expect(second).toEqual(first);
    expect(mockOctokitInstance.repos.getContent.mock.calls.length).toBe(callsAfterFirst);
  });
});
