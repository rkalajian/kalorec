import type { APIRoute } from "astro";
import { getStore } from "../../../lib/store";
import { slugify, dedupeSlug, type Recipe } from "../../../lib/recipe";
import { normalizeText, normalizeNutrition, normalizeTags, normalizeStringList } from "../../../lib/normalize";

export const POST: APIRoute = async ({ request }) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }
  if (!body.title || typeof body.title !== "string") {
    return new Response(JSON.stringify({ error: "Title is required" }), { status: 400 });
  }

  const store = getStore();
  const existing = await store.list();
  const slug = dedupeSlug(slugify(body.title), existing.map((r) => r.slug));
  const now = new Date().toISOString();

  const recipe: Recipe = {
    slug,
    title: body.title.trim(),
    sourceUrl: normalizeText(body.sourceUrl),
    image: normalizeText(body.image),
    tags: normalizeTags(body.tags),
    servings: normalizeText(body.servings),
    prepTime: normalizeText(body.prepTime),
    cookTime: normalizeText(body.cookTime),
    ingredients: normalizeStringList(body.ingredients),
    instructions: normalizeStringList(body.instructions),
    nutrition: normalizeNutrition(body.nutrition),
    notes: normalizeText(body.notes),
    createdAt: now,
    updatedAt: now,
  };

  try {
    await store.create(recipe);
  } catch (err: any) {
    return new Response(JSON.stringify({ error: `Failed to save recipe: ${err.message}` }), { status: 502 });
  }

  return new Response(JSON.stringify({ slug }), { status: 201 });
};
