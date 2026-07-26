import { describe, it, expect, vi } from "vitest";
import { listSelectableRepos, resolveRepoSelection } from "../../src/lib/repos";

function page(items: any[]) {
  return { data: items };
}

describe("listSelectableRepos", () => {
  it("filters to repos with push access and maps owner/name/private", async () => {
    const client = {
      repos: {
        listForAuthenticatedUser: vi.fn(async () =>
          page([
            { name: "recipes", owner: { login: "rob" }, private: true, permissions: { push: true } },
            { name: "readonly-fork", owner: { login: "rob" }, private: false, permissions: { push: false } },
          ])
        ),
        get: vi.fn(),
      },
    };
    const repos = await listSelectableRepos(client as any);
    expect(repos).toEqual([{ owner: "rob", name: "recipes", private: true }]);
  });

  it("paginates until a page comes back shorter than 100", async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => ({
      name: `repo-${i}`,
      owner: { login: "rob" },
      private: false,
      permissions: { push: true },
    }));
    const lastPage = [{ name: "last", owner: { login: "rob" }, private: false, permissions: { push: true } }];
    const listForAuthenticatedUser = vi.fn().mockResolvedValueOnce(page(fullPage)).mockResolvedValueOnce(page(lastPage));
    const client = { repos: { listForAuthenticatedUser, get: vi.fn() } };
    const repos = await listSelectableRepos(client as any);
    expect(repos).toHaveLength(101);
    expect(listForAuthenticatedUser).toHaveBeenCalledTimes(2);
  });
});

describe("resolveRepoSelection", () => {
  it("returns owner/name/branch when push access is confirmed", async () => {
    const client = {
      repos: {
        listForAuthenticatedUser: vi.fn(),
        get: vi.fn(async () => ({ data: { default_branch: "main", permissions: { push: true } } })),
      },
    };
    const result = await resolveRepoSelection(client as any, "rob", "recipes");
    expect(result).toEqual({ owner: "rob", name: "recipes", branch: "main" });
  });

  it("throws when the caller lacks push access", async () => {
    const client = {
      repos: {
        listForAuthenticatedUser: vi.fn(),
        get: vi.fn(async () => ({ data: { default_branch: "main", permissions: { push: false } } })),
      },
    };
    await expect(resolveRepoSelection(client as any, "rob", "recipes")).rejects.toThrow(/push access/);
  });
});
