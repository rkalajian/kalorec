import type { APIRoute } from "astro";
import { Octokit } from "@octokit/rest";
import { resolveRepoSelection } from "../../../lib/repos";
import { encryptSession, requireEnv, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "../../../lib/session";
import { getStore } from "../../../lib/store";
import { getSharingStore, loadSharingRepo } from "../../../lib/publishing";

export const POST: APIRoute = async ({ request, locals, cookies, redirect }) => {
  const form = await request.formData();
  const owner = form.get("owner");
  const name = form.get("name");
  if (typeof owner !== "string" || !owner || typeof name !== "string" || !name) {
    return new Response("Missing owner or name", { status: 400 });
  }

  const octokit = new Octokit({ auth: locals.session.accessToken });

  let repo;
  try {
    repo = await resolveRepoSelection(octokit as any, owner, name);
  } catch {
    return redirect("/settings?error=no_access");
  }

  if (!repo.private) return redirect("/settings?error=source_must_be_private");

  const sourceChanged = locals.session.repo &&
    (locals.session.repo.owner.toLowerCase() !== repo.owner.toLowerCase() ||
     locals.session.repo.name.toLowerCase() !== repo.name.toLowerCase() ||
     locals.session.repo.branch !== repo.branch);
  let sharingRepo = locals.session.sharingRepo;
  if (sourceChanged && sharingRepo) {
    try {
      const sourceRecipes = await getStore({ ...locals.session, repo: locals.session.repo! }).list();
      if (sourceRecipes.some((recipe) => recipe.public)) {
        return redirect("/settings?error=source_has_shared_recipes");
      }
      const publishedRecipes = await getSharingStore(locals.session).list();
      if (publishedRecipes.length > 0) {
        return redirect("/settings?error=sharing_repo_has_published_recipes");
      }
    } catch {
      return redirect("/settings?error=repo_change_check_failed");
    }
    sharingRepo = null;
  }

  try {
    const savedSharingRepo = await loadSharingRepo(locals.session.accessToken, repo);
    if (savedSharingRepo) {
      const resolvedSharingRepo = await resolveRepoSelection(octokit as any, savedSharingRepo.owner, savedSharingRepo.name);
      if (resolvedSharingRepo.private ||
          (resolvedSharingRepo.owner.toLowerCase() === repo.owner.toLowerCase() &&
           resolvedSharingRepo.name.toLowerCase() === repo.name.toLowerCase())) {
        return redirect("/settings?error=sharing_config_invalid");
      }
      sharingRepo = resolvedSharingRepo;
    } else if (sourceChanged || !locals.session.repo) {
      sharingRepo = null;
    }
  } catch {
    return redirect("/settings?error=sharing_config_load_failed");
  }

  const session = { ...locals.session, repo, sharingRepo };
  cookies.set(
    SESSION_COOKIE,
    encryptSession(session, requireEnv("SESSION_SECRET", import.meta.env.SESSION_SECRET)),
    SESSION_COOKIE_OPTIONS
  );

  return redirect("/");
};
