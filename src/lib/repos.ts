export interface RepoClient {
  repos: {
    listForAuthenticatedUser(params: { per_page: number; sort: string; page: number }): Promise<{ data: any[] }>;
    get(params: { owner: string; repo: string }): Promise<{ data: any }>;
  };
}

export interface RepoOption {
  owner: string;
  name: string;
  private: boolean;
}

const MAX_PAGES = 10;

export async function listSelectableRepos(client: RepoClient): Promise<RepoOption[]> {
  const results: RepoOption[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await client.repos.listForAuthenticatedUser({ per_page: 100, sort: "updated", page });
    const items = res.data;
    for (const item of items) {
      if (item.permissions?.push) {
        results.push({ owner: item.owner.login, name: item.name, private: item.private });
      }
    }
    if (items.length < 100) break;
  }
  return results;
}

export async function resolveRepoSelection(
  client: RepoClient,
  owner: string,
  name: string
): Promise<{ owner: string; name: string; branch: string; private: boolean }> {
  const res = await client.repos.get({ owner, repo: name });
  if (!res.data.permissions?.push) {
    throw new Error(`No push access to ${owner}/${name}`);
  }
  return { owner, name, branch: res.data.default_branch, private: res.data.private };
}
