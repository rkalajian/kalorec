import type { APIRoute } from "astro";
import { getStore } from "../../../lib/store";

function normalizeTags(tags: unknown): string[] | undefined {
  return Array.isArray(tags) ? tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean) : undefined;
}

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
    title: body.title ?? existing.recipe.title,
    sourceUrl: body.sourceUrl ?? existing.recipe.sourceUrl,
    image: body.image ?? existing.recipe.image,
    tags: normalizeTags(body.tags) ?? existing.recipe.tags,
    servings: body.servings ?? existing.recipe.servings,
    prepTime: body.prepTime ?? existing.recipe.prepTime,
    cookTime: body.cookTime ?? existing.recipe.cookTime,
    ingredients: Array.isArray(body.ingredients) ? body.ingredients.filter(Boolean) : existing.recipe.ingredients,
    instructions: Array.isArray(body.instructions)
      ? body.instructions.filter(Boolean)
      : existing.recipe.instructions,
    nutrition: body.nutrition ?? existing.recipe.nutrition,
    notes: body.notes ?? existing.recipe.notes,
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
