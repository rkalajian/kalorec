import { beforeEach, describe, expect, it, vi } from "vitest";
import { listPublicProfiles, removePublicProfile, resolveGithubId, savePublicProfile } from "../../src/lib/publicProfiles";

const { records, repoGet } = vi.hoisted(() => ({
  records: new Map<string, string>(),
  repoGet: vi.fn(),
}));

vi.mock("@netlify/blobs", () => ({
  getStore: vi.fn(() => ({
    set: async (key: string, value: string) => { records.set(key, value); },
    get: async (key: string) => records.get(key) ?? null,
    delete: async (key: string) => { records.delete(key); },
    list: async () => ({ blobs: [...records.keys()].map((key) => ({ key })) }),
  })),
}));
vi.mock("@octokit/rest", () => ({ Octokit: vi.fn(() => ({ repos: { get: repoGet } })) }));

const repo = (owner: string, name: string) => ({ owner, name, branch: "main", private: false });

describe("public profile directory", () => {
  beforeEach(() => {
    records.clear();
    repoGet.mockReset().mockResolvedValue({ data: { private: false } });
  });

  it("keeps one entry per GitHub ID and replaces changed public repos", async () => {
    await savePublicProfile(42, "rob", repo("rob", "first"));
    await savePublicProfile(42, "rob", repo("rob", "second"));
    await savePublicProfile(73, "ann", repo("ann", "shared"));

    expect(await listPublicProfiles()).toEqual([
      { githubId: 73, login: "ann", owner: "ann", repo: "shared" },
      { githubId: 42, login: "rob", owner: "rob", repo: "second" },
    ]);
    expect(records.size).toBe(2);
  });

  it("omits repos that are now private or no longer exist", async () => {
    await savePublicProfile(42, "rob", repo("rob", "private-now"));
    await savePublicProfile(73, "ann", repo("ann", "deleted"));
    repoGet.mockImplementation(({ repo }: { repo: string }) => {
      if (repo === "deleted") return Promise.reject(Object.assign(new Error("Not Found"), { status: 404 }));
      return Promise.resolve({ data: { private: true } });
    });
    expect(await listPublicProfiles()).toEqual([]);
  });

  it("removes a profile when sharing is cleared", async () => {
    await savePublicProfile(42, "rob", repo("rob", "shared"));
    await removePublicProfile(42);
    expect(await listPublicProfiles()).toEqual([]);
  });

  it("rejects private destinations and invalid stored data", async () => {
    await expect(savePublicProfile(42, "rob", { ...repo("rob", "shared"), private: true })).rejects.toThrow();
    records.set("42", JSON.stringify({ githubId: 42, login: "rob", owner: "bad/owner", repo: "shared" }));
    expect(await listPublicProfiles()).toEqual([]);
    expect(repoGet).not.toHaveBeenCalled();
  });

  it("resolves account IDs for older sessions and checks account identity", async () => {
    const session = { githubLogin: "rob", accessToken: "tok", repo: null };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 42, login: "rob" })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await resolveGithubId(session)).toBe(42);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 73, login: "other" })));
    await expect(resolveGithubId(session)).rejects.toThrow("does not match");
    vi.unstubAllGlobals();
  });
});
