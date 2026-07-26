import type { APIRoute } from "astro";
import { Octokit } from "@octokit/rest";
import { resolveRepoSelection } from "../../../lib/repos";
import { encryptSession, SESSION_COOKIE } from "../../../lib/session";

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

  const session = { ...locals.session, repo };
  cookies.set(SESSION_COOKIE, encryptSession(session, import.meta.env.SESSION_SECRET), {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return redirect("/");
};
