# Recipe App — Design

## Overview

Astro app for capturing recipes (manual entry or pasted link) and storing them
in a GitHub repo as the datastore. Single-user, no login. Deployed on
Netlify.

## Architecture

- Astro SSR (`output: "server"`), Netlify adapter, single repo (app code +
  recipe data live together).
- No database — the GitHub repo is the datastore. Recipes stored at
  `data/recipes/<slug>.json`, one file per recipe.
- Server-side GitHub access via Octokit. Credentials from Netlify env vars:
  - `GITHUB_TOKEN` — PAT with repo write access
  - `GITHUB_REPO` — `owner/name`
  - `GITHUB_BRANCH` — target branch (e.g. `main`)
- Every page render (list, view, edit) reads live from GitHub via the
  Contents/Git Trees API — no build-time content collection, no rebuild wait
  for new/edited recipes to appear.
- Write actions (add, edit, delete) go through Astro API routes
  (`src/pages/api/*`) that call the GitHub API to create/update/delete the
  recipe's JSON file as a commit on the target branch.
- Link-import flow: an API route fetches the target URL server-side, parses
  embedded JSON-LD `schema.org/Recipe` data, and falls back to a
  readability-style extraction heuristic if no structured data is found. The
  result is returned as an unsaved draft for the user to review/edit before
  saving.
- Access control: none (single-user app, no auth). Do not expose this
  deployment publicly without adding protection, since write endpoints are
  unauthenticated.
- UI interactivity: Astro components + vanilla JS islands (no client
  framework). Dynamic ingredient/instruction row add/remove via plain
  `<script>`, form submission via `fetch`.

## Data model

Recipe file: `data/recipes/<slug>.json`

```json
{
  "slug": "grandmas-chili",
  "title": "Grandma's Chili",
  "sourceUrl": "https://example.com/chili",
  "image": "https://example.com/chili.jpg",
  "tags": ["dinner", "spicy", "slow-cooker"],
  "servings": "6",
  "prepTime": "PT15M",
  "cookTime": "PT2H",
  "ingredients": ["1 lb ground beef", "2 cans kidney beans", "..."],
  "instructions": ["Brown the beef.", "Add remaining ingredients.", "..."],
  "nutrition": {
    "calories": "320 kcal",
    "protein": "18g",
    "fat": "12g",
    "carbohydrates": "35g",
    "fiber": "6g",
    "sugar": "8g",
    "sodium": "540mg"
  },
  "notes": "",
  "createdAt": "2026-07-25T00:00:00Z",
  "updatedAt": "2026-07-25T00:00:00Z"
}
```

Notes:
- `slug` generated from title, deduped (`-2`, `-3`, ...) on collision.
- `tags` are freeform strings, lowercased/trimmed on save. A recipe can have
  any number of tags. No fixed category list — the tag vocabulary grows
  organically and is used for filtering/browsing.
- `nutrition` fields are all optional free-text strings (source sites vary
  format/units too much to normalize). Maps directly from JSON-LD `nutrition`
  when present on import.
- `servings`, `prepTime`, `cookTime`, `image`, `sourceUrl`, `notes` are all
  optional.

## Pages / components

- `/` — recipe list. Cards show title, image, tags. Tag filter (multi-select
  chips) + text search, filtered client-side against the list payload already
  loaded server-side (no separate search API needed at this scale).
- `/recipes/[slug]` — view page. Full recipe detail, edit/delete actions.
- `/recipes/[slug]/edit` — edit form, prefilled from current data. Shares the
  form component with add.
- `/recipes/new` — add form, two entry modes via tabs:
  - **Paste link**: URL field → "Import" → `POST /api/import` → form fields
    populate from the parsed draft → user reviews/edits → Save.
  - **Manual entry**: blank form — title, tags, servings, prep/cook time,
    ingredients (add/remove rows), instructions (add/remove rows), nutrition,
    notes.
- `POST /api/recipes` — create. Used by both add flows on final Save.
- `PUT /api/recipes/[slug]` — update.
- `DELETE /api/recipes/[slug]` — delete.
- `POST /api/import` — `{ url }` → scrape + parse → returns draft recipe JSON.
  Does **not** save anything.

## Data flow

1. **List/view**: page load → server fetches recipe files from GitHub
   (Git Trees API for the listing, to avoid N individual file fetches) →
   render.
2. **Import**: submit URL → `/api/import` fetches HTML server-side → extract
   JSON-LD `Recipe` → map to the data model → fallback if absent: fetch, run
   readability-style extraction, heuristically split ingredients/instructions
   from likely list blocks → return draft, unsaved.
3. **Save (new)**: submit form → `POST /api/recipes` → slugify + dedupe →
   GitHub "create file" commit → redirect to `/recipes/[slug]`.
4. **Save (edit)**: submit form → `PUT /api/recipes/[slug]` → fetch current
   file SHA → GitHub "update file" commit → redirect to view.
5. **Delete**: confirm dialog → `DELETE /api/recipes/[slug]` → GitHub "delete
   file" commit → redirect to `/`.

## Error handling

- Import: unreachable URL or no parseable recipe → return a clear error;
  user falls back to manual entry with the form still open (empty, not
  reset away).
- Save: GitHub API failure (bad token, rate limit, conflict) → show inline
  error, preserve form input (re-render with values + message, not a blind
  redirect).
- Edit conflict (file SHA changed since the form loaded) → surface "recipe
  changed elsewhere, reload" instead of silently overwriting.
- Missing env vars (`GITHUB_TOKEN` / `GITHUB_REPO`) → fail fast at startup
  with a clear message, not a cryptic API error later.

## Testing

- Unit tests: JSON-LD recipe parser (fixtures from a few real recipe-site
  HTML samples), fallback heuristic extractor, slug generation/dedup logic.
- Unit tests: GitHub client wrapper (mocked Octokit) — create/update/delete/
  list paths, SHA-conflict handling.
- No e2e/browser test infra for this scope. Manual verification of the three
  core flows (link import, manual add, edit) against the running dev server
  before calling the feature done.
