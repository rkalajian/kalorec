import type { APIRoute } from "astro";
import { randomBytes } from "node:crypto";
import { OAUTH_STATE_COOKIE } from "../../../lib/session";

export const GET: APIRoute = ({ cookies, redirect }) => {
  const state = randomBytes(16).toString("hex");

  cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  const params = new URLSearchParams({
    client_id: import.meta.env.GITHUB_CLIENT_ID,
    scope: "repo",
    state,
  });

  return redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
};
