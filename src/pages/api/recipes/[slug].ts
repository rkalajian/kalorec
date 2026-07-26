import type { APIRoute } from "astro";
import { getStore } from "../../../lib/store";
import { normalizeText, normalizeNutrition, normalizeTags, normalizeStringList } from "../../../lib/normalize";

export const PUT: APIRoute = async ({ params, request }) => {
  const slug = params.slug!;
  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }
  const store = getStore();
  const existing = await store.get(slug);

  if (!existing) {
    return new Response(JSON.stringify({ error: "Recipe not found" }), { status: 404 });
  }
  if (body.title !== undefined && (typeof body.title !== "string" || !body.title.trim())) {
    return new Response(JSON.stringify({ error: "Title is required" }), { status: 400 });
  }
  if (body.expectedSha && body.expectedSha !== existing.sha) {
    return new Response(
      JSON.stringify({ error: "Recipe changed elsewhere, reload and try again" }),
      { status: 409 }
    );
  }

  const updated = {
    ...existing.recipe,
    title: body.title !== undefined ? body.title.trim() : existing.recipe.title,
    sourceUrl: body.sourceUrl !== undefined ? normalizeText(body.sourceUrl) : existing.recipe.sourceUrl,
    image: body.image !== undefined ? normalizeText(body.image) : existing.recipe.image,
    tags: body.tags !== undefined ? normalizeTags(body.tags) : existing.recipe.tags,
    servings: body.servings !== undefined ? normalizeText(body.servings) : existing.recipe.servings,
    prepTime: body.prepTime !== undefined ? normalizeText(body.prepTime) : existing.recipe.prepTime,
    cookTime: body.cookTime !== undefined ? normalizeText(body.cookTime) : existing.recipe.cookTime,
    ingredients: Array.isArray(body.ingredients)
      ? normalizeStringList(body.ingredients)
      : existing.recipe.ingredients,
    instructions: Array.isArray(body.instructions)
      ? normalizeStringList(body.instructions)
      : existing.recipe.instructions,
    nutrition: body.nutrition !== undefined ? normalizeNutrition(body.nutrition) : existing.recipe.nutrition,
    notes: body.notes !== undefined ? normalizeText(body.notes) : existing.recipe.notes,
    updatedAt: new Date().toISOString(),
  };

  try {
    await store.update(updated, existing.sha);
  } catch (err: any) {
    return new Response(JSON.stringify({ error: `Failed to save recipe: ${err.message}` }), { status: 502 });
  }

  return new Response(JSON.stringify({ slug }), { status: 200 });
};

export const DELETE: APIRoute = async ({ params }) => {
  const slug = params.slug!;
  const store = getStore();
  const existing = await store.get(slug);

  if (!existing) {
    return new Response(JSON.stringify({ error: "Recipe not found" }), { status: 404 });
  }

  try {
    await store.remove(slug, existing.sha, existing.recipe.title);
  } catch (err: any) {
    return new Response(JSON.stringify({ error: `Failed to delete recipe: ${err.message}` }), { status: 502 });
  }

  return new Response(null, { status: 204 });
};
