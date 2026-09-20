import { Octokit } from "@octokit/rest";
import { RecipeStore, SHARED_RECIPES_DIR } from "./github";
import type { Recipe } from "./recipe";

export function getPublicStore(owner: string, repo: string): RecipeStore {
  return new RecipeStore(new Octokit(), { owner, repo, directory: SHARED_RECIPES_DIR });
}

export async function listPublicRecipes(owner: string, repo: string): Promise<Recipe[]> {
  return (await getPublicStore(owner, repo).list()).filter((recipe) => recipe.public === true);
}

export async function getPublicRecipe(owner: string, repo: string, slug: string): Promise<Recipe | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  const stored = await getPublicStore(owner, repo).get(slug);
  return stored && stored.recipe.public === true && stored.recipe.slug === slug ? stored.recipe : null;
}
