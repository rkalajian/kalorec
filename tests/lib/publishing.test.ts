import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSharingStore, loadSharingRepo, publishRecipe, saveSharingRepo, sharingSetupError, unpublishRecipe, verifySharingRepos } from "../../src/lib/publishing";
import type { RecipeStore } from "../../src/lib/github";
import type { Recipe } from "../../src/lib/recipe";

const githubApi = vi.hoisted(() => ({
  getContent: vi.fn(async (_params: any): Promise<any> => ({})),
  createOrUpdateFileContents: vi.fn(async (_params: any): Promise<any> => ({})),
}));
vi.mock("@octokit/rest", () => ({ Octokit: vi.fn(() => ({ repos: githubApi })) }));

const sourceRepo = { owner: "rob", name: "private-recipes", branch: "main", private: true };
const sharingRepo = { owner: "rob", name: "shared-recipes", branch: "main", private: false };
const session = { accessToken: "token", repo: sourceRepo, sharingRepo };
const recipe: Recipe = {
  slug: "chili", title: "Chili", public: true, tags: ["Dinner"],
  ingredients: ["beans"], instructions: ["Cook"],
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  githubApi.getContent.mockReset();
  githubApi.createOrUpdateFileContents.mockReset();
});

function fakeStore(existing: { recipe: Recipe; sha: string } | null = null) {
  return {
    get: vi.fn(async () => existing),
    create: vi.fn(async (_recipe: Recipe) => {}),
    update: vi.fn(async (_recipe: Recipe, _sha: string) => {}),
    remove: vi.fn(async (_slug: string, _sha: string, _title: string) => {}),
  };
}

describe("sharing configuration", () => {
  it("requires a private source and separate public destination", () => {
    expect(sharingSetupError(session)).toBeNull();
    expect(sharingSetupError({ ...session, repo: { ...sourceRepo, private: false } })).toMatch(/private recipe repo/);
    expect(sharingSetupError({ ...session, sharingRepo: null })).toMatch(/public sharing repo/);
    expect(sharingSetupError({ ...session, sharingRepo: { ...sharingRepo, private: true } })).toMatch(/public sharing repo/);
    expect(sharingSetupError({ ...session, sharingRepo: { ...sourceRepo, private: false } })).toMatch(/different/);
  });

  it("creates a store scoped to the sharing repository and directory", async () => {
    const store = getSharingStore(session);
    await expect(store.get("../secret")).rejects.toThrow("Invalid recipe slug");
  });

  it("rechecks repo visibility and branches before publishing", async () => {
    const get = vi.fn(async ({ repo }: { repo: string }) => ({
      data: { private: repo === sourceRepo.name, default_branch: "main", permissions: { push: true } },
    }));
    await expect(verifySharingRepos(session, { repos: { get } } as any)).resolves.toBeUndefined();
    get.mockImplementation(async () => ({
      data: { private: false, default_branch: "main", permissions: { push: true } },
    }));
    await expect(verifySharingRepos(session, { repos: { get } } as any)).rejects.toThrow(/visibility/);
  });

  it("persists and reloads the sharing destination from the private source repo", async () => {
    githubApi.getContent.mockRejectedValueOnce(Object.assign(new Error("Not Found"), { status: 404 }));
    githubApi.createOrUpdateFileContents.mockResolvedValue({});
    await saveSharingRepo("token", sourceRepo, sharingRepo);
    const write = githubApi.createOrUpdateFileContents.mock.calls[0][0];
    expect(write).toMatchObject({ owner: sourceRepo.owner, repo: sourceRepo.name, path: "data/kalorec-sharing.json" });
    expect(JSON.parse(Buffer.from(write.content, "base64").toString("utf8"))).toEqual({
      owner: sharingRepo.owner, name: sharingRepo.name, branch: sharingRepo.branch,
    });
    githubApi.getContent.mockResolvedValue({ data: { type: "file", content: write.content, sha: "sha-1" } });
    expect(await loadSharingRepo("token", sourceRepo)).toEqual(sharingRepo);
  });
});

describe("publication", () => {
  it("creates only known recipe fields in the public store", async () => {
    const store = fakeStore();
    await publishRecipe(store as unknown as RecipeStore, {
      ...recipe,
      sourceUrl: "javascript:alert(1)",
      extraPrivateField: "secret",
    } as Recipe);
    expect(store.create).toHaveBeenCalledWith(expect.objectContaining({
      slug: "chili", public: true, sourceUrl: undefined, tags: ["dinner"],
    }));
    expect(store.create.mock.calls[0][0]).not.toHaveProperty("extraPrivateField");
  });

  it("updates an existing public copy with its SHA", async () => {
    const store = fakeStore({ recipe, sha: "old-sha" });
    await publishRecipe(store as unknown as RecipeStore, recipe);
    expect(store.update).toHaveBeenCalledWith(expect.objectContaining({ title: "Chili" }), "old-sha");
    expect(store.create).not.toHaveBeenCalled();
  });

  it("refuses to publish a recipe without explicit sharing intent", async () => {
    const store = fakeStore();
    await expect(publishRecipe(store as unknown as RecipeStore, { ...recipe, public: false })).rejects.toThrow();
    expect(store.get).not.toHaveBeenCalled();
  });

  it("removes public copies idempotently", async () => {
    const existing = fakeStore({ recipe, sha: "sha-1" });
    await unpublishRecipe(existing as unknown as RecipeStore, "chili");
    expect(existing.remove).toHaveBeenCalledWith("chili", "sha-1", "Chili");
    const missing = fakeStore();
    await unpublishRecipe(missing as unknown as RecipeStore, "chili");
    expect(missing.remove).not.toHaveBeenCalled();
  });
});
