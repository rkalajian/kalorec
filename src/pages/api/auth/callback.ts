import type { APIRoute } from "astro";
import {
  decryptSession,
  encryptSession,
  requireEnv,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  OAUTH_STATE_COOKIE,
  type Session,
} from "../../../lib/session";

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  // Read required config up front so a misconfigured deploy fails fast and loudly
  // instead of being swallowed by the token-exchange catch below.
  const clientId = requireEnv("GITHUB_CLIENT_ID", import.meta.env.GITHUB_CLIENT_ID);
  const clientSecret = requireEnv("GITHUB_CLIENT_SECRET", import.meta.env.GITHUB_CLIENT_SECRET);
  const sessionSecret = requireEnv("SESSION_SECRET", import.meta.env.SESSION_SECRET);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = cookies.get(OAUTH_STATE_COOKIE)?.value;
  cookies.delete(OAUTH_STATE_COOKIE, { path: "/" });

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirect("/logged-out?error=state_mismatch");
  }

  let accessToken: string | undefined;
  let userLogin: string | undefined;
  try {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });
    const tokenData = await tokenRes.json().catch(() => null);
    accessToken = tokenData?.access_token;
    if (!tokenRes.ok || !accessToken) {
      return redirect("/logged-out?error=token_exchange_failed");
    }

    const userRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json" },
    });
    const userData = await userRes.json().catch(() => null);
    if (!userRes.ok || !userData?.login) {
      return redirect("/logged-out?error=token_exchange_failed");
    }
    userLogin = userData.login;
  } catch {
    return redirect("/logged-out?error=token_exchange_failed");
  }

  const previousCookie = cookies.get(SESSION_COOKIE)?.value;
  const previousSession = previousCookie ? decryptSession(previousCookie, sessionSecret) : null;

  const session: Session = {
    githubLogin: userLogin!,
    accessToken: accessToken!,
    // Only carry a repo selection forward when the SAME GitHub account logs back in —
    // otherwise a second user on this browser would inherit the first user's repo.
    repo: previousSession?.githubLogin === userLogin ? previousSession.repo : null,
  };

  cookies.set(SESSION_COOKIE, encryptSession(session, sessionSecret), SESSION_COOKIE_OPTIONS);

  return redirect(session.repo ? "/" : "/settings");
};
