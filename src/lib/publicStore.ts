import { Octokit } from "@octokit/rest";
import { RecipeStore } from "./github";
import type { Recipe } from "./recipe";

const CACHE_TTL_MS = 60_000;
const listCache = new Map<string, { expires: number; recipes: Recipe[] }>();
const recipeCache = new Map<string, { expires: number; recipe: Recipe | null }>();

export function getPublicStore(owner: string, repo: string): RecipeStore {
  return new RecipeStore(new Octokit(), { owner, repo });
}

export async function listPublicRecipes(owner: string, repo: string): Promise<Recipe[]> {
  const key = `${owner}/${repo}`;
  const cached = listCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.recipes;
  const recipes = (await getPublicStore(owner, repo).list()).filter((recipe) => recipe.public === true);
  listCache.set(key, { expires: Date.now() + CACHE_TTL_MS, recipes });
  return recipes;
}

export async function getPublicRecipe(owner: string, repo: string, slug: string): Promise<Recipe | null> {
  const key = `${owner}/${repo}/${slug}`;
  const cached = recipeCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.recipe;
  const stored = await getPublicStore(owner, repo).get(slug);
  const recipe = stored && stored.recipe.public === true ? stored.recipe : null;
  recipeCache.set(key, { expires: Date.now() + CACHE_TTL_MS, recipe });
  return recipe;
}
