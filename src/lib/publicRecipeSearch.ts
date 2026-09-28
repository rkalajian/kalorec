import { listPublicRecipes } from "./publicStore";
import type { PublicProfile } from "./publicProfiles";
import type { Recipe } from "./recipe";

export const MAX_RECIPE_SEARCH_LENGTH = 100;
const SEARCH_CONCURRENCY = 3;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface PublicRecipeMatch {
  profile: PublicProfile;
  recipe: Recipe;
}

export interface PublicRecipeSearchResult {
  matches: PublicRecipeMatch[];
  failedCount: number;
}

export async function searchPublicRecipes(
  profiles: PublicProfile[],
  query: string
): Promise<PublicRecipeSearchResult> {
  const normalized = query.trim();
  if (normalized.length > MAX_RECIPE_SEARCH_LENGTH) throw new Error("Search is too long");
  if (!normalized) return { matches: [], failedCount: 0 };

  const terms = normalized.toLocaleLowerCase().split(/\s+/u);
  const matches: PublicRecipeMatch[] = [];
  let failedCount = 0;

  for (let index = 0; index < profiles.length; index += SEARCH_CONCURRENCY) {
    const batch = profiles.slice(index, index + SEARCH_CONCURRENCY);
    const results = await Promise.allSettled(batch.map(async (profile) => {
      const recipes = await listPublicRecipes(profile.owner, profile.repo);
      return recipes.filter((recipe) => {
        if (recipe.public !== true || typeof recipe.title !== "string" ||
            typeof recipe.slug !== "string" || !SLUG_PATTERN.test(recipe.slug)) return false;
        const tags = Array.isArray(recipe.tags) ? recipe.tags.filter((tag): tag is string => typeof tag === "string") : [];
        const ingredients = Array.isArray(recipe.ingredients)
          ? recipe.ingredients.filter((item): item is string => typeof item === "string") : [];
        const haystack = [recipe.title, ...tags, ...ingredients].join(" ").toLocaleLowerCase();
        return terms.every((term) => haystack.includes(term));
      }).map((recipe) => ({ profile, recipe }));
    }));
    results.forEach((result) => {
      if (result.status === "fulfilled") matches.push(...result.value);
      else failedCount++;
    });
  }

  matches.sort((a, b) => a.recipe.title.localeCompare(b.recipe.title) ||
    a.profile.login.localeCompare(b.profile.login) || a.recipe.slug.localeCompare(b.recipe.slug));
  return { matches, failedCount };
}
