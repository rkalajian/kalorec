# Kalorec

Astro app for capturing recipes — typed in by hand or imported from a link — stored as JSON files in a GitHub repo of your choosing.

## How it works

- Log in with GitHub, then choose a private source repo in Settings — recipes for your account live at `data/recipes/<slug>.json` in that repo, on its default branch.
- Choose a distinct public sharing repo in Settings. Recipes marked for publication are copied to `data/shared-recipes/<slug>.json` there; anonymous profiles read only those copies at `/u/<owner>/<sharing-repo>`.
- Server-side routes use your OAuth access token to write the private source and selected public copies; anonymous profile routes read only the public copies.
- Pasting a link parses the page's `schema.org/Recipe` structured data when present, falling back to a best-effort heuristic extraction otherwise.
- Shopping lists collect ingredient lines from selected recipes without changing quantities. Edit, check, add, remove, copy, or print items at `/shopping-list`; **Save list** writes `data/shopping-list.json` to the private source repo. **Reload** replaces the browser list with the saved version and warns before discarding unsaved edits. Saves use the last loaded Git file version and reject a concurrent change, so reload before retrying. Git history retains older list contents, so keep the source repo private.
- Use the recipe sharing setting to publish a separate, read-only copy at `/u/<owner>/<sharing-repo>` (and `/u/<owner>/<sharing-repo>/<slug>` for the recipe itself). The source recipe remains in the private source repo.
- Unpublishing deletes the current public copy, but cannot erase GitHub history or copies made while it was public. Recipes stored in a previously public source repo may remain exposed in its Git history, even after moving to private source storage.
- Anonymous visitors land on a public homepage at `/` — a pitch for the app, a "Log in with GitHub" button, and a "View a shared profile" box that jumps straight to a `/u/<owner>/<repo>` link (paste a share link or type `owner/repo`). `/about` and `/how-to-use` are always reachable from the header nav, logged in or out.

## Setup

1. Create a GitHub OAuth App (GitHub → Settings → Developer settings → OAuth Apps → New OAuth App). Set its "Authorization callback URL" to `http://localhost:4321/api/auth/callback` for local dev (or `https://<your-domain>/api/auth/callback` in production).
2. Copy `.env.example` to `.env` and fill in:
   - `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — from the OAuth App you just created
   - `SESSION_SECRET` — any long random string (e.g. `openssl rand -hex 32`), used to encrypt the session cookie
3. `npm install`
4. `npm run dev` — app runs at `http://localhost:4321`. Log in with GitHub, then pick a private source repo and a distinct empty public sharing repo in Settings.

## Upgrading an existing account

If your source repo is public, copy its `data/recipes` files into a private repo and verify the copies before removing the public source files. Choose the private repo in Settings. Keep a different public repo for shared copies; Kalorec records that pairing in `data/kalorec-sharing.json` in the private repo. Removing public source files does not erase their Git history, forks, or cached copies.

For this deployment, choose `rkalajian/privrec` as the **Private recipe repo** and `rkalajian/recipies` as the **Public sharing repo** in Settings. The public repo keeps only explicitly shared copies under `data/shared-recipes`; saved shopping lists belong in `privrec`.

## Deploying to Netlify

1. Connect this repo to a new Netlify site (build command and publish directory are already set in `netlify.toml`).
2. In Site settings → Environment variables, add `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `SESSION_SECRET`.
3. Update your GitHub OAuth App's callback URL to `https://<your-netlify-domain>/api/auth/callback` (production: `https://kalorec.netlify.app/api/auth/callback`).
4. Deploy. Each user chooses their own private source and public sharing repos in Settings. Recipe changes commit to the source repo; selected public copies commit to the sharing repo.
5. **Rebuild tradeoff:** if a user points their selection at this same repo/branch (Netlify's default watch target), every commit from a recipe add/edit/delete also triggers a full Netlify rebuild, since no skip-build marker (e.g. `[skip ci]`) is added to those commit messages. Point at a separate data-only repo to avoid this, or add a `netlify.toml` `[build.ignore]` guard that skips builds for commits touching only `data/recipes/**`.

## Testing

`npm test` runs the unit test suite (session encryption, route access rules, GitHub client, repo selection, link extraction, API routes).

## Manual QA checklist

- Visit the app while logged out → the public homepage at `/` (pitch + "Log in with GitHub" + "View a shared profile" box), not an instant redirect to GitHub.
- In the "View a shared profile" box, paste a known public profile's share link (or type `owner/repo`) and click View → lands on `/u/<owner>/<repo>`. Try garbage input → inline error, no navigation.
- Visit `/about` and `/how-to-use` while logged out → both render with the anonymous nav (About / How to Use / Log in).
- Click "Log in with GitHub" → redirected to `/api/auth/login` → GitHub authorize page.
- Authorize → redirected to `/api/auth/callback` → since no repo is chosen yet, redirected to `/settings`.
- Before picking a repo, try loading `/` directly → still redirected to `/settings` (the public homepage only shows for logged-out visitors, never a logged-in user without a repo chosen).
- `/settings` lists private source repos and public sharing repos; selecting a private source redirects to `/` and shows its recipes (empty list on a fresh repo).
- Add a recipe → confirm the commit lands in `data/recipes/<slug>.json` in the chosen repo/branch on GitHub.
- Edit and delete that recipe → confirm both operations commit to the same repo.
- Open Shopping list, select multiple recipes, and add their ingredients → confirm original lines appear separately. Edit and check items, add and remove a custom item, then save. Reload and confirm changes persist in private `data/shopping-list.json`; try Copy and Print.
- Click your GitHub login in the header → back on `/settings`; unshare published recipes before switching the private source or public sharing repo.
- Log out → session cookie cleared, redirected to `/logged-out` (a session-independent page with its own "Log in with GitHub" link — not straight back into `/api/auth/login`, which would silently re-authenticate via GitHub's already-authorized OAuth flow).
- Simulate a revoked/expired token (e.g. revoke the OAuth App's access from your GitHub account settings) and try loading `/` → confirm a GitHub 401 bounces you back to login instead of crashing the page.
- Set a private source repo and distinct public sharing repo, publish a recipe, then visit `/u/<owner>/<sharing-repo>` in a logged-out/incognito window → confirm it lists only published copies, search/tag filters work, and the recipe detail page loads at `/u/<owner>/<sharing-repo>/<slug>`.
- Un-check publication on that recipe → confirm both Kalorec public pages now 404 it and the copy is removed from `data/shared-recipes`. GitHub history or copies made while it was public can remain accessible.
- Edit a recipe's sharing flag directly in the private repo, then click **Sync** beside the selected public repo in Settings → confirm stale public copies are removed.
- While logged in as a different account with a repo configured, click "Add to my recipes" on someone else's shared recipe → confirm it copies into your own repo (hidden from your Kalorec profile) and redirects to `/recipes/<slug>`, not the other account's repo.
