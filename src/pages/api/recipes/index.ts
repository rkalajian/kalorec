import type { APIRoute } from "astro";
import { getStore } from "../../../lib/store";
import { slugify, dedupeSlug, type Recipe } from "../../../lib/recipe";
import { normalizeText, normalizeRecipeUrl, normalizeNutrition, normalizeTags, normalizeStringList } from "../../../lib/normalize";
import { SESSION_COOKIE } from "../../../lib/session";
import { getSharingStore, publishRecipe, sharingSetupError, SharingConfigurationError, verifySharingRepos } from "../../../lib/publishing";

export const POST: APIRoute = async ({ request, locals, cookies }) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 200) {
    return new Response(JSON.stringify({ error: "Title must be between 1 and 200 characters" }), { status: 400 });
  }
  if (body.public !== undefined && typeof body.public !== "boolean") {
    return new Response(JSON.stringify({ error: "Sharing must be true or false" }), { status: 400 });
  }
  if (body.public === true) {
    const error = sharingSetupError(locals.session);
    if (error) return new Response(JSON.stringify({ error }), { status: 409 });
    try {
      await verifySharingRepos(locals.session);
    } catch (err) {
      return new Response(JSON.stringify({ error: err instanceof SharingConfigurationError
        ? err.message : "Could not verify sharing repos. Try again." }),
      { status: err instanceof SharingConfigurationError ? 409 : 502 });
    }
  }

  let sourceUrl: string | undefined;
  let image: string | undefined;
  try {
    sourceUrl = normalizeRecipeUrl(body.sourceUrl, "sourceUrl");
    image = normalizeRecipeUrl(body.image, "image");
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 400 });
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
    sourceUrl,
    image,
    tags: normalizeTags(body.tags),
    public: body.public === true,
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

  if (recipe.public) {
    try {
      await publishRecipe(getSharingStore(locals.session), recipe);
    } catch {
      return new Response(JSON.stringify({
        slug,
        warning: "Recipe saved, but sharing failed. Open it and save again to retry publishing.",
      }), { status: 207 });
    }
  }

  return new Response(JSON.stringify({ slug }), { status: 201 });
};
