import { Octokit } from "@octokit/rest";
import { RecipeStore } from "./github";

export interface StoreSession {
  accessToken: string;
  repo: { owner: string; name: string; branch: string };
}

export function getStore(session: StoreSession): RecipeStore {
  const octokit = new Octokit({ auth: session.accessToken });
  return new RecipeStore(octokit, {
    owner: session.repo.owner,
    repo: session.repo.name,
    branch: session.repo.branch,
  });
}
