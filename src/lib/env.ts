export interface AppConfig {
  githubToken: string;
  owner: string;
  repo: string;
  branch: string;
}

export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const token = env.GITHUB_TOKEN;
  const repoFull = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH || "main";

  if (!token) throw new Error("Missing required env var GITHUB_TOKEN");
  if (!repoFull) throw new Error("Missing required env var GITHUB_REPO");

  const [owner, repo] = repoFull.split("/");
  if (!owner || !repo) {
    throw new Error(`GITHUB_REPO must be in "owner/name" format, got "${repoFull}"`);
  }

  return { githubToken: token, owner, repo, branch };
}
