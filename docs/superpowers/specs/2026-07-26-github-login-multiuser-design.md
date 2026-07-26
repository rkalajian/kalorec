# GitHub Login + Multi-User Settings — Design

## Overview

Replace the current single-trusted-user model (one shared `GITHUB_TOKEN` +
one global `GITHUB_REPO` env var) with GitHub OAuth login, so multiple
people can use the same deployment. Each logged-in user picks — in a
settings page — which of *their own* GitHub repos to store recipes in.
Recipes are read/written using the logged-in user's own GitHub access
token, so write access is naturally scoped to whatever repos they already
have push permission on. The legacy env-var single-user mode is removed
entirely; login becomes required.

## Auth flow

- New GitHub OAuth App (Client ID/Secret from GitHub org/account settings).
  New env vars: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `SESSION_SECRET`
  (32-byte key, used to encrypt session cookies).
- `GET /api/auth/login` — generates a random `state` value, stores it in a
  short-lived cookie, redirects to
  `https://github.com/login/oauth/authorize` with `scope=repo` (needed for
  read/write on both private and public repos).
- `GET /api/auth/callback` — verifies the returned `state` matches the
  cookie (reject on mismatch/missing — CSRF protection), exchanges `code`
  for an access token via GitHub's token endpoint, calls `GET /user` for
  the GitHub login/avatar, then writes the session cookie. Redirects to
  `/settings` if no repo is selected yet, otherwise to `/`.
- `POST /api/auth/logout` — clears the session cookie, redirects to
  `/api/auth/login`.
- **Session cookie**: JSON `{ githubLogin, accessToken, repo: { owner, name,
  branch } | null }`, encrypted with AES-256-GCM (key = SHA-256 of
  `SESSION_SECRET`), stored httpOnly, Secure, SameSite=Lax. Stateless — no
  server-side session store, consistent with the app's no-database design.
  If decryption fails for any reason, treat as logged-out rather than
  throwing.
- `src/middleware.ts` (new) — runs on every request except
  `/api/auth/*` and static assets. No valid session → redirect to
  `/api/auth/login`. Valid session but `repo` unset → redirect to
  `/settings` (except `/settings` and its API route, to avoid a loop).
  Valid session with `repo` set → attaches the decrypted session to
  `Astro.locals.session` and proceeds.
- `SESSION_SECRET` unset at startup → fail fast, same pattern as today's
  "Missing required env var" throw in `loadConfig`.

## Settings page — repo picker

- `GET /settings` — Astro page. Using the session's `accessToken`, calls
  `GET /user/repos?per_page=100&sort=updated`, paginating (loop while a
  page returns exactly 100 results) until all pages are fetched, then
  filters to repos where `permissions.push === true`. Renders the list
  (name, private/public badge), highlighting the currently-selected repo.
  Also shows the current GitHub login and a "Log out" button.
- `POST /api/settings/repo` — body `{ owner, name }`. Server re-fetches
  that repo via `GET /repos/{owner}/{name}` to confirm push access and read
  `default_branch` (defends against stale client-side data), writes
  `{ owner, name, branch: default_branch }` into the session cookie,
  redirects to `/`.
- Single repo per user — no multi-repo aggregation. Picking a new repo just
  overwrites the previous selection; existing recipes in the old repo are
  left as-is (not moved or deleted), simply no longer shown in this app.
- Branch is always the repo's default branch — no manual branch field.

## Store refactor (per-request, per-user)

- `getStore()` singleton in `src/lib/store.ts` is replaced with
  `getStore(session: Session): RecipeStore`, building a fresh
  `Octokit({ auth: session.accessToken })` and `RecipeStore` per call using
  `session.repo` for `{ owner, repo, branch }`. No caching — Octokit client
  construction is cheap and token/repo differ per request.
- `src/lib/env.ts` (`loadConfig`, env-var based config) is deleted.
- All pages/routes that currently call the parameterless `getStore()` —
  `src/pages/index.astro`, `src/pages/recipes/[slug].astro`,
  `src/pages/recipes/[slug]/edit.astro`, `src/pages/api/recipes/index.ts`,
  `src/pages/api/recipes/[slug].ts` — instead read the session from
  `Astro.locals.session` (or `context.locals.session` in API routes,
  populated by the middleware) and pass it to `getStore(session)`.
- `src/env.d.ts` — drop `GITHUB_TOKEN`/`GITHUB_REPO`/`GITHUB_BRANCH`, add
  `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `SESSION_SECRET`. Add a
  `App.Locals` interface declaring `session: Session`.

## Error handling & security

- OAuth `state` mismatch, missing `code`, or token-exchange failure →
  redirect to `/api/auth/login` with an error query param shown as a banner
  (no raw error/stack trace surfaced to the user).
- GitHub API `401` on any recipe/settings call mid-session (token revoked
  or expired) → clear the session cookie and redirect to login, rather than
  crashing.
- GitHub API `403` (e.g. user lost push access to their previously-selected
  repo) → inline error on the page with a link to `/settings` to pick a
  different repo. Session is left intact.
- No separate CSRF token beyond the OAuth `state` check — mutating routes
  (`/api/recipes/*`, `/api/settings/repo`) already require the session
  cookie, and `SameSite=Lax` prevents that cookie from being sent on
  cross-site POSTs.

## Files touched

- New: `src/middleware.ts`, `src/lib/session.ts` (encrypt/decrypt, cookie
  read/write helpers), `src/pages/api/auth/login.ts`,
  `src/pages/api/auth/callback.ts`, `src/pages/api/auth/logout.ts`,
  `src/pages/settings.astro`, `src/pages/api/settings/repo.ts`.
- Modified: `src/lib/store.ts` (parameterized `getStore`), `src/lib/env.ts`
  (delete `loadConfig`, or delete the file entirely if nothing else uses
  it), `src/env.d.ts` (env var + `App.Locals` types), `astro.config.mjs`
  (no change expected — server output/adapter already fit this), all
  pages/API routes listed above under "Store refactor", `.env.example`,
  `README.md` (new setup steps: creating the OAuth App, new env vars,
  removal of the old single-user setup instructions).
- Deleted: `src/lib/env.ts` usage of `GITHUB_TOKEN`/`GITHUB_REPO` (env
  vars removed from `.env.example`/README/Netlify setup instructions).

## Testing

- Unit tests (vitest): session cookie encrypt/decrypt round-trip (including
  tampered/corrupt cookie → treated as logged out), OAuth `state`
  validation, `getStore(session)` produces correct `{owner, repo, branch}`
  config, repo-list filtering by `permissions.push`, middleware redirect
  decisions (no session → login; session without repo → settings; valid
  session → passthrough).
- No integration test against real GitHub OAuth (requires live secrets) —
  mock `fetch`/Octokit calls, following the existing pattern in the
  `github.ts` test suite.
- Manual UI checklist (added to README, replacing today's Task 15 list):
  login → GitHub authorize → callback → settings shows repo list → pick a
  repo → redirected to `/` → add/edit/delete a recipe lands in that repo on
  GitHub → log out clears session and bounces to login → simulate a
  revoked token (401) mid-session and confirm it bounces to login instead
  of crashing.
