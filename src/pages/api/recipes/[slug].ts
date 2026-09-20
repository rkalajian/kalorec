import type { APIRoute } from "astro";
import { getStore } from "../../../lib/store";
import { normalizeText, normalizeRecipeUrl, safeRecipeUrl, normalizeNutrition, normalizeTags, normalizeStringList } from "../../../lib/normalize";
import { SESSION_COOKIE } from "../../../lib/session";
import { getSharingStore, publishRecipe, sharingSetupError, SharingConfigurationError, unpublishRecipe, verifySharingRepos } from "../../../lib/publishing";

export const PUT: APIRoute = async ({ params, request, locals, cookies }) => {
  const slug = params.slug!;
  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return new Response(JSON.stringify({ error: "Invalid recipe body" }), { status: 400 });
  }
  if (body.public !== undefined && typeof body.public !== "boolean") {
    return new Response(JSON.stringify({ error: "Sharing must be true or false" }), { status: 400 });
  }
  let sourceUrl: string | undefined;
  let image: string | undefined;
  try {
    if (body.sourceUrl !== undefined) sourceUrl = normalizeRecipeUrl(body.sourceUrl, "sourceUrl");
    if (body.image !== undefined) image = normalizeRecipeUrl(body.image, "image");
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 400 });
  }
  const store = getStore({ accessToken: locals.session.accessToken, repo: locals.session.repo! });

  let existing;
  try {
    existing = await store.get(slug);
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
    return new Response(JSON.stringify({ error: `Failed to load recipe: ${err.message}` }), { status: 502 });
  }

  if (!existing) {
    return new Response(JSON.stringify({ error: "Recipe not found" }), { status: 404 });
  }
  if (body.title !== undefined && (typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 200)) {
    return new Response(JSON.stringify({ error: "Title must be between 1 and 200 characters" }), { status: 400 });
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
    sourceUrl: body.sourceUrl !== undefined ? sourceUrl : safeRecipeUrl(existing.recipe.sourceUrl, "sourceUrl"),
    image: body.image !== undefined ? image : safeRecipeUrl(existing.recipe.image, "image"),
    tags: body.tags !== undefined ? normalizeTags(body.tags) : existing.recipe.tags,
    public: body.public !== undefined ? body.public : existing.recipe.public,
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

  if (updated.public) {
    const error = sharingSetupError(locals.session);
    if (error) return new Response(JSON.stringify({ error }), { status: 409 });
    try {
      await verifySharingRepos(locals.session);
    } catch (err) {
      return new Response(JSON.stringify({ error: err instanceof SharingConfigurationError
        ? err.message : "Could not verify sharing repos. Try again." }),
      { status: err instanceof SharingConfigurationError ? 409 : 502 });
    }
  } else if (existing.recipe.public && !locals.session.sharingRepo) {
    return new Response(JSON.stringify({
      error: "Select the original sharing repo in Settings before unsharing this recipe",
    }), { status: 409 });
  }

  let removedPublicCopy = false;
  if (!updated.public && locals.session.sharingRepo) {
    try {
      await unpublishRecipe(getSharingStore(locals.session), slug);
      removedPublicCopy = true;
    } catch {
      return new Response(JSON.stringify({
        error: "Could not remove the public copy. Recipe remains shared; try again.",
      }), { status: 502 });
    }
  }

  try {
    await store.update(updated, existing.sha);
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
    return new Response(JSON.stringify({ error: removedPublicCopy
      ? "Public copy removed, but the private recipe could not be saved. Reload and retry."
      : `Failed to save recipe: ${err.message}` }), { status: 502 });
  }

  if (updated.public) {
    try {
      await publishRecipe(getSharingStore(locals.session), updated);
    } catch {
      return new Response(JSON.stringify({
        slug,
        warning: "Recipe saved, but sharing failed. Open it and save again to retry publishing.",
      }), { status: 207 });
    }
  }

  return new Response(JSON.stringify({ slug }), { status: 200 });
};

export const DELETE: APIRoute = async ({ params, locals, cookies }) => {
  const slug = params.slug!;
  const store = getStore({ accessToken: locals.session.accessToken, repo: locals.session.repo! });

  let existing;
  try {
    existing = await store.get(slug);
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
    return new Response(JSON.stringify({ error: `Failed to load recipe: ${err.message}` }), { status: 502 });
  }

  if (!existing) {
    return new Response(JSON.stringify({ error: "Recipe not found" }), { status: 404 });
  }

  if (existing.recipe.public && !locals.session.sharingRepo) {
    return new Response(JSON.stringify({
      error: "Select the original sharing repo in Settings before deleting this shared recipe",
    }), { status: 409 });
  }

  let removedPublicCopy = false;
  if (locals.session.sharingRepo) {
    try {
      await unpublishRecipe(getSharingStore(locals.session), slug);
      removedPublicCopy = true;
    } catch {
      return new Response(JSON.stringify({
        error: "Could not remove the public copy. Recipe was not deleted; try again.",
      }), { status: 502 });
    }
  }

  try {
    await store.remove(slug, existing.sha, existing.recipe.title);
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
    return new Response(JSON.stringify({ error: removedPublicCopy
      ? "Public copy removed, but the private recipe could not be deleted. Reload and retry."
      : `Failed to delete recipe: ${err.message}` }), { status: 502 });
  }

  return new Response(null, { status: 204 });
};
