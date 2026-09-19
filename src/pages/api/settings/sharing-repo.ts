import type { APIRoute } from "astro";
import { Octokit } from "@octokit/rest";
import { resolveRepoSelection } from "../../../lib/repos";
import { encryptSession, requireEnv, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "../../../lib/session";
import { getStore } from "../../../lib/store";
import { getSharingStore, loadSharingRepo, publishRecipe, saveSharingRepo, unpublishRecipe, verifySharingRepos } from "../../../lib/publishing";

export const POST: APIRoute = async ({ request, locals, cookies, redirect }) => {
  const form = await request.formData();
  const owner = form.get("owner");
  const name = form.get("name");
  if (typeof owner !== "string" || !owner || typeof name !== "string" || !name) {
    return new Response("Missing owner or name", { status: 400 });
  }
  if (!locals.session.repo?.private) return redirect("/settings?error=source_must_be_private");

  const octokit = new Octokit({ auth: locals.session.accessToken });
  let sharingRepo;
  try {
    sharingRepo = await resolveRepoSelection(octokit as any, owner, name);
  } catch {
    return redirect("/settings?error=no_access");
  }

  if (sharingRepo.private) return redirect("/settings?error=sharing_must_be_public");
  if (sharingRepo.owner.toLowerCase() === locals.session.repo.owner.toLowerCase() &&
      sharingRepo.name.toLowerCase() === locals.session.repo.name.toLowerCase()) {
    return redirect("/settings?error=sharing_must_differ");
  }

  try {
    await verifySharingRepos({ ...locals.session, sharingRepo });
  } catch {
    return redirect("/settings?error=sharing_config_invalid");
  }

  let currentSharing = locals.session.sharingRepo;
  if (!currentSharing) {
    try {
      currentSharing = await loadSharingRepo(locals.session.accessToken, locals.session.repo);
    } catch {
      return redirect("/settings?error=sharing_config_load_failed");
    }
  }
  const sameDestination = currentSharing &&
    currentSharing.owner.toLowerCase() === sharingRepo.owner.toLowerCase() &&
    currentSharing.name.toLowerCase() === sharingRepo.name.toLowerCase() &&
    currentSharing.branch === sharingRepo.branch;
  const destinationChanged = currentSharing && !sameDestination;
  if (destinationChanged) {
    try {
      if ((await getSharingStore({ ...locals.session, sharingRepo: currentSharing }).list()).length > 0) {
        return redirect("/settings?error=sharing_repo_has_published_recipes");
      }
    } catch {
      return redirect("/settings?error=repo_change_check_failed");
    }
  }

  if (!sameDestination) {
    try {
      if ((await getSharingStore({ ...locals.session, sharingRepo }).list()).length > 0) {
        return redirect("/settings?error=sharing_repo_not_empty");
      }
    } catch {
      return redirect("/settings?error=repo_change_check_failed");
    }
  }

  let sourceRecipes;
  try {
    sourceRecipes = await getStore({ ...locals.session, repo: locals.session.repo! }).list();
  } catch {
    return redirect("/settings?error=migration_failed");
  }

  if (!sameDestination) {
    try {
      await saveSharingRepo(locals.session.accessToken, locals.session.repo, sharingRepo);
    } catch {
      return redirect("/settings?error=sharing_config_save_failed");
    }
  }

  const session = { ...locals.session, sharingRepo };
  cookies.set(
    SESSION_COOKIE,
    encryptSession(session, requireEnv("SESSION_SECRET", import.meta.env.SESSION_SECRET)),
    SESSION_COOKIE_OPTIONS
  );
  try {
    const sharingStore = getSharingStore(session);
    const published = await sharingStore.list();
    const selectedSlugs = new Set(sourceRecipes.filter((recipe) => recipe.public === true).map((recipe) => recipe.slug));
    for (const recipe of published) {
      if (!selectedSlugs.has(recipe.slug)) await unpublishRecipe(sharingStore, recipe.slug);
    }
    for (const recipe of sourceRecipes) {
      if (recipe.public === true) await publishRecipe(sharingStore, recipe);
    }
  } catch {
    return redirect("/settings?error=migration_failed");
  }
  return redirect("/settings");
};
