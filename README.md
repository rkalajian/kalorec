# Recipe App

Astro app for capturing recipes — typed in by hand or imported from a link — stored as JSON files in a GitHub repo.

## How it works

- Recipes live at `data/recipes/<slug>.json` in a GitHub repo. There is no default — `GITHUB_REPO` is a required environment variable (see Setup below); it can point at this repo or a separate data-only repo.
- Server-side routes read/write that repo via the GitHub API — no database.
- Pasting a link parses the page's `schema.org/Recipe` structured data when present, falling back to a best-effort heuristic extraction otherwise.
- No login — this app assumes a single trusted user. Don't deploy it somewhere publicly reachable without adding access protection in front of it.

## Setup

1. Create a GitHub Personal Access Token (fine-grained, scoped to this repo, with **Contents: Read and write** permission).
2. Copy `.env.example` to `.env` and fill in:
   - `GITHUB_TOKEN` — the token from step 1
   - `GITHUB_REPO` — `owner/name` of the repo recipes should be committed to
   - `GITHUB_BRANCH` — branch to commit to (defaults to `main`)
3. `npm install`
4. `npm run dev` — app runs at `http://localhost:4321`

## Deploying to Netlify

1. Connect this repo to a new Netlify site (build command and publish directory are already set in `netlify.toml`).
2. In Site settings → Environment variables, add `GITHUB_TOKEN`, `GITHUB_REPO`, and optionally `GITHUB_BRANCH`.
3. Deploy. Every recipe add/edit/delete commits directly to the configured GitHub branch and is visible on next page load — the app reads live from the GitHub API, no rebuild needed to *see* the change.
4. **Rebuild tradeoff:** if `GITHUB_REPO` points at this same repo/branch (Netlify's default watch target), every commit from a recipe add/edit/delete also triggers a full Netlify rebuild, since no skip-build marker (e.g. `[skip ci]`) is added to those commit messages. To avoid a rebuild per recipe change, either point `GITHUB_REPO` at a separate data-only repo, or add a `netlify.toml` `[build.ignore]` guard that skips builds for commits touching only `data/recipes/**`.

## Testing

`npm test` runs the unit test suite (data model, GitHub client, link extraction, API routes).

UI pages are verified manually — see the plan's Task 15 checklist for the three core flows.
