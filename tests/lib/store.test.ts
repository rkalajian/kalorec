import { describe, it, expect, vi, beforeEach } from "vitest";
import { Octokit } from "@octokit/rest";
import { getStore } from "../../src/lib/store";
import { RecipeStore } from "../../src/lib/github";

const mockOctokitInstance = {
  repos: {
    getContent: vi.fn(),
  },
};

vi.mock("@octokit/rest", () => ({
  Octokit: vi.fn(() => mockOctokitInstance),
}));

const session = {
  accessToken: "tok_123",
  repo: { owner: "rob", name: "recipes", branch: "dev" },
};

describe("getStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds a RecipeStore scoped to the session's chosen repo", () => {
    expect(getStore(session)).toBeInstanceOf(RecipeStore);
  });

  it("authenticates Octokit with the session's access token", () => {
    getStore(session);
    expect(Octokit).toHaveBeenCalledWith({ auth: "tok_123" });
  });

  it("maps session repo owner/name/branch onto the GitHub owner/repo/ref params", async () => {
    mockOctokitInstance.repos.getContent.mockResolvedValue({ data: [] });

    const store = getStore(session);
    await store.list();

    expect(mockOctokitInstance.repos.getContent).toHaveBeenCalledWith({
      owner: "rob",
      repo: "recipes",
      path: "data/recipes",
      ref: "dev",
    });
  });

  it("does not swap owner and name when they differ", async () => {
    mockOctokitInstance.repos.getContent.mockResolvedValue({ data: [] });

    const store = getStore({
      accessToken: "tok_abc",
      repo: { owner: "some-org", name: "cookbook", branch: "trunk" },
    });
    await store.list();

    expect(Octokit).toHaveBeenCalledWith({ auth: "tok_abc" });
    expect(mockOctokitInstance.repos.getContent).toHaveBeenCalledWith(
      expect.objectContaining({ owner: "some-org", repo: "cookbook", ref: "trunk" })
    );
  });
});
