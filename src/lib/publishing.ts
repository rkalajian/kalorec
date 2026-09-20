import { Octokit } from "@octokit/rest";
import { RecipeStore, SHARED_RECIPES_DIR } from "./github";
import { normalizeNutrition, normalizeStringList, normalizeTags, normalizeText, safeRecipeUrl } from "./normalize";
import type { Recipe } from "./recipe";
import type { RepoRef } from "./session";
import { resolveRepoSelection, type RepoClient } from "./repos";

export interface SharingSession {
  accessToken: string;
  repo: RepoRef | null;
  sharingRepo?: RepoRef | null;
}

export class SharingConfigurationError extends Error {}

const SHARING_CONFIG_PATH = "data/kalorec-sharing.json";

export async function loadSharingRepo(accessToken: string, sourceRepo: RepoRef): Promise<RepoRef | null> {
  const octokit = new Octokit({ auth: accessToken });
  let response;
  try {
    response = await octokit.repos.getContent({
      owner: sourceRepo.owner, repo: sourceRepo.name, path: SHARING_CONFIG_PATH, ref: sourceRepo.branch,
    });
  } catch (error: any) {
    if (error.status === 404) return null;
    throw error;
  }
  if (Array.isArray(response.data) || response.data.type !== "file" || !response.data.content) {
    throw new Error("Invalid sharing configuration in source repo");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(response.data.content, "base64").toString("utf8"));
  } catch {
    throw new Error("Invalid sharing configuration in source repo");
  }
  const data = parsed as Record<string, unknown>;
  if (!data || typeof data !== "object" ||
      typeof data.owner !== "string" || !data.owner ||
      typeof data.name !== "string" || !data.name ||
      typeof data.branch !== "string" || !data.branch) {
    throw new Error("Invalid sharing configuration in source repo");
  }
  return { owner: data.owner, name: data.name, branch: data.branch, private: false };
}

export async function saveSharingRepo(accessToken: string, sourceRepo: RepoRef, sharingRepo: RepoRef): Promise<void> {
  const error = sharingSetupError({ accessToken, repo: sourceRepo, sharingRepo });
  if (error) throw new Error(error);
  const octokit = new Octokit({ auth: accessToken });
  let sha: string | undefined;
  try {
    const current = await octokit.repos.getContent({
      owner: sourceRepo.owner, repo: sourceRepo.name, path: SHARING_CONFIG_PATH, ref: sourceRepo.branch,
    });
    if (Array.isArray(current.data) || current.data.type !== "file") {
      throw new Error("Invalid sharing configuration in source repo");
    }
    sha = current.data.sha;
  } catch (error: any) {
    if (error.status !== 404) throw error;
  }
  await octokit.repos.createOrUpdateFileContents({
    owner: sourceRepo.owner,
    repo: sourceRepo.name,
    branch: sourceRepo.branch,
    path: SHARING_CONFIG_PATH,
    message: "Configure Kalorec sharing repository",
    content: Buffer.from(JSON.stringify({
      owner: sharingRepo.owner, name: sharingRepo.name, branch: sharingRepo.branch,
    }, null, 2)).toString("base64"),
    sha,
  });
}

export function sharingSetupError(session: SharingSession): string | null {
  if (!session.repo || session.repo.private !== true) {
    return "Select a private recipe repo in Settings before sharing";
  }
  if (!session.sharingRepo || session.sharingRepo.private !== false) {
    return "Select a public sharing repo in Settings before sharing";
  }
  if (session.repo.owner.toLowerCase() === session.sharingRepo.owner.toLowerCase() &&
      session.repo.name.toLowerCase() === session.sharingRepo.name.toLowerCase()) {
    return "Recipe and sharing repos must be different";
  }
  return null;
}

export async function verifySharingRepos(session: SharingSession, client?: RepoClient): Promise<void> {
  const error = sharingSetupError(session);
  if (error) throw new SharingConfigurationError(error);
  const github = client ?? new Octokit({ auth: session.accessToken });
  const [source, destination] = await Promise.all([
    resolveRepoSelection(github as RepoClient, session.repo!.owner, session.repo!.name),
    resolveRepoSelection(github as RepoClient, session.sharingRepo!.owner, session.sharingRepo!.name),
  ]);
  if (!source.private || destination.private ||
      source.branch !== session.repo!.branch || destination.branch !== session.sharingRepo!.branch) {
    throw new SharingConfigurationError("Repository visibility or default branch changed. Re-select both repos in Settings.");
  }
}

export function getSharingStore(session: SharingSession): RecipeStore {
  const repo = session.sharingRepo;
  if (!repo || repo.private !== false) throw new Error("No public sharing repo configured");
  if (session.repo && session.repo.owner.toLowerCase() === repo.owner.toLowerCase() &&
      session.repo.name.toLowerCase() === repo.name.toLowerCase()) {
    throw new Error("Recipe and sharing repos must be different");
  }
  return new RecipeStore(new Octokit({ auth: session.accessToken }), {
    owner: repo.owner,
    repo: repo.name,
    branch: repo.branch,
    directory: SHARED_RECIPES_DIR,
  });
}

function publishedCopy(recipe: Recipe): Recipe {
  if (recipe.public !== true || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(recipe.slug) ||
      typeof recipe.title !== "string" || !recipe.title.trim()) {
    throw new Error("Cannot publish an invalid or unshared recipe");
  }
  return {
    slug: recipe.slug,
    title: recipe.title.trim(),
    sourceUrl: safeRecipeUrl(recipe.sourceUrl, "sourceUrl"),
    image: safeRecipeUrl(recipe.image, "image"),
    tags: normalizeTags(recipe.tags),
    public: true,
    servings: normalizeText(recipe.servings),
    prepTime: normalizeText(recipe.prepTime),
    cookTime: normalizeText(recipe.cookTime),
    ingredients: normalizeStringList(recipe.ingredients),
    instructions: normalizeStringList(recipe.instructions),
    nutrition: normalizeNutrition(recipe.nutrition),
    notes: normalizeText(recipe.notes),
    createdAt: recipe.createdAt,
    updatedAt: recipe.updatedAt,
  };
}

export async function publishRecipe(store: RecipeStore, recipe: Recipe): Promise<void> {
  const copy = publishedCopy(recipe);
  const existing = await store.get(copy.slug);
  if (existing) await store.update(copy, existing.sha);
  else await store.create(copy);
}

export async function unpublishRecipe(store: RecipeStore, slug: string): Promise<void> {
  const existing = await store.get(slug);
  if (existing) await store.remove(slug, existing.sha, existing.recipe.title);
}
