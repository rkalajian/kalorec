import { Octokit } from "@octokit/rest";
import { RecipeStore } from "./github";
import type { Recipe } from "./recipe";

export function getPublicStore(owner: string, repo: string): RecipeStore {
  return new RecipeStore(new Octokit(), { owner, repo });
}

export async function listPublicRecipes(owner: string, repo: string): Promise<Recipe[]> {
  const recipes = await getPublicStore(owner, repo).list();
  return recipes.filter((recipe) => recipe.public === true);
}

export async function getPublicRecipe(owner: string, repo: string, slug: string): Promise<Recipe | null> {
  const stored = await getPublicStore(owner, repo).get(slug);
  if (!stored || stored.recipe.public !== true) return null;
  return stored.recipe;
}
