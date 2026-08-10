# Kalorec

Astro app for capturing recipes — typed in by hand or imported from a link — stored as JSON files in a GitHub repo of your choosing.

## How it works

- Log in with GitHub, then pick a repo in Settings — recipes for your account live at `data/recipes/<slug>.json` in that repo, on its default branch.
- Server-side routes read/write that repo via the GitHub API, using your own OAuth access token — no database, and no shared credentials between users.
- Pasting a link parses the page's `schema.org/Recipe` structured data when present, falling back to a best-effort heuristic extraction otherwise.
- Mark a recipe public to expose it, read-only, at `/u/<owner>/<repo>` (and `/u/<owner>/<repo>/<slug>` for the recipe itself) — no login required to view. This only works if the chosen repo is public on GitHub; public pages read it unauthenticated. Any logged-in visitor can copy a shared recipe into their own repo from there.

## Setup

1. Create a GitHub OAuth App (GitHub → Settings → Developer settings → OAuth Apps → New OAuth App). Set its "Authorization callback URL" to `http://localhost:4321/api/auth/callback` for local dev (or `https://<your-domain>/api/auth/callback` in production).
2. Copy `.env.example` to `.env` and fill in:
   - `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — from the OAuth App you just created
   - `SESSION_SECRET` — any long random string (e.g. `openssl rand -hex 32`), used to encrypt the session cookie
3. `npm install`
4. `npm run dev` — app runs at `http://localhost:4321`. Log in with GitHub, then pick a repo in Settings.

## Deploying to Netlify

1. Connect this repo to a new Netlify site (build command and publish directory are already set in `netlify.toml`).
2. In Site settings → Environment variables, add `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `SESSION_SECRET`.
3. Update your GitHub OAuth App's callback URL to `https://<your-netlify-domain>/api/auth/callback` (production: `https://kalorec.netlify.app/api/auth/callback`).
4. Deploy. Each user logs in with their own GitHub account and picks their own repo in Settings — every recipe add/edit/delete commits directly to that user's chosen repo and branch.
5. **Rebuild tradeoff:** if a user points their selection at this same repo/branch (Netlify's default watch target), every commit from a recipe add/edit/delete also triggers a full Netlify rebuild, since no skip-build marker (e.g. `[skip ci]`) is added to those commit messages. Point at a separate data-only repo to avoid this, or add a `netlify.toml` `[build.ignore]` guard that skips builds for commits touching only `data/recipes/**`.

## Testing

`npm test` runs the unit test suite (session encryption, route access rules, GitHub client, repo selection, link extraction, API routes).

## Manual QA checklist

- Visit the app while logged out → redirected to `/api/auth/login` → GitHub authorize page.
- Authorize → redirected to `/api/auth/callback` → since no repo is chosen yet, redirected to `/settings`.
- `/settings` lists your GitHub repos; picking one redirects to `/` and shows your recipes (empty list on a fresh repo).
- Add a recipe → confirm the commit lands in `data/recipes/<slug>.json` in the chosen repo/branch on GitHub.
- Edit and delete that recipe → confirm both operations commit to the same repo.
- Click your GitHub login in the header → back on `/settings`; pick a different repo → confirm you're redirected home and now see that repo's (empty) recipe list.
- Log out → session cookie cleared, redirected to `/logged-out` (a session-independent page with its own "Log in with GitHub" link — not straight back into `/api/auth/login`, which would silently re-authenticate via GitHub's already-authorized OAuth flow).
- Simulate a revoked/expired token (e.g. revoke the OAuth App's access from your GitHub account settings) and try loading `/` → confirm a GitHub 401 bounces you back to login instead of crashing the page.
- Mark a recipe public, make sure the chosen repo is public on GitHub, then visit `/u/<owner>/<repo>` in a logged-out/incognito window → confirm it lists only public recipes, search/tag filters work, and the recipe detail page loads at `/u/<owner>/<repo>/<slug>`.
- Un-check public on that recipe → confirm both public pages now 404 it.
- While logged in as a different account with a repo configured, click "Add to my recipes" on someone else's public recipe → confirm it copies into your own repo (as private) and redirects to `/recipes/<slug>`, not the other account's repo.
