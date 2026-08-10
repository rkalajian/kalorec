# Public Front-End Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the instant login-redirect at `/` with a real landing page for anonymous visitors (pitch + login CTA + a lookup box to jump to a shared profile), and add always-visible `/about` and `/how-to-use` pages.

**Architecture:** `src/lib/routing.ts` gets one new branch letting `/` through for sessionless visitors (everything else about the auth gate is unchanged). `src/pages/index.astro` branches on session presence: authenticated visitors get today's recipe list unmodified; anonymous visitors get the new landing markup. Two new static pages (`/about`, `/how-to-use`) render through the existing `Layout`. A pure, unit-tested parser (`src/lib/profileLookup.ts`) turns pasted text into a `/u/owner/repo` path; a thin client script wires it to the landing page's input.

**Tech Stack:** Astro (SSR, `output: "server"`), TypeScript, Vitest.

## Global Constraints

- No database — this feature adds no persistence. The profile lookup box is client-side parsing only, not a directory of shared profiles.
- `/` must keep redirecting a *logged-in* user with no repo configured to `/settings` — only the *no-session* case changes.
- Follow existing conventions exactly: Tailwind classes matching neighboring elements, the `Layout` `session?: Session | null` override pattern already used by `/u/*` pages, relative-import-depth conventions, and the existing lack of `.astro`/page-script test coverage (verified by `npm run build` instead, per the rest of this codebase).

---

### Task 1: Routing — let `/` through for anonymous visitors

**Files:**
- Modify: `src/lib/routing.ts`
- Test: `tests/lib/routing.test.ts`

**Interfaces:**
- Produces: `isPublicPath` also returns `true` for `/about` and `/how-to-use`. `decideRoute(null, "/")` now returns `{ proceed: true }` instead of redirecting to login. Every other `decideRoute`/`isPublicPath` behavior is unchanged, including `decideRoute(sessionNoRepo, "/")` still redirecting to `/settings`.

- [ ] **Step 1: Update the failing tests**

In `tests/lib/routing.test.ts`, replace the existing `"treats everything else as gated"` test body (it currently asserts `/` is gated, which is about to become false) with:

```ts
  it("treats everything else as gated", () => {
    expect(isPublicPath("/settings")).toBe(false);
    expect(isPublicPath("/recipes/chili")).toBe(false);
    expect(isPublicPath("/api/recipes")).toBe(false);
  });

  it("treats the about and how-to-use pages as public", () => {
    expect(isPublicPath("/about")).toBe(true);
    expect(isPublicPath("/how-to-use")).toBe(true);
  });
```

Replace the existing `"redirects to login when there is no session"` test with:

```ts
  it("redirects to login when there is no session, except at the root", () => {
    expect(decideRoute(null, "/settings")).toEqual({ redirect: "/api/auth/login" });
    expect(decideRoute(null, "/recipes/chili")).toEqual({ redirect: "/api/auth/login" });
  });

  it("shows the landing page at the root when there is no session", () => {
    expect(decideRoute(null, "/")).toEqual({ proceed: true });
  });
```

Add a new test right after the `"redirects to settings when the session has no repo chosen"` test:

```ts
  it("still redirects a logged-in, repo-less session away from the root", () => {
    expect(decideRoute(sessionNoRepo, "/")).toEqual({ redirect: "/settings" });
  });
```

(This duplicates the assertion already made by the existing `"redirects to settings when the session has no repo chosen"` test, which also checks `decideRoute(sessionNoRepo, "/")` — keep both; the new test's name makes the specific regression this task must not introduce explicit.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/routing.test.ts`
Expected: FAIL — `/about`/`/how-to-use` aren't public yet, and `decideRoute(null, "/")` still redirects to login.

- [ ] **Step 3: Update `src/lib/routing.ts`**

```ts
import type { Session } from "./session";

export type RouteDecision = { redirect: string } | { proceed: true };

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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/routing.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/routing.ts tests/lib/routing.test.ts
git commit -m "feat: let anonymous visitors reach the landing page at /

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `src/lib/profileLookup.ts` — parse pasted text into a profile path

**Files:**
- Create: `src/lib/profileLookup.ts`
- Test: `tests/lib/profileLookup.test.ts`

**Interfaces:**
- Produces: `parseProfilePath(raw: string): string | null`. Returns a `/u/{owner}/{repo}` path, or `null` if the input can't be parsed into at least an owner and a repo.

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/profileLookup.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseProfilePath } from "../../src/lib/profileLookup";

describe("parseProfilePath", () => {
  it("parses plain owner/repo shorthand", () => {
    expect(parseProfilePath("rob/recipes")).toBe("/u/rob/recipes");
  });

  it("trims surrounding whitespace", () => {
    expect(parseProfilePath("  rob/recipes  ")).toBe("/u/rob/recipes");
  });

  it("parses a full share URL", () => {
    expect(parseProfilePath("https://kalorec.netlify.app/u/rob/recipes")).toBe("/u/rob/recipes");
  });

  it("parses a share URL that points at a specific recipe, ignoring the slug", () => {
    expect(parseProfilePath("https://kalorec.netlify.app/u/rob/recipes/chili")).toBe("/u/rob/recipes");
  });

  it("parses a bare /u/owner/repo path", () => {
    expect(parseProfilePath("/u/rob/recipes")).toBe("/u/rob/recipes");
  });

  it("strips a leading scheme and host when no /u/ marker is present", () => {
    expect(parseProfilePath("https://github.com/rob/recipes")).toBe("/u/rob/recipes");
  });

  it("ignores a trailing slash", () => {
    expect(parseProfilePath("rob/recipes/")).toBe("/u/rob/recipes");
  });

  it("returns null for empty input", () => {
    expect(parseProfilePath("")).toBeNull();
    expect(parseProfilePath("   ")).toBeNull();
  });

  it("returns null when only an owner is given, no repo", () => {
    expect(parseProfilePath("rob")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/profileLookup.test.ts`
Expected: FAIL with "Cannot find module '../../src/lib/profileLookup'"

- [ ] **Step 3: Implement `src/lib/profileLookup.ts`**

```ts
export function parseProfilePath(raw: string): string | null {
  let value = raw.trim();
  if (!value) return null;

  const marker = "/u/";
  const markerIndex = value.indexOf(marker);
  if (markerIndex !== -1) {
    value = value.slice(markerIndex + marker.length);
  } else {
    value = value.replace(/^https?:\/\/[^/]+\/?/, "");
  }

  value = value.replace(/^\/+|\/+$/g, "");
  const parts = value.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  const [owner, repo] = parts;
  return `/u/${owner}/${repo}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/profileLookup.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/profileLookup.ts tests/lib/profileLookup.test.ts
git commit -m "feat: add profile-lookup path parser

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `profile-lookup.ts` client script

**Files:**
- Create: `src/scripts/profile-lookup.ts`

**Interfaces:**
- Consumes: `parseProfilePath` from `../lib/profileLookup` (Task 2). DOM contract (Task 5 will produce this markup): `#profile-lookup` (text input), `#profile-lookup-button` (button), `#profile-lookup-message` (error text element).
- Produces: clicking the button navigates to the parsed path, or shows an inline error message when the input doesn't parse.

- [ ] **Step 1: Create `src/scripts/profile-lookup.ts`**

```ts
import { parseProfilePath } from "../lib/profileLookup";

const button = document.getElementById("profile-lookup-button");
const input = document.getElementById("profile-lookup") as HTMLInputElement | null;
const message = document.getElementById("profile-lookup-message");

if (button && input) {
  button.addEventListener("click", () => {
    const path = parseProfilePath(input.value);
    if (!path) {
      if (message) message.textContent = "Enter a profile like owner/repo, or paste a share link.";
      return;
    }
    window.location.href = path;
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/scripts/profile-lookup.ts
git commit -m "feat: wire up profile-lookup box behavior

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Nav — About / How to Use links

**Files:**
- Modify: `src/layouts/Layout.astro`

**Interfaces:**
- Produces: "About" (`/about`) and "How to Use" (`/how-to-use`) links, always rendered in the header regardless of session state.

- [ ] **Step 1: Update `src/layouts/Layout.astro`**

Read the current file, then replace the `<header>` block with:

```astro
    <header class="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
      <a href="/" class="text-lg font-semibold tracking-tight text-zinc-900 no-underline dark:text-zinc-100">Kalorec</a>
      <div class="flex items-center gap-3">
        <a href="/about" class="text-sm text-zinc-600 no-underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">About</a>
        <a href="/how-to-use" class="text-sm text-zinc-600 no-underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">How to Use</a>
        {session ? (
          <>
            <a href="/recipes/new" class="inline-block rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white no-underline hover:bg-green-800 dark:bg-green-700 dark:hover:bg-green-800">+ New Recipe</a>
            <a href="/settings" class="text-sm text-zinc-600 no-underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">{session.githubLogin}</a>
            <form method="POST" action="/api/auth/logout">
              <button type="submit" class="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">Log out</button>
            </form>
          </>
        ) : (
          <a href="/api/auth/login" class="text-sm text-zinc-600 no-underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">Log in</a>
        )}
      </div>
    </header>
```

Everything else in the file (frontmatter, `<main>`, closing tags) is unchanged.

- [ ] **Step 2: Run `npm run build` to verify the project still builds cleanly**

Run: `npm run build`
Expected: builds cleanly (no `.astro` test suite in this codebase — this is the verification step)

- [ ] **Step 3: Commit**

```bash
git add src/layouts/Layout.astro
git commit -m "feat: add About and How to Use links to the header

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Landing page — `src/pages/index.astro` branches on session

**Files:**
- Modify: `src/pages/index.astro`

**Interfaces:**
- Consumes: `parseProfilePath`'s DOM contract via `src/scripts/profile-lookup.ts` (Task 3), `Layout` with `session` prop (already supports override), `RecipeCard` (unchanged usage).

- [ ] **Step 1: Update `src/pages/index.astro`**

Read the current file, then replace its entire contents with:

```astro
---
import Layout from "../layouts/Layout.astro";
import RecipeCard from "../components/RecipeCard.astro";
import { getStore } from "../lib/store";
import { SESSION_COOKIE } from "../lib/session";
import type { Recipe } from "../lib/recipe";

// Astro.locals.session is typed as always-present, but the routing rule for
// "/" now lets anonymous visitors through to see the landing page below
// instead of the recipe list.
const { session } = Astro.locals;

let recipes: Recipe[] = [];
let allTags: string[] = [];

if (session) {
  const store = getStore({ accessToken: session.accessToken, repo: session.repo! });
  try {
    recipes = await store.list();
  } catch (err: any) {
    if (err.status === 401) {
      Astro.cookies.delete(SESSION_COOKIE, { path: "/" });
      return Astro.redirect("/logged-out?error=session_expired");
    }
    if (err.status === 403) {
      return Astro.redirect("/settings?error=no_access");
    }
    throw err;
  }
  recipes.sort((a, b) => a.title.localeCompare(b.title));
  allTags = Array.from(new Set(recipes.flatMap((r) => r.tags))).sort();
}
---
<Layout title={session ? "Recipes" : "Home"} session={session}>
  {session ? (
    <>
      <h1 class="text-2xl font-semibold tracking-tight">Recipes</h1>

      <div class="mt-4 flex flex-col gap-3">
        <input
          type="search"
          id="search-input"
          placeholder="Search recipes..."
          class="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <div id="tag-filters" class="flex flex-wrap gap-1.5">
          {allTags.map((tag) => (
            <button
              type="button"
              aria-pressed="false"
              class="tag-filter rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 aria-pressed:bg-green-700 aria-pressed:text-white dark:aria-pressed:bg-green-700"
              data-tag={tag}
            >{tag}</button>
          ))}
        </div>
      </div>

      {recipes.length === 0 ? (
        <p class="mt-6 text-zinc-600 dark:text-zinc-400">No recipes yet. <a href="/recipes/new" class="text-green-700 dark:text-green-400">Add your first one</a>.</p>
      ) : (
        <div id="recipe-grid" class="mt-4 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {recipes.map((recipe) => <RecipeCard recipe={recipe} />)}
        </div>
      )}
    </>
  ) : (
    <div class="py-8">
      <h1 class="text-3xl font-semibold tracking-tight">Your recipes, backed by your own GitHub repo</h1>
      <p class="mt-4 max-w-xl text-zinc-600 dark:text-zinc-400">
        Kalorec stores every recipe as a plain JSON file in a GitHub repo you choose — not a database you don't control. It's yours, portable, and versioned like the rest of your code.
      </p>
      <a href="/api/auth/login" class="mt-6 inline-block rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white no-underline hover:bg-green-800 dark:bg-green-700 dark:hover:bg-green-800">Log in with GitHub</a>

      <div class="mt-10 max-w-md rounded-md border border-zinc-200 p-4 dark:border-zinc-700">
        <label for="profile-lookup" class="block text-sm font-medium">View a shared profile</label>
        <p class="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Paste a profile link, or type <code>owner/repo</code>.</p>
        <div class="mt-2 flex gap-2">
          <input
            type="text"
            id="profile-lookup"
            placeholder="owner/repo"
            class="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <button type="button" id="profile-lookup-button" class="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">View</button>
        </div>
        <p id="profile-lookup-message" class="mt-2 min-h-5 text-sm text-red-600 dark:text-red-400" role="alert"></p>
      </div>
    </div>
  )}
</Layout>

<script src="../scripts/recipe-list.ts"></script>
<script src="../scripts/profile-lookup.ts"></script>
```

Both scripts are safe to include unconditionally: `recipe-list.ts` already guards on `#search-input`/`#recipe-grid` existing (a no-op on the landing page), and `profile-lookup.ts` guards on `#profile-lookup-button`/`#profile-lookup` existing (a no-op on the recipe list page).

- [ ] **Step 2: Run `npm run build` to verify the project still builds cleanly**

Run: `npm run build`
Expected: builds cleanly

- [ ] **Step 3: Commit**

```bash
git add src/pages/index.astro
git commit -m "feat: add landing page for anonymous visitors at /

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: About page

**Files:**
- Create: `src/pages/about.astro`

- [ ] **Step 1: Create `src/pages/about.astro`**

```astro
---
import Layout from "../layouts/Layout.astro";
---
<Layout title="About">
  <h1 class="text-2xl font-semibold tracking-tight">About Kalorec</h1>
  <p class="mt-4 text-zinc-700 dark:text-zinc-300">
    Kalorec is a recipe manager that stores your recipes as plain JSON files in a GitHub repo you choose — not a database you don't control. Add recipes by hand or import them from a link, tag and search them, and edit them like any other file in your repo.
  </p>
  <p class="mt-4 text-zinc-700 dark:text-zinc-300">
    Because your data lives in your own repo, it's portable and versioned like the rest of your code — no lock-in, no export step. You can also mark individual recipes public and share a read-only link to them, letting anyone view your public recipes and copy the ones they like into their own repo.
  </p>
  <p class="mt-4 text-zinc-700 dark:text-zinc-300">
    New here? See <a href="/how-to-use" class="text-green-700 dark:text-green-400">How to Use</a>.
  </p>
</Layout>
```

This page doesn't pass a `session` prop to `Layout` — the default fallback to `Astro.locals.session` is exactly right here, since `/about` is reachable both logged in and out and should show whichever nav state actually applies.

- [ ] **Step 2: Run `npm run build` to verify the project still builds cleanly**

Run: `npm run build`
Expected: builds cleanly

- [ ] **Step 3: Commit**

```bash
git add src/pages/about.astro
git commit -m "feat: add About page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: How to Use page

**Files:**
- Create: `src/pages/how-to-use.astro`

- [ ] **Step 1: Create `src/pages/how-to-use.astro`**

```astro
---
import Layout from "../layouts/Layout.astro";
---
<Layout title="How to Use">
  <h1 class="text-2xl font-semibold tracking-tight">How to use Kalorec</h1>
  <ol class="mt-4 list-decimal space-y-3 pl-5 text-zinc-700 dark:text-zinc-300">
    <li>Log in with GitHub.</li>
    <li>Pick (or create) a repo in Settings — that's where your recipes will live.</li>
    <li>Add a recipe: type it in by hand, or paste a link to import it automatically.</li>
    <li>Optionally check "Make this recipe public," then copy your share link from Settings to let others view it.</li>
    <li>Browse a shared profile and click "Add to my recipes" to copy someone else's public recipe into your own repo.</li>
  </ol>
</Layout>
```

Same reasoning as Task 6: no `session` prop override needed.

- [ ] **Step 2: Run `npm run build` to verify the project still builds cleanly**

Run: `npm run build`
Expected: builds cleanly

- [ ] **Step 3: Commit**

```bash
git add src/pages/how-to-use.astro
git commit -m "feat: add How to Use page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including every new/updated test from Tasks 1-2.

- [ ] **Step 2: Build the project**

Run: `npm run build`
Expected: builds cleanly — this is the primary check for the `.astro` files touched in Tasks 3-7, which have no unit test coverage in this codebase.

- [ ] **Step 3: Fix any failures**

If `npm test` or `npm run build` fail, fix the reported issue in the relevant task's files and re-run both commands before proceeding. Do not commit broken state.

- [ ] **Step 4: Manual smoke check (optional but recommended)**

Run `npm run dev`, then:
1. Visit `/` in a private/incognito window (no session) — confirm the landing page renders (pitch + "Log in with GitHub" + lookup box), not an instant redirect to GitHub.
2. In the lookup box, enter a known public profile's `owner/repo` (or paste its full share URL) and click View — confirm it navigates to `/u/owner/repo`.
3. Enter garbage text (e.g. `"nonsense"`) and click View — confirm the inline error message appears and nothing navigates.
4. Visit `/about` and `/how-to-use` while logged out — confirm both render with the anonymous nav (About/How to Use/Log in).
5. Log in, confirm `/` still shows your normal recipe list (unchanged), and `/about`/`/how-to-use` now show the logged-in nav (+ New Recipe / account / log out) alongside About/How to Use.
6. Log in with an account that has no repo configured yet, visit `/` — confirm you're still redirected to `/settings` (this must NOT have regressed).

This step has no pass/fail gate in CI — it's a final sanity pass on the golden path before calling the feature done.
