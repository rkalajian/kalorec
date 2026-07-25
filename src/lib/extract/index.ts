import { extractJsonLdRecipe } from "./jsonld";
import { extractFallbackRecipe } from "./fallback";
import type { Recipe } from "../recipe";

export interface ImportResult {
  recipe: Omit<Recipe, "slug" | "createdAt" | "updatedAt">;
  warning?: string;
}

export async function extractRecipeFromUrl(url: string): Promise<ImportResult> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (recipe-importer)" } });
  } catch (err: any) {
    throw new Error(`Could not reach ${url}: ${err.message}`);
  }
  if (!response.ok) {
    throw new Error(`${url} responded with status ${response.status}`);
  }
  const html = await response.text();
  const jsonLd = extractJsonLdRecipe(html);
  if (jsonLd) {
    return { recipe: { ...jsonLd, sourceUrl: url } };
  }
  const fallback = extractFallbackRecipe(html);
  return {
    recipe: { ...fallback, sourceUrl: url },
    warning:
      "No structured recipe data found on this page. Fields were extracted heuristically — please review carefully before saving.",
  };
}
