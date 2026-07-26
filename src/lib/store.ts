import { Octokit } from "@octokit/rest";
import { RecipeStore } from "./github";
import { loadConfig } from "./env";

let cached: RecipeStore | null = null;

export function getStore(): RecipeStore {
  if (cached) return cached;
  const config = loadConfig({
    GITHUB_TOKEN: import.meta.env.GITHUB_TOKEN,
    GITHUB_REPO: import.meta.env.GITHUB_REPO,
    GITHUB_BRANCH: import.meta.env.GITHUB_BRANCH,
  });
  const octokit = new Octokit({ auth: config.githubToken });
  cached = new RecipeStore(octokit, config);
  return cached;
}
