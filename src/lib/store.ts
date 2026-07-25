import { Octokit } from "@octokit/rest";
import { RecipeStore } from "./github";
import { loadConfig } from "./env";

let cached: RecipeStore | null = null;

export function getStore(): RecipeStore {
  if (cached) return cached;
  const config = loadConfig(import.meta.env as unknown as Record<string, string | undefined>);
  const octokit = new Octokit({ auth: config.githubToken });
  cached = new RecipeStore(octokit, config);
  return cached;
}
