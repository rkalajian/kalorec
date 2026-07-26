import type { APIRoute } from "astro";
import { decryptSession, encryptSession, SESSION_COOKIE, OAUTH_STATE_COOKIE, type Session } from "../../../lib/session";

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = cookies.get(OAUTH_STATE_COOKIE)?.value;
  cookies.delete(OAUTH_STATE_COOKIE, { path: "/" });

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirect("/api/auth/login?error=state_mismatch");
  }

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: import.meta.env.GITHUB_CLIENT_ID,
      client_secret: import.meta.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });
  const tokenData = await tokenRes.json().catch(() => null);
  const accessToken = tokenData?.access_token;
  if (!tokenRes.ok || !accessToken) {
    return redirect("/api/auth/login?error=token_exchange_failed");
  }

  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json" },
  });
  const userData = await userRes.json().catch(() => null);
  if (!userRes.ok || !userData?.login) {
    return redirect("/api/auth/login?error=token_exchange_failed");
  }

  const previousCookie = cookies.get(SESSION_COOKIE)?.value;
  const previousSession = previousCookie ? decryptSession(previousCookie, import.meta.env.SESSION_SECRET) : null;

  const session: Session = {
    githubLogin: userData.login,
    accessToken,
    repo: previousSession?.repo ?? null,
  };

  cookies.set(SESSION_COOKIE, encryptSession(session, import.meta.env.SESSION_SECRET), {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return redirect(session.repo ? "/" : "/settings");
};
