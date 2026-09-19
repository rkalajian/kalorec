import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { decryptSession, type Session } from "../../../../src/lib/session";

const { octokit, sourceStore, sharingStore, publishRecipe, unpublishRecipe } = vi.hoisted(() => ({
  octokit: { repos: { get: vi.fn() } },
  sourceStore: { list: vi.fn() },
  sharingStore: { list: vi.fn() },
  publishRecipe: vi.fn(),
  unpublishRecipe: vi.fn(),
}));

vi.mock("@octokit/rest", () => ({ Octokit: vi.fn(() => octokit) }));
vi.mock("../../../../src/lib/store", () => ({ getStore: vi.fn(() => sourceStore) }));
vi.mock("../../../../src/lib/publishing", () => ({
  getSharingStore: vi.fn(() => sharingStore),
  loadSharingRepo: vi.fn().mockResolvedValue(null),
  publishRecipe,
  unpublishRecipe,
  saveSharingRepo: vi.fn().mockResolvedValue(undefined),
  verifySharingRepos: vi.fn().mockResolvedValue(undefined),
}));

function request(fields: Record<string, string>) {
  return new Request("http://localhost/api/settings/sharing-repo", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields),
  });
}

const session: Session = {
  githubLogin: "rob", accessToken: "tok",
  repo: { owner: "rob", name: "private-recipes", branch: "main", private: true },
};
const redirect = (location: string) => new Response(null, { status: 302, headers: { Location: location } });

describe("POST /api/settings/sharing-repo", () => {
  beforeEach(() => {
    vi.stubEnv("SESSION_SECRET", "test-secret-value");
    octokit.repos.get.mockReset(); sourceStore.list.mockReset(); sharingStore.list.mockReset(); publishRecipe.mockReset(); unpublishRecipe.mockReset();
    sourceStore.list.mockResolvedValue([]); sharingStore.list.mockResolvedValue([]); publishRecipe.mockResolvedValue(undefined); unpublishRecipe.mockResolvedValue(undefined);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  it("migrates flagged recipes before saving a public sharing repo", async () => {
    octokit.repos.get.mockResolvedValue({ data: { default_branch: "main", private: false, permissions: { push: true } } });
    const recipe = { slug: "pasta", title: "Pasta", public: true };
    sourceStore.list.mockResolvedValue([recipe, { slug: "private", title: "Private", public: false }]);
    const { POST } = await import("../../../../src/pages/api/settings/sharing-repo");
    const set = vi.fn();
    const response = await POST({ request: request({ owner: "rob", name: "shared" }), locals: { session }, cookies: { set }, redirect } as any);
    expect(response.headers.get("Location")).toBe("/settings");
    expect(publishRecipe).toHaveBeenCalledWith(sharingStore, recipe);
    expect(decryptSession(set.mock.calls[0][1], "test-secret-value")?.sharingRepo).toEqual({ owner: "rob", name: "shared", branch: "main", private: false });
  });

  it("rejects a private sharing repo", async () => {
    octokit.repos.get.mockResolvedValue({ data: { default_branch: "main", private: true, permissions: { push: true } } });
    const { POST } = await import("../../../../src/pages/api/settings/sharing-repo");
    const response = await POST({ request: request({ owner: "rob", name: "private" }), locals: { session }, cookies: { set: vi.fn() }, redirect } as any);
    expect(response.headers.get("Location")).toBe("/settings?error=sharing_must_be_public");
  });

  it("does not save the repo when migration fails", async () => {
    octokit.repos.get.mockResolvedValue({ data: { default_branch: "main", private: false, permissions: { push: true } } });
    sourceStore.list.mockRejectedValue(new Error("GitHub unavailable"));
    const { POST } = await import("../../../../src/pages/api/settings/sharing-repo");
    const set = vi.fn();
    const response = await POST({ request: request({ owner: "rob", name: "shared" }), locals: { session }, cookies: { set }, redirect } as any);
    expect(response.headers.get("Location")).toBe("/settings?error=migration_failed");
    expect(set).not.toHaveBeenCalled();
  });

  it("refuses a destination with existing published files", async () => {
    octokit.repos.get.mockResolvedValue({ data: { default_branch: "main", private: false, permissions: { push: true } } });
    sharingStore.list.mockResolvedValue([{ slug: "other-recipe" }]);
    const { POST } = await import("../../../../src/pages/api/settings/sharing-repo");
    const set = vi.fn();
    const response = await POST({ request: request({ owner: "rob", name: "shared" }), locals: { session }, cookies: { set }, redirect } as any);
    expect(response.headers.get("Location")).toBe("/settings?error=sharing_repo_not_empty");
    expect(set).not.toHaveBeenCalled();
    expect(publishRecipe).not.toHaveBeenCalled();
  });

  it("keeps selected destination available for retry after partial migration", async () => {
    octokit.repos.get.mockResolvedValue({ data: { default_branch: "main", private: false, permissions: { push: true } } });
    sourceStore.list.mockResolvedValue([{ slug: "pasta", title: "Pasta", public: true }]);
    publishRecipe.mockRejectedValueOnce(new Error("rate limited"));
    const { POST } = await import("../../../../src/pages/api/settings/sharing-repo");
    const set = vi.fn();
    const response = await POST({ request: request({ owner: "rob", name: "shared" }), locals: { session }, cookies: { set }, redirect } as any);
    expect(response.headers.get("Location")).toBe("/settings?error=migration_failed");
    expect(decryptSession(set.mock.calls[0][1], "test-secret-value")?.sharingRepo?.name).toBe("shared");
  });

  it("sync removes copies that are no longer selected in the private source", async () => {
    octokit.repos.get.mockResolvedValue({ data: { default_branch: "main", private: false, permissions: { push: true } } });
    sourceStore.list.mockResolvedValue([{ slug: "private", public: false }]);
    sharingStore.list.mockResolvedValue([{ slug: "stale", public: true }]);
    const { POST } = await import("../../../../src/pages/api/settings/sharing-repo");
    const selectedSession = { ...session, sharingRepo: { owner: "rob", name: "shared", branch: "main", private: false } };
    const response = await POST({ request: request({ owner: "rob", name: "shared" }), locals: { session: selectedSession }, cookies: { set: vi.fn() }, redirect } as any);
    expect(response.headers.get("Location")).toBe("/settings");
    expect(unpublishRecipe).toHaveBeenCalledWith(sharingStore, "stale");
    expect(publishRecipe).not.toHaveBeenCalled();
  });
});
