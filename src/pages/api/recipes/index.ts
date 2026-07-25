import type { APIRoute } from "astro";
import { getStore } from "../../../lib/store";
import { slugify, dedupeSlug, type Recipe } from "../../../lib/recipe";

function normalizeTags(tags: unknown): string[] {
  return Array.isArray(tags)
    ? tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean)
    : [];
}

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
    title: body.title,
    sourceUrl: body.sourceUrl || undefined,
    image: body.image || undefined,
    tags: normalizeTags(body.tags),
    servings: body.servings || undefined,
    prepTime: body.prepTime || undefined,
    cookTime: body.cookTime || undefined,
    ingredients: Array.isArray(body.ingredients) ? body.ingredients.filter(Boolean) : [],
    instructions: Array.isArray(body.instructions) ? body.instructions.filter(Boolean) : [],
    nutrition: body.nutrition || undefined,
    notes: body.notes || undefined,
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
