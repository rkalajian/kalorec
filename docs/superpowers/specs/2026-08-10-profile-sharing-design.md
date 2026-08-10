# Public profile sharing — design

## Problem

Recipes are private today: each user's collection lives in their own GitHub
repo, readable only through their session's OAuth token. There's no way to
share a link to your recipes with someone who doesn't have (or need) an
account. This adds:

1. A public, read-only profile page listing a user's recipes, and a public
   detail page per recipe.
2. Per-recipe opt-in visibility (`public` flag) — nothing is exposed by
   default.
3. A way for any logged-in viewer to copy a public recipe into their own repo.

## Constraints from existing architecture

- No database. The only server-side state is the encrypted session cookie
  (`src/lib/session.ts`), which holds the owner's GitHub OAuth token. A public
  visitor has no session and must never need one.
- Recipes live as JSON files in `data/recipes/*.json` in the owner's chosen
  GitHub repo (`src/lib/github.ts`, `src/lib/store.ts`).
- `resolveRepoSelection` (`src/lib/repos.ts`) always pins the stored `branch`
  to the repo's `default_branch` — users never pick a custom branch. This
  matters below.

**Decision: public repos only.** Serving private-repo data to anonymous
visitors would require persisting a long-lived credential outside the session
cookie — a new storage/security surface this app doesn't have and shouldn't
grow for this feature. Public sharing works by reading the target repo
through GitHub's **unauthenticated** contents API. If the repo is private,
that read simply 404s/403s; Settings warns about this upfront (see below)
rather than letting users discover it via a dead link.

Because branch always equals the repo's default branch, the unauthenticated
fetch can omit `ref` entirely and still land on the same content the owner
configured — no branch needs to be encoded in the public URL.

## Data model changes

`src/lib/recipe.ts` — `Recipe` gains:

```ts
public?: boolean; // undefined/false = private (default)
```

`src/lib/session.ts` — `RepoRef` gains:

```ts
private: boolean; // captured from GitHub at selection time
```

`resolveRepoSelection` (`src/lib/repos.ts`) already fetches `res.data.private`
from `repos.get`; it just needs to be returned alongside `owner`/`name`/`branch`.
Existing session cookies without this field decrypt fine (field is optional,
validation in `decryptSession` doesn't need to change).

## Routes

Added to `isPublicPath` in `src/lib/routing.ts` (bypass the session gate):

- `GET /u/[owner]/[repo]` — public profile: lists recipes where
  `public === true`, sorted like the existing recipe list.
- `GET /u/[owner]/[repo]/[slug]` — public recipe detail. 404 if the recipe
  doesn't exist *or* isn't public (no distinction in the response — avoids
  leaking which private slugs exist).

Both pages build a plain `new Octokit()` (no `auth`) and call
`repos.getContent` the same way `RecipeStore` does today, filtering the result
by `recipe.public === true`. This can be a small wrapper reusing
`RecipeStore`'s path/parsing logic rather than a parallel implementation —
`RecipeStore` already takes a `GithubClient`; an unauthenticated Octokit
satisfies that interface, so the existing `list()`/`get()` methods work
unmodified. The only new code is constructing the store without a token and
filtering by `public`.

Known limitation: unauthenticated GitHub API calls share a 60 req/hr per-IP
rate limit. Acceptable at this app's scale; not addressed further (no
caching layer — would be premature).

## Settings page

`src/pages/settings.astro` gains a "Share your profile" section once a repo
is configured:

- Shows the public URL `/u/{owner}/{repo}` with a copy-to-clipboard button.
- If `session.repo.private` is true, shows a warning that the repo must be
  public on GitHub for the link to work (no in-app way to flip repo
  visibility — that's a GitHub setting).

## Recipe form — public toggle

`src/components/RecipeForm.astro` gains a checkbox (off by default, matching
`public?: boolean` being falsy-default):

```html
<label><input type="checkbox" id="public" /> Make this recipe public</label>
```

Wired through:
- `src/scripts/recipe-form.ts` — include `public: checkbox.checked` in the
  POST/PUT payload; `fillForm`/`fillField` set the checkbox from loaded data.
- `src/lib/normalize.ts` — no new normalizer needed, it's a plain boolean;
  coerce with `Boolean(body.public)` directly in the route handlers.
- `src/pages/api/recipes/index.ts` (create) and
  `src/pages/api/recipes/[slug].ts` (update) — pass `public` through into the
  `Recipe` object the same way other fields are handled.

## Copy to my recipes

New `POST /api/recipes/copy`, body `{ owner, repo, slug }` (identifying the
*source* public recipe, not the caller's own).

Flow:
1. Require `locals.session` (already guaranteed by middleware for non-public
   paths) and `locals.session.repo` — if the caller hasn't configured a repo,
   return 409 with an error the client turns into a "configure a repo first"
   prompt linking to `/settings`.
2. Re-fetch the source recipe unauthenticated from `{owner}/{repo}/{slug}` and
   verify `public === true` server-side — never trust the client's copy of
   the recipe. This also naturally 404s if it was unshared between page load
   and click.
3. Load the caller's own recipe list (`store.list()`) to dedupe the slug via
   existing `dedupeSlug`.
4. Write via the caller's authenticated store (`store.create`) with: same
   title/ingredients/instructions/tags/etc., fresh `slug` (deduped), fresh
   `createdAt`/`updatedAt`, and **`public: false`** — copies start private
   regardless of the source's visibility.
5. Same error handling pattern as other store-backed routes (401 → clear
   cookie, 403 → no push access message).

Response: `{ slug }` on success (matches the existing create route), so the
client can redirect to `/recipes/{slug}` same as normal recipe creation.

## UI

- `src/components/RecipeCard.astro` gets an optional prop (e.g. `showCopy`)
  used only on public pages, rendering a small "Add to my recipes" button
  that doesn't interfere with the card's existing link-wrapper behavior
  (button needs its own click handler / must not be nested inside the `<a>`
  in a way that breaks the anchor — render as a sibling row below the card
  content, or stop propagation).
- Public detail page gets the same button, styled like the existing
  Edit/Delete action row on `src/pages/recipes/[slug].astro` but read-only
  (no Edit/Delete there — this is a separate page template under `/u/`, not a
  reuse of the authenticated detail page).
- Button behavior depends on viewer state:
  - Logged out → link to `/api/auth/login` (or existing login entrypoint).
  - Logged in, no repo configured → link to `/settings`.
  - Logged in, repo configured → actual "copy" button that POSTs and
    redirects.
- `src/layouts/Layout.astro` currently assumes `Astro.locals.session` always
  exists (renders `session.githubLogin`, logout form). It needs an anonymous
  mode for `/u/*` pages: accept `session: Session | null` (or a boolean prop)
  and render a "Log in" link in place of the account menu when absent.

## Out of scope (YAGNI)

- Editing a copied recipe's attribution back to the source, or tracking
  copy counts.
- Any UI to toggle a GitHub repo's visibility from within the app.
- Caching/rate-limit mitigation for the unauthenticated API calls.
- Un-sharing cascading effects (e.g. notifying someone who copied a recipe
  that no longer exists) — copies are independent once created, by design.
