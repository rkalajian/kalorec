import type { APIRoute } from "astro";
import { getStore } from "../../../lib/store";
import { getPublicRecipe } from "../../../lib/publicStore";
import { slugify, dedupeSlug, type Recipe } from "../../../lib/recipe";
import { safeRecipeUrl } from "../../../lib/normalize";
import { SESSION_COOKIE } from "../../../lib/session";
import { parseImagePath, readRepoImage, resolveRecipeImage, saveRepoImage } from "../../../lib/images";
import { Octokit } from "@octokit/rest";

export const POST: APIRoute = async ({ request, locals, cookies }) => {
  if (!locals.session.repo) {
    return new Response(
      JSON.stringify({ error: "Configure a recipe repo in Settings before copying recipes" }),
      { status: 409 }
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }
  if (
    !body || typeof body !== "object" || Array.isArray(body) ||
    typeof body.owner !== "string" || !body.owner ||
    typeof body.repo !== "string" || !body.repo ||
    typeof body.slug !== "string" || !body.slug
  ) {
    return new Response(JSON.stringify({ error: "owner, repo, and slug are required" }), { status: 400 });
  }

  let source: Recipe | null;
  try {
    source = await getPublicRecipe(body.owner, body.repo, body.slug);
  } catch (err: any) {
    return new Response(JSON.stringify({ error: `Failed to load source recipe: ${err.message}` }), { status: 502 });
  }
  if (!source) {
    return new Response(JSON.stringify({ error: "Recipe not found" }), { status: 404 });
  }

  const store = getStore({ accessToken: locals.session.accessToken, repo: locals.session.repo });

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

  const slug = dedupeSlug(slugify(source.title), existing.map((r) => r.slug));
  const now = new Date().toISOString();
  const recipe: Recipe = {
    ...source,
    slug,
    sourceUrl: safeRecipeUrl(source.sourceUrl, "sourceUrl"),
    image: safeRecipeUrl(source.image, "image"),
    public: false,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const local = recipe.image ? parseImagePath(recipe.image) : null;
    if (local) {
      if (local.scope !== "public" || local.owner !== body.owner || local.repo !== body.repo) {
        return new Response(JSON.stringify({ error: "Source image does not belong to this recipe" }), { status: 400 });
      }
      const metadata = await new Octokit().repos.get({ owner: local.owner, repo: local.repo });
      if (metadata.data.private) throw new Error("Source image repository is private");
      const bytes = await readRepoImage(undefined, {
        owner: local.owner, name: local.repo, branch: metadata.data.default_branch, private: false,
      }, "public", local.name);
      if (!bytes) throw new Error("Source image was not found");
      recipe.image = await saveRepoImage(locals.session.accessToken, locals.session.repo, "private", bytes);
    } else if (recipe.image) {
      recipe.image = await resolveRecipeImage(recipe.image, undefined, locals.session.accessToken, locals.session.repo);
    }
  } catch {
    return new Response(JSON.stringify({ error: "Could not copy recipe image" }), { status: 502 });
  }

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
