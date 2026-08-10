# Public front-end — design

## Problem

An anonymous visitor hitting `/` today is bounced straight through
`/api/auth/login` into GitHub's OAuth authorize screen — no Kalorec page is
ever shown. There's no page explaining what the app is, no way to find a
shared profile without already knowing its exact URL, and no user-facing
documentation of how the app works (the README covers this, but only for
someone already reading the repo).

This adds:
1. A real landing page at `/` for logged-out visitors, replacing the
   instant redirect.
2. A "View a shared profile" lookup box on that landing page, so a visitor
   who doesn't have a direct `/u/owner/repo` link can still get to one.
3. An `/about` page and a `/how-to-use` page, linked from the header nav for
   everyone, logged in or out.

## Constraints from existing architecture

- No database — nothing here changes that. The lookup box is pure
  client-side URL parsing, not a directory; there is still no registry of
  who has shared a profile (a full browsable directory was considered and
  explicitly rejected — see Out of scope).
- `src/lib/routing.ts`'s `decideRoute`/`isPublicPath` gate every non-public
  path behind a session. That logic needs the smallest possible change to
  let `/` through for anonymous visitors without weakening any other rule.

## Routing changes

`src/lib/routing.ts`:

- `isPublicPath` gains `/about` and `/how-to-use` — always public,
  regardless of session state, same as `/logged-out` today.
- `decideRoute` gets one new branch: when there is no session and the path
  is exactly `/`, proceed instead of redirecting to `/api/auth/login`.
  Every other existing rule is unchanged — critically, a *logged-in* user
  with no repo configured still gets redirected from `/` to `/settings`,
  because `/` is deliberately **not** added to `isPublicPath` (that bypass
  runs before the session check and would skip the no-repo redirect too).

```ts
export function isPublicPath(pathname: string): boolean {
  return (
    pathname.startsWith("/api/auth/") ||
    pathname === "/logged-out" ||
    pathname.startsWith("/u/") ||
    pathname === "/about" ||
    pathname === "/how-to-use"
  );
}

export function decideRoute(session: Session | null, pathname: string): RouteDecision {
  if (isPublicPath(pathname)) return { proceed: true };
  if (!session) {
    if (pathname === "/") return { proceed: true };
    return { redirect: "/api/auth/login" };
  }
  const isSettingsPath = pathname === "/settings" || pathname.startsWith("/api/settings/");
  if (!session.repo && !isSettingsPath) return { redirect: "/settings" };
  return { proceed: true };
}
```

This is a pure function change, fully covered by the existing unit test
style in `tests/lib/routing.test.ts`.

## Landing page

`src/pages/index.astro` branches at the top on `Astro.locals.session`:

- **Session present:** exactly today's behavior — load the store, list
  recipes, render the existing search/filter/grid UI. Zero change to this
  path.
- **No session:** render a landing page instead, using `Layout` with
  `session={null}` passed explicitly (the same anonymous-nav pattern the
  `/u/*` pages already use).

Landing page content (minimal, no feature grid, no screenshots):

- A one-line tagline and 2-3 sentences: Kalorec is a recipe manager backed
  by your own GitHub repo — your recipes are yours, stored as plain JSON
  files you own, with no vendor lock-in.
- A single primary CTA: "Log in with GitHub" (same `/api/auth/login` link
  used elsewhere).
- Below that, a small "View a shared profile" box: a text input plus a
  "View" button. Accepts either `owner/repo` shorthand or a full pasted
  `/u/owner/repo` share URL (from anywhere, including a different host).
  Client-side script parses the input and navigates to `/u/{owner}/{repo}`;
  on unparseable input, shows an inline message rather than navigating.

  Parsing rule: if the input contains `/u/`, take everything after it;
  otherwise strip a leading `scheme://host/` if present. Split what's left
  on `/`, drop empty segments, and require at least two — the first two
  become `owner` and `repo`. Anything beyond that (e.g. a full recipe-detail
  link with a slug) is ignored, since the lookup box always lands on the
  profile list, not a specific recipe.

## About page (`src/pages/about.astro`)

Static content, rendered inside `Layout` (no `session` override needed —
`Layout`'s existing default already falls back to `Astro.locals.session`,
which is fine to be `null` here since `/about` is unauthenticated-safe by
being in `isPublicPath`). Content: what Kalorec is, why GitHub-as-storage
(portability, no lock-in, you already trust GitHub with your data), and a
one-line mention of public sharing.

## How to Use page (`src/pages/how-to-use.astro`)

Same rendering approach. Numbered walkthrough:

1. Log in with GitHub.
2. Pick (or create) a repo in Settings — that's where your recipes live.
3. Add a recipe — type it in, or paste a link to import it.
4. Optionally check "Make this recipe public" and share your profile link
   from Settings.
5. Browse someone else's shared profile and click "Add to my recipes" to
   copy it into your own repo.

## Nav changes

`src/layouts/Layout.astro` gets two more links, always rendered regardless
of session state: "About" → `/about`, "How to Use" → `/how-to-use`. Placed
in the header's existing `flex items-center gap-3` action area, before the
session-conditional block (so they appear in both the logged-in and
logged-out branches without duplicating markup).

## New files

- `src/pages/about.astro`
- `src/pages/how-to-use.astro`
- `src/scripts/profile-lookup.ts` (lookup box parse-and-navigate logic,
  same pattern as the other small page-scoped scripts in `src/scripts/`)

## Testing

- `src/lib/routing.ts`'s new branch is a pure function change — unit
  tested in `tests/lib/routing.test.ts` alongside the existing coverage.
- The landing page, About/How to Use pages, nav changes, and the lookup
  script have no automated test coverage, consistent with every other
  `.astro`/page-script change in this codebase (no `.astro` test
  convention exists) — verified by `npm run build` plus manual smoke
  checking the golden paths (anonymous visit to `/`, lookup box with a
  valid and an invalid input, `/about`, `/how-to-use`, and confirming a
  logged-in user with no repo still gets bounced from `/` to `/settings`).

## Out of scope (YAGNI)

- A real directory/registry of public profiles — would require new
  persistent storage, explicitly rejected to keep the no-database
  architecture intact.
- Feature-grid/marketing-style landing page, screenshots, testimonials.
- Search/ranking within the lookup box — it's a direct-navigation helper,
  not a search engine.
