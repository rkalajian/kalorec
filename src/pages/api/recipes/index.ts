import type { APIRoute } from "astro";
import { getStore } from "../../../lib/store";
import { slugify, dedupeSlug, type Recipe } from "../../../lib/recipe";
import { normalizeText, normalizeNutrition, normalizeTags, normalizeStringList } from "../../../lib/normalize";
import { SESSION_COOKIE } from "../../../lib/session";

export const POST: APIRoute = async ({ request, locals, cookies }) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }
  if (!body.title || typeof body.title !== "string") {
    return new Response(JSON.stringify({ error: "Title is required" }), { status: 400 });
  }

  const store = getStore({ accessToken: locals.session.accessToken, repo: locals.session.repo! });
  let existing;
  try {
    existing = await store.list();
  } catch (err: any) {
    if (err.status === 401) {
      cookies.delete(SESSION_COOKIE, { path: "/" });
      return new Response(JSON.stringify({ error: "Session expired, please log in again" }), { status: 401 });
    }
    if (err.status === 403) {
      return new Response(
        JSON.stringify({ error: "No push access to this repository — update it in Settings" }),
        { status: 403 }
      );
    }
    return new Response(JSON.stringify({ error: `Failed to load recipes: ${err.message}` }), { status: 502 });
  }

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
    if (err.status === 401) {
      cookies.delete(SESSION_COOKIE, { path: "/" });
      return new Response(JSON.stringify({ error: "Session expired, please log in again" }), { status: 401 });
    }
    if (err.status === 403) {
      return new Response(
        JSON.stringify({ error: "No push access to this repository — update it in Settings" }),
        { status: 403 }
      );
    }
    return new Response(JSON.stringify({ error: `Failed to save recipe: ${err.message}` }), { status: 502 });
  }

  return new Response(JSON.stringify({ slug }), { status: 201 });
};
