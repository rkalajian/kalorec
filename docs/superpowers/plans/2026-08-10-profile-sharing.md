# Public Profile Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user share a public, read-only link to the recipes they've opted into making public, and let any logged-in viewer copy a shared recipe into their own repo.

**Architecture:** New `/u/[owner]/[repo]` and `/u/[owner]/[repo]/[slug]` routes read the target repo through an **unauthenticated** Octokit client (no session needed), filtering to recipes with `public === true`. No new persistence — public repos only. A new `POST /api/recipes/copy` route re-fetches the source recipe unauthenticated, then writes it into the caller's own repo via the existing authenticated store.

**Tech Stack:** Astro (SSR, `output: "server"`), TypeScript, `@octokit/rest`, Vitest.

## Global Constraints

- No database — session cookie remains the only server-side state (per `docs/superpowers/specs/2026-08-10-profile-sharing-design.md`).
- Public sharing requires the target GitHub repo to be public; private repos are not supported and are not silently proxied.
- Copies always start `public: false` regardless of the source recipe's visibility.
- `resolveRepoSelection` always pins `branch` to the repo's `default_branch` — the public routes may omit `ref` entirely and still match.
- Follow existing code conventions exactly: same error-handling shape (401 clears cookie, 403 "no push access", 502 wraps `err.message`), same Tailwind class conventions, same relative-import depth conventions.

---

### Task 1: `Recipe.public` field + optional branch on `RecipeStore`

**Files:**
- Modify: `src/lib/recipe.ts`
- Modify: `src/lib/github.ts`
- Test: `tests/lib/github.test.ts`

**Interfaces:**
- Produces: `Recipe.public?: boolean` (undefined/false = private). `GithubStoreConfig.branch?: string` — when omitted, reads use GitHub's default branch (no `ref` param sent); writes (`create`/`update`/`remove`) still require a branch and assert it's present.

- [ ] **Step 1: Write the failing tests**

Add to `tests/lib/github.test.ts`, inside the `describe("RecipeStore", ...)` block (after the existing `"gets a single recipe with its sha"` test is fine):

```ts
  it("lists recipes without a ref when no branch is configured", async () => {
    const getContent = vi.fn(async ({ path }: { path: string }) => {
      if (path === "data/recipes") {
        return { data: [{ type: "file", name: "chili.json", path: "data/recipes/chili.json" }] };
      }
      return { data: { type: "file", content: b64(sampleRecipe), sha: "sha-1" } };
    });
    const client = { repos: { getContent, createOrUpdateFileContents: vi.fn(), deleteFile: vi.fn() } };
    const store = new RecipeStore(client as any, { owner: "rob", repo: "recipes" });
    await store.list();
    for (const call of getContent.mock.calls) {
      expect(call[0]).not.toHaveProperty("ref");
    }
  });

  it("gets a recipe without a ref when no branch is configured", async () => {
    const getContent = vi.fn(async () => ({ data: { type: "file", content: b64(sampleRecipe), sha: "sha-1" } }));
    const client = { repos: { getContent, createOrUpdateFileContents: vi.fn(), deleteFile: vi.fn() } };
    const store = new RecipeStore(client as any, { owner: "rob", repo: "recipes" });
    await store.get("chili");
    expect(getContent.mock.calls[0][0]).not.toHaveProperty("ref");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/github.test.ts`
Expected: FAIL — current code always sends `ref: branch`, and `branch` is required so `{ owner: "rob", repo: "recipes" }` fails to type-check / `ref: undefined` would be sent instead of omitted.

- [ ] **Step 3: Add `public` to `Recipe`**

In `src/lib/recipe.ts`, in the `Recipe` interface, add after `tags: string[];`:

```ts
  public?: boolean;
```

- [ ] **Step 4: Make `branch` optional and conditionally include `ref`**

In `src/lib/github.ts`:

```ts
export interface GithubStoreConfig {
  owner: string;
  repo: string;
  branch?: string;
}
```

Replace the body of `list()`'s `getContent` call:

```ts
      const res = await this.client.repos.getContent({
        owner,
        repo,
        path: RECIPES_DIR,
        ...(branch ? { ref: branch } : {}),
      });
```

Replace the body of `get()`'s `getContent` call:

```ts
      const res = await this.client.repos.getContent({
        owner,
        repo,
        path: this.path(slug),
        ...(branch ? { ref: branch } : {}),
      });
```

In `create()`, `update()`, and `remove()`, change the destructured `branch` usage in the call to `branch!` (writes are never invoked without a configured branch — only reads go through the unauthenticated public path):

```ts
      branch: branch!,
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/lib/github.test.ts`
Expected: PASS (all tests, including the two new ones)

- [ ] **Step 6: Commit**

```bash
git add src/lib/recipe.ts src/lib/github.ts tests/lib/github.test.ts
git commit -m "feat: add Recipe.public flag and optional RecipeStore branch

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `RepoRef` gains a `private` flag

**Files:**
- Modify: `src/lib/session.ts`
- Modify: `src/lib/repos.ts`
- Modify: `tests/lib/repos.test.ts`
- Modify: `tests/pages/api/settings/repo.test.ts`

**Interfaces:**
- Produces: `RepoRef.private: boolean`. `resolveRepoSelection(...)` returns `{ owner, name, branch, private }`.

- [ ] **Step 1: Update the failing tests**

In `tests/lib/repos.test.ts`, replace the `"returns owner/name/branch when push access is confirmed"` test body with:

```ts
  it("returns owner/name/branch/private when push access is confirmed", async () => {
    const client = {
      repos: {
        listForAuthenticatedUser: vi.fn(),
        get: vi.fn(async () => ({ data: { default_branch: "main", private: true, permissions: { push: true } } })),
      },
    };
    const result = await resolveRepoSelection(client as any, "rob", "recipes");
    expect(result).toEqual({ owner: "rob", name: "recipes", branch: "main", private: true });
  });
```

In `tests/pages/api/settings/repo.test.ts`, update the first test (`"selects a repo the user has push access to and redirects home"`): change the mock and final assertion:

```ts
    mockOctokitInstance.repos.get.mockResolvedValue({ data: { default_branch: "main", private: true, permissions: { push: true } } });
```

```ts
    expect(decryptSession(value, "test-secret-value")).toEqual({
      githubLogin: "rob",
      accessToken: "tok",
      repo: { owner: "rob", name: "recipes", branch: "main", private: true },
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/repos.test.ts tests/pages/api/settings/repo.test.ts`
Expected: FAIL — actual result is missing `private`.

- [ ] **Step 3: Update `RepoRef` and `resolveRepoSelection`**

In `src/lib/session.ts`, update `RepoRef`:

```ts
export interface RepoRef {
  owner: string;
  name: string;
  branch: string;
  private: boolean;
}
```

In `src/lib/repos.ts`, update `resolveRepoSelection`:

```ts
export async function resolveRepoSelection(
  client: RepoClient,
  owner: string,
  name: string
): Promise<{ owner: string; name: string; branch: string; private: boolean }> {
  const res = await client.repos.get({ owner, repo: name });
  if (!res.data.permissions?.push) {
    throw new Error(`No push access to ${owner}/${name}`);
  }
  return { owner, name, branch: res.data.default_branch, private: res.data.private };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/repos.test.ts tests/pages/api/settings/repo.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/session.ts src/lib/repos.ts tests/lib/repos.test.ts tests/pages/api/settings/repo.test.ts
git commit -m "feat: track repo visibility on RepoRef

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `src/lib/publicStore.ts` — unauthenticated read access

**Files:**
- Create: `src/lib/publicStore.ts`
- Test: `tests/lib/publicStore.test.ts`

**Interfaces:**
- Consumes: `RecipeStore` from `./github` (Task 1), `Recipe` from `./recipe` (Task 1).
- Produces: `getPublicStore(owner: string, repo: string): RecipeStore`, `listPublicRecipes(owner: string, repo: string): Promise<Recipe[]>`, `getPublicRecipe(owner: string, repo: string, slug: string): Promise<Recipe | null>`.

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/publicStore.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Octokit } from "@octokit/rest";
import { getPublicStore, listPublicRecipes, getPublicRecipe } from "../../src/lib/publicStore";

const mockOctokitInstance = { repos: { getContent: vi.fn() } };
vi.mock("@octokit/rest", () => ({ Octokit: vi.fn(() => mockOctokitInstance) }));

function b64(obj: unknown) {
  return Buffer.from(JSON.stringify(obj)).toString("base64");
}

const publicRecipe = {
  slug: "chili",
  title: "Chili",
  public: true,
  tags: [],
  ingredients: ["beef"],
  instructions: ["cook"],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const privateRecipe = {
  slug: "secret",
  title: "Secret",
  public: false,
  tags: [],
  ingredients: [],
  instructions: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("getPublicStore", () => {
  beforeEach(() => vi.clearAllMocks());

  it("authenticates Octokit with no token", () => {
    getPublicStore("rob", "recipes");
    expect(Octokit).toHaveBeenCalledWith();
  });
});

describe("listPublicRecipes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns only recipes marked public", async () => {
    mockOctokitInstance.repos.getContent.mockImplementation(async ({ path }: { path: string }) => {
      if (path === "data/recipes") {
        return {
          data: [
            { type: "file", name: "chili.json", path: "data/recipes/chili.json" },
            { type: "file", name: "secret.json", path: "data/recipes/secret.json" },
          ],
        };
      }
      if (path === "data/recipes/chili.json") {
        return { data: { type: "file", content: b64(publicRecipe), sha: "sha-1" } };
      }
      return { data: { type: "file", content: b64(privateRecipe), sha: "sha-2" } };
    });
    const recipes = await listPublicRecipes("rob", "recipes");
    expect(recipes).toEqual([publicRecipe]);
  });
});

describe("getPublicRecipe", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the recipe when it exists and is public", async () => {
    mockOctokitInstance.repos.getContent.mockResolvedValue({
      data: { type: "file", content: b64(publicRecipe), sha: "sha-1" },
    });
    expect(await getPublicRecipe("rob", "recipes", "chili")).toEqual(publicRecipe);
  });

  it("returns null when the recipe exists but is not public", async () => {
    mockOctokitInstance.repos.getContent.mockResolvedValue({
      data: { type: "file", content: b64(privateRecipe), sha: "sha-2" },
    });
    expect(await getPublicRecipe("rob", "recipes", "secret")).toBeNull();
  });

  it("returns null when the recipe does not exist", async () => {
    mockOctokitInstance.repos.getContent.mockImplementation(async () => {
      const err: any = new Error("Not Found");
      err.status = 404;
      throw err;
    });
    expect(await getPublicRecipe("rob", "recipes", "missing")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/publicStore.test.ts`
Expected: FAIL with "Cannot find module '../../src/lib/publicStore'"

- [ ] **Step 3: Implement `src/lib/publicStore.ts`**

```ts
import { Octokit } from "@octokit/rest";
import { RecipeStore } from "./github";
import type { Recipe } from "./recipe";

export function getPublicStore(owner: string, repo: string): RecipeStore {
  return new RecipeStore(new Octokit(), { owner, repo });
}

export async function listPublicRecipes(owner: string, repo: string): Promise<Recipe[]> {
  const recipes = await getPublicStore(owner, repo).list();
  return recipes.filter((recipe) => recipe.public === true);
}

export async function getPublicRecipe(owner: string, repo: string, slug: string): Promise<Recipe | null> {
  const stored = await getPublicStore(owner, repo).get(slug);
  if (!stored || stored.recipe.public !== true) return null;
  return stored.recipe;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/publicStore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/publicStore.ts tests/lib/publicStore.test.ts
git commit -m "feat: add unauthenticated public recipe reads

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `src/lib/copyAction.ts` — viewer-state → CTA logic

**Files:**
- Create: `src/lib/copyAction.ts`
- Test: `tests/lib/copyAction.test.ts`

**Interfaces:**
- Consumes: `Session` from `./session` (Task 2's `RepoRef` shape).
- Produces: `type CopyAction = { type: "login" } | { type: "settings" } | { type: "copy"; owner: string; repo: string }`, `resolveCopyAction(session: Session | null): CopyAction`.

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/copyAction.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveCopyAction } from "../../src/lib/copyAction";

describe("resolveCopyAction", () => {
  it("returns login when there is no session", () => {
    expect(resolveCopyAction(null)).toEqual({ type: "login" });
  });

  it("returns settings when logged in without a configured repo", () => {
    expect(resolveCopyAction({ githubLogin: "rob", accessToken: "tok", repo: null })).toEqual({
      type: "settings",
    });
  });

  it("returns copy with the owner/repo when a repo is configured", () => {
    expect(
      resolveCopyAction({
        githubLogin: "rob",
        accessToken: "tok",
        repo: { owner: "rob", name: "recipes", branch: "main", private: false },
      })
    ).toEqual({ type: "copy", owner: "rob", repo: "recipes" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/copyAction.test.ts`
Expected: FAIL with "Cannot find module '../../src/lib/copyAction'"

- [ ] **Step 3: Implement `src/lib/copyAction.ts`**

```ts
import type { Session } from "./session";

export type CopyAction =
  | { type: "login" }
  | { type: "settings" }
  | { type: "copy"; owner: string; repo: string };

export function resolveCopyAction(session: Session | null): CopyAction {
  if (!session) return { type: "login" };
  if (!session.repo) return { type: "settings" };
  return { type: "copy", owner: session.repo.owner, repo: session.repo.name };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/copyAction.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/copyAction.ts tests/lib/copyAction.test.ts
git commit -m "feat: add resolveCopyAction viewer-state helper

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: `isPublicPath` allows `/u/*`

**Files:**
- Modify: `src/lib/routing.ts`
- Modify: `tests/lib/routing.test.ts`

**Interfaces:**
- Produces: `isPublicPath("/u/...")` → `true`.

- [ ] **Step 1: Write the failing tests**

In `tests/lib/routing.test.ts`, add inside `describe("isPublicPath", ...)`:

```ts
  it("treats public profile pages as public", () => {
    expect(isPublicPath("/u/rob/recipes")).toBe(true);
    expect(isPublicPath("/u/rob/recipes/chili")).toBe(true);
  });
```

Add inside `describe("decideRoute", ...)`:

```ts
  it("proceeds on public profile pages even with no session", () => {
    expect(decideRoute(null, "/u/rob/recipes")).toEqual({ proceed: true });
    expect(decideRoute(null, "/u/rob/recipes/chili")).toEqual({ proceed: true });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/routing.test.ts`
Expected: FAIL — `/u/rob/recipes` currently redirects to login.

- [ ] **Step 3: Update `isPublicPath`**

In `src/lib/routing.ts`:

```ts
export function isPublicPath(pathname: string): boolean {
  return pathname.startsWith("/api/auth/") || pathname === "/logged-out" || pathname.startsWith("/u/");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/routing.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/routing.ts tests/lib/routing.test.ts
git commit -m "feat: treat /u/* profile pages as public routes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Recipe create/update routes pass through `public`

**Files:**
- Modify: `src/pages/api/recipes/index.ts`
- Modify: `src/pages/api/recipes/[slug].ts`
- Modify: `tests/api/recipes.test.ts`

**Interfaces:**
- Produces: `POST /api/recipes` accepts `public: boolean` (default `false`). `PUT /api/recipes/[slug]` accepts `public: boolean`, leaves it untouched when omitted (same pattern as `servings`, `sourceUrl`, etc.).

- [ ] **Step 1: Write the failing tests**

In `tests/api/recipes.test.ts`, add inside `describe("POST /api/recipes", ...)`:

```ts
  it("defaults public to false when omitted", async () => {
    mockStore.list.mockResolvedValue([]);
    mockStore.create.mockResolvedValue(undefined);
    await POST({
      request: jsonRequest("http://localhost/api/recipes", "POST", { title: "Chili" }),
      locals: { session: fakeSession },
    } as any);
    expect(mockStore.create).toHaveBeenCalledWith(expect.objectContaining({ public: false }));
  });

  it("sets public to true when requested", async () => {
    mockStore.list.mockResolvedValue([]);
    mockStore.create.mockResolvedValue(undefined);
    await POST({
      request: jsonRequest("http://localhost/api/recipes", "POST", { title: "Chili", public: true }),
      locals: { session: fakeSession },
    } as any);
    expect(mockStore.create).toHaveBeenCalledWith(expect.objectContaining({ public: true }));
  });
```

Add inside `describe("PUT /api/recipes/[slug]", ...)`:

```ts
  it("updates the public flag when provided", async () => {
    mockStore.get.mockResolvedValue({ recipe: { ...existingRecipe, public: false }, sha: "sha-1" });
    mockStore.update.mockResolvedValue(undefined);
    await PUT({
      params: { slug: "chili" },
      request: jsonRequest("http://localhost/api/recipes/chili", "PUT", { title: "Chili", public: true }),
      locals: { session: fakeSession },
    } as any);
    expect(mockStore.update).toHaveBeenCalledWith(expect.objectContaining({ public: true }), "sha-1");
  });

  it("leaves the public flag untouched when omitted from the body", async () => {
    mockStore.get.mockResolvedValue({ recipe: { ...existingRecipe, public: true }, sha: "sha-1" });
    mockStore.update.mockResolvedValue(undefined);
    await PUT({
      params: { slug: "chili" },
      request: jsonRequest("http://localhost/api/recipes/chili", "PUT", { title: "Chili" }),
      locals: { session: fakeSession },
    } as any);
    expect(mockStore.update).toHaveBeenCalledWith(expect.objectContaining({ public: true }), "sha-1");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/api/recipes.test.ts`
Expected: FAIL — `public` is currently ignored, so `mockStore.create`/`update` are called without it (`objectContaining` sees `public: undefined`, not `false`/`true`).

- [ ] **Step 3: Implement**

In `src/pages/api/recipes/index.ts`, add to the `recipe` object literal (after `tags: normalizeTags(body.tags),`):

```ts
    public: Boolean(body.public),
```

In `src/pages/api/recipes/[slug].ts`, add to the `updated` object literal (after `tags: body.tags !== undefined ? normalizeTags(body.tags) : existing.recipe.tags,`):

```ts
    public: body.public !== undefined ? Boolean(body.public) : existing.recipe.public,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/api/recipes.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/recipes/index.ts "src/pages/api/recipes/[slug].ts" tests/api/recipes.test.ts
git commit -m "feat: accept public flag on recipe create/update

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: `POST /api/recipes/copy`

**Files:**
- Create: `src/pages/api/recipes/copy.ts`
- Test: `tests/api/recipes-copy.test.ts`

**Interfaces:**
- Consumes: `getPublicRecipe` (Task 3), `getStore` from `../../../lib/store`, `slugify`/`dedupeSlug` from `../../../lib/recipe` (existing), `SESSION_COOKIE` from `../../../lib/session`.
- Produces: `POST` handler. Body `{ owner: string; repo: string; slug: string }` (source). Response `{ slug }` (destination), status 201. Errors: 400 (bad body), 404 (source not found/not public), 409 (no destination repo configured), 401/403/502 (matching existing store-backed routes).

- [ ] **Step 1: Write the failing tests**

Create `tests/api/recipes-copy.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockStore = { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() };
vi.mock("../../src/lib/store", () => ({ getStore: vi.fn(() => mockStore) }));

const mockGetPublicRecipe = vi.fn();
vi.mock("../../src/lib/publicStore", () => ({ getPublicRecipe: (...args: any[]) => mockGetPublicRecipe(...args) }));

import { getStore } from "../../src/lib/store";
import { POST } from "../../src/pages/api/recipes/copy";

const fakeSession = { accessToken: "tok", repo: { owner: "rob", name: "recipes", branch: "main", private: false } };

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/recipes/copy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const sourceRecipe = {
  slug: "chili",
  title: "Chili",
  public: true,
  tags: ["dinner"],
  ingredients: ["beef"],
  instructions: ["cook"],
  createdAt: "2020-01-01T00:00:00.000Z",
  updatedAt: "2020-01-01T00:00:00.000Z",
};

describe("POST /api/recipes/copy", () => {
  beforeEach(() => vi.clearAllMocks());

  it("copies a public recipe into the caller's repo as private with a fresh slug", async () => {
    mockGetPublicRecipe.mockResolvedValue(sourceRecipe);
    mockStore.list.mockResolvedValue([{ slug: "chili" }]);
    mockStore.create.mockResolvedValue(undefined);

    const response = await POST({
      request: jsonRequest({ owner: "amy", repo: "cookbook", slug: "chili" }),
      locals: { session: fakeSession },
    } as any);

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.slug).toBe("chili-2");
    expect(mockGetPublicRecipe).toHaveBeenCalledWith("amy", "cookbook", "chili");
    expect(getStore).toHaveBeenCalledWith({ accessToken: fakeSession.accessToken, repo: fakeSession.repo });
    expect(mockStore.create).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "chili-2", title: "Chili", public: false })
    );
  });

  it("returns 404 when the source recipe is missing or not public", async () => {
    mockGetPublicRecipe.mockResolvedValue(null);
    const response = await POST({
      request: jsonRequest({ owner: "amy", repo: "cookbook", slug: "chili" }),
      locals: { session: fakeSession },
    } as any);
    expect(response.status).toBe(404);
    expect(mockStore.create).not.toHaveBeenCalled();
  });

  it("returns 409 when the caller has no repo configured", async () => {
    const response = await POST({
      request: jsonRequest({ owner: "amy", repo: "cookbook", slug: "chili" }),
      locals: { session: { accessToken: "tok", repo: null } },
    } as any);
    expect(response.status).toBe(409);
    expect(mockGetPublicRecipe).not.toHaveBeenCalled();
  });

  it("returns 400 when owner, repo, or slug is missing", async () => {
    const response = await POST({
      request: jsonRequest({ owner: "amy" }),
      locals: { session: fakeSession },
    } as any);
    expect(response.status).toBe(400);
  });

  it("returns 400 on malformed JSON body", async () => {
    const response = await POST({
      request: new Request("http://localhost/api/recipes/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      }),
      locals: { session: fakeSession },
    } as any);
    expect(response.status).toBe(400);
  });

  it("returns 401 and clears the session cookie when the destination GitHub token is revoked", async () => {
    mockGetPublicRecipe.mockResolvedValue(sourceRecipe);
    mockStore.list.mockRejectedValue(Object.assign(new Error("Bad credentials"), { status: 401 }));
    const cookieDelete = vi.fn();
    const response = await POST({
      request: jsonRequest({ owner: "amy", repo: "cookbook", slug: "chili" }),
      locals: { session: fakeSession },
      cookies: { delete: cookieDelete },
    } as any);
    expect(response.status).toBe(401);
    expect(cookieDelete).toHaveBeenCalled();
  });

  it("returns 502 when the source recipe fetch fails", async () => {
    mockGetPublicRecipe.mockRejectedValue(new Error("network error"));
    const response = await POST({
      request: jsonRequest({ owner: "amy", repo: "cookbook", slug: "chili" }),
      locals: { session: fakeSession },
    } as any);
    expect(response.status).toBe(502);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/api/recipes-copy.test.ts`
Expected: FAIL with "Cannot find module '../../src/pages/api/recipes/copy'"

- [ ] **Step 3: Implement `src/pages/api/recipes/copy.ts`**

```ts
import type { APIRoute } from "astro";
import { getStore } from "../../../lib/store";
import { getPublicRecipe } from "../../../lib/publicStore";
import { slugify, dedupeSlug, type Recipe } from "../../../lib/recipe";
import { SESSION_COOKIE } from "../../../lib/session";

export const POST: APIRoute = async ({ request, locals, cookies }) => {
  if (!locals.session.repo) {
    return new Response(
      JSON.stringify({ error: "Configure a recipe repo in Settings before copying recipes" }),
      { status: 409 }
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }
  if (
    typeof body.owner !== "string" || !body.owner ||
    typeof body.repo !== "string" || !body.repo ||
    typeof body.slug !== "string" || !body.slug
  ) {
    return new Response(JSON.stringify({ error: "owner, repo, and slug are required" }), { status: 400 });
  }

  let source: Recipe | null;
  try {
    source = await getPublicRecipe(body.owner, body.repo, body.slug);
  } catch (err: any) {
    return new Response(JSON.stringify({ error: `Failed to load source recipe: ${err.message}` }), { status: 502 });
  }
  if (!source) {
    return new Response(JSON.stringify({ error: "Recipe not found" }), { status: 404 });
  }

  const store = getStore({ accessToken: locals.session.accessToken, repo: locals.session.repo });

  let existing;
  try {
    existing = await store.list();
  } catch (err: any) {
    if (err.status === 401) {
      cookies.delete(SESSION_COOKIE, { path: "/" });
      return new Response(JSON.stringify({ error: "Session expired, please log in again" }), { status: 401 });
    }
    if (err.status === 403) {
      return new Response(
        JSON.stringify({ error: "No push access to this repository — update it in Settings" }),
        { status: 403 }
      );
    }
    return new Response(JSON.stringify({ error: `Failed to load recipes: ${err.message}` }), { status: 502 });
  }

  const slug = dedupeSlug(slugify(source.title), existing.map((r) => r.slug));
  const now = new Date().toISOString();
  const recipe: Recipe = { ...source, slug, public: false, createdAt: now, updatedAt: now };

  try {
    await store.create(recipe);
  } catch (err: any) {
    if (err.status === 401) {
      cookies.delete(SESSION_COOKIE, { path: "/" });
      return new Response(JSON.stringify({ error: "Session expired, please log in again" }), { status: 401 });
    }
    if (err.status === 403) {
      return new Response(
        JSON.stringify({ error: "No push access to this repository — update it in Settings" }),
        { status: 403 }
      );
    }
    return new Response(JSON.stringify({ error: `Failed to save recipe: ${err.message}` }), { status: 502 });
  }

  return new Response(JSON.stringify({ slug }), { status: 201 });
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/api/recipes-copy.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/recipes/copy.ts tests/api/recipes-copy.test.ts
git commit -m "feat: add endpoint to copy a public recipe into your own repo

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: `Layout.astro` anonymous mode

**Files:**
- Modify: `src/layouts/Layout.astro`

**Interfaces:**
- Produces: `Layout` accepts an optional `session?: Session | null` prop. When omitted, behaves exactly as before (reads `Astro.locals.session`). When explicitly passed `null`, renders a "Log in" link instead of the account menu.

No unit tests exist for `.astro` files in this codebase (verified: no `tests/**/*.astro.test.ts` anywhere) — this task is verified by a full build instead, in Task 15.

- [ ] **Step 1: Update `src/layouts/Layout.astro`**

Read the current file (`src/layouts/Layout.astro`) then apply:

```astro
---
import "../styles/global.css";
import type { Session } from "../lib/session";

interface Props {
  title: string;
  session?: Session | null;
}
const { title } = Astro.props;
const session = Astro.props.session !== undefined ? Astro.props.session : Astro.locals.session;
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{title} · Recipes</title>
  </head>
  <body class="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
    <header class="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
      <a href="/" class="text-lg font-semibold tracking-tight text-zinc-900 no-underline dark:text-zinc-100">Recipes</a>
      <div class="flex items-center gap-3">
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
    <main class="mx-auto max-w-3xl p-6">
      <slot />
    </main>
  </body>
</html>
```

This is a pure superset of the current behavior: every existing call site (`index.astro`, `recipes/[slug].astro`, `recipes/[slug]/edit.astro`, `recipes/new.astro`, `settings.astro`) doesn't pass `session`, so `Astro.props.session` is `undefined` there and the ternary falls through to `Astro.locals.session` exactly as before.

- [ ] **Step 2: Commit**

```bash
git add src/layouts/Layout.astro
git commit -m "feat: let Layout render without a session for public pages

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: `RecipeCard.astro` gains an optional copy CTA

**Files:**
- Modify: `src/components/RecipeCard.astro`

**Interfaces:**
- Consumes: `CopyAction` type from `../lib/copyAction` (Task 4).
- Produces: `RecipeCard` accepts `href?: string` (default `/recipes/${recipe.slug}`) and `copyAction?: CopyAction`. When `copyAction` is present, renders a CTA below the card's link. The card's outer element keeps the `recipe-card` class and `data-tags`/`data-title` attributes so `src/scripts/recipe-list.ts`'s search/filter keeps working unmodified.

- [ ] **Step 1: Update `src/components/RecipeCard.astro`**

Read the current file, then replace its contents with:

```astro
---
import { Image } from "astro:assets";
import type { Recipe } from "../lib/recipe";
import type { CopyAction } from "../lib/copyAction";

interface Props {
  recipe: Recipe;
  href?: string;
  copyAction?: CopyAction;
}
const { recipe, href = `/recipes/${recipe.slug}`, copyAction } = Astro.props;
---
<div
  class="recipe-card rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800"
  data-tags={recipe.tags.join(",")}
  data-title={recipe.title.toLowerCase()}
>
  <a href={href} class="block text-inherit no-underline">
    {recipe.image && <Image src={recipe.image} inferSize alt="" class="mb-3 h-36 w-full rounded-md object-cover" />}
    <h3 class="font-semibold text-zinc-900 dark:text-zinc-100">{recipe.title}</h3>
    <ul class="mt-2 flex list-none flex-wrap gap-1.5 p-0">
      {recipe.tags.map((tag) => (
        <li class="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">{tag}</li>
      ))}
    </ul>
  </a>
  {copyAction && (
    copyAction.type === "copy" ? (
      <button
        type="button"
        class="copy-recipe-button mt-3 w-full rounded-md border border-green-700 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50 dark:border-green-600 dark:text-green-400 dark:hover:bg-zinc-700"
        data-owner={copyAction.owner}
        data-repo={copyAction.repo}
        data-slug={recipe.slug}
      >
        Add to my recipes
      </button>
    ) : (
      <a
        href={copyAction.type === "login" ? "/api/auth/login" : "/settings"}
        class="mt-3 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-center text-sm font-medium text-zinc-700 no-underline hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
      >
        {copyAction.type === "login" ? "Log in to add" : "Add a repo to save recipes"}
      </a>
    )
  )}
</div>
```

The only behavioral change for existing callers (`src/pages/index.astro`, which calls `<RecipeCard recipe={recipe} />` with no `href`/`copyAction`) is that the outer wrapper is now a `<div>` instead of the `<a>` itself, with the same classes moved appropriately — the rendered result is visually identical (card border/padding/background now on the outer `div`, link styling on the inner `a`), and `.recipe-card` / `data-tags` / `data-title` are unchanged for `recipe-list.ts`.

- [ ] **Step 2: Commit**

```bash
git add src/components/RecipeCard.astro
git commit -m "feat: add optional copy CTA to RecipeCard

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: `copy-recipe.ts` client script

**Files:**
- Create: `src/scripts/copy-recipe.ts`

**Interfaces:**
- Consumes: `.copy-recipe-button` elements with `data-owner`/`data-repo`/`data-slug` (Task 9's contract), `POST /api/recipes/copy` (Task 7).
- Produces: click handling — POSTs to `/api/recipes/copy` and redirects to `/recipes/{slug}` on success; shows an error via `alert()` on failure (matching the existing `confirm()`-based delete flow in `src/scripts/recipe-form.ts` — this codebase already uses native dialogs for this class of one-off feedback).

- [ ] **Step 1: Create `src/scripts/copy-recipe.ts`**

```ts
document.addEventListener("click", async (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(".copy-recipe-button");
  if (!button) return;

  const { owner, repo, slug } = button.dataset;
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Adding…";

  try {
    const res = await fetch("/api/recipes/copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner, repo, slug }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Copy failed");
    window.location.href = `/recipes/${json.slug}`;
  } catch (err) {
    alert(err instanceof Error ? err.message : "Copy failed");
    button.disabled = false;
    button.textContent = originalText;
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add src/scripts/copy-recipe.ts
git commit -m "feat: wire up copy-recipe button behavior

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 11: Public profile page `/u/[owner]/[repo]`

**Files:**
- Create: `src/pages/u/[owner]/[repo]/index.astro`

**Interfaces:**
- Consumes: `listPublicRecipes` (Task 3), `resolveCopyAction` (Task 4), `Layout` with `session` prop (Task 8), `RecipeCard` with `href`/`copyAction` props (Task 9), `src/scripts/recipe-list.ts` (existing, unmodified), `src/scripts/copy-recipe.ts` (Task 10).

- [ ] **Step 1: Create `src/pages/u/[owner]/[repo]/index.astro`**

```astro
---
import Layout from "../../../../layouts/Layout.astro";
import RecipeCard from "../../../../components/RecipeCard.astro";
import { listPublicRecipes } from "../../../../lib/publicStore";
import { resolveCopyAction } from "../../../../lib/copyAction";

const { owner, repo } = Astro.params;

let recipes;
try {
  recipes = await listPublicRecipes(owner!, repo!);
} catch (err: any) {
  return new Response(`Failed to load recipes: ${err.message}`, { status: 502 });
}
recipes.sort((a, b) => a.title.localeCompare(b.title));
const allTags = Array.from(new Set(recipes.flatMap((r) => r.tags))).sort();
// Astro.locals.session is typed as always-present, but middleware leaves it
// null on public paths like this one when no cookie is set.
const copyAction = resolveCopyAction(Astro.locals.session);
---
<Layout title={`${owner}'s recipes`} session={Astro.locals.session}>
  <h1 class="text-2xl font-semibold tracking-tight">{owner}'s recipes</h1>

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
    <p class="mt-6 text-zinc-600 dark:text-zinc-400">No public recipes yet.</p>
  ) : (
    <div id="recipe-grid" class="mt-4 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
      {recipes.map((recipe) => (
        <RecipeCard recipe={recipe} href={`/u/${owner}/${repo}/${recipe.slug}`} copyAction={copyAction} />
      ))}
    </div>
  )}
</Layout>

<script src="../../../../scripts/recipe-list.ts"></script>
<script src="../../../../scripts/copy-recipe.ts"></script>
```

- [ ] **Step 2: Commit**

```bash
git add "src/pages/u/[owner]/[repo]/index.astro"
git commit -m "feat: add public profile page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 12: Public recipe detail page `/u/[owner]/[repo]/[slug]`

**Files:**
- Create: `src/pages/u/[owner]/[repo]/[slug].astro`

**Interfaces:**
- Consumes: `getPublicRecipe` (Task 3), `resolveCopyAction` (Task 4), `Layout` with `session` prop (Task 8), `src/scripts/copy-recipe.ts` (Task 10).

- [ ] **Step 1: Create `src/pages/u/[owner]/[repo]/[slug].astro`**

```astro
---
import { Image } from "astro:assets";
import Layout from "../../../../layouts/Layout.astro";
import { getPublicRecipe } from "../../../../lib/publicStore";
import { resolveCopyAction } from "../../../../lib/copyAction";

const { owner, repo, slug } = Astro.params;
if (!owner || !repo || !slug) {
  return new Response("Recipe not found", { status: 404 });
}

let recipe;
try {
  recipe = await getPublicRecipe(owner, repo, slug);
} catch (err: any) {
  return new Response(`Failed to load recipe: ${err.message}`, { status: 502 });
}

if (!recipe) {
  return new Response("Recipe not found", { status: 404 });
}

// Astro.locals.session is typed as always-present, but middleware leaves it
// null on public paths like this one when no cookie is set.
const copyAction = resolveCopyAction(Astro.locals.session);
---
<Layout title={recipe.title} session={Astro.locals.session}>
  <article>
    <h1 class="text-2xl font-semibold tracking-tight">{recipe.title}</h1>

    {recipe.image && <Image src={recipe.image} inferSize alt={recipe.title} class="mt-4 max-w-full rounded-md" />}

    <ul class="mt-3 flex list-none flex-wrap gap-1.5 p-0">
      {recipe.tags.map((tag) => (
        <li class="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{tag}</li>
      ))}
    </ul>

    <dl class="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      {recipe.servings && (<><dt class="font-medium text-zinc-600 dark:text-zinc-400">Servings</dt><dd>{recipe.servings}</dd></>)}
      {recipe.prepTime && (<><dt class="font-medium text-zinc-600 dark:text-zinc-400">Prep time</dt><dd>{recipe.prepTime}</dd></>)}
      {recipe.cookTime && (<><dt class="font-medium text-zinc-600 dark:text-zinc-400">Cook time</dt><dd>{recipe.cookTime}</dd></>)}
    </dl>

    <section class="mt-6">
      <h2 class="text-lg font-semibold tracking-tight">Ingredients</h2>
      <ul class="mt-2 list-disc pl-5">
        {recipe.ingredients.map((item) => <li>{item}</li>)}
      </ul>
    </section>

    <section class="mt-6">
      <h2 class="text-lg font-semibold tracking-tight">Instructions</h2>
      <ol class="mt-2 list-decimal pl-5">
        {recipe.instructions.map((step) => <li>{step}</li>)}
      </ol>
    </section>

    {recipe.nutrition && Object.values(recipe.nutrition).some(Boolean) && (
      <section class="mt-6">
        <h2 class="text-lg font-semibold tracking-tight">Nutrition (per serving)</h2>
        <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          {recipe.nutrition.calories && (<><dt class="font-medium text-zinc-600 dark:text-zinc-400">Calories</dt><dd>{recipe.nutrition.calories}</dd></>)}
          {recipe.nutrition.protein && (<><dt class="font-medium text-zinc-600 dark:text-zinc-400">Protein</dt><dd>{recipe.nutrition.protein}</dd></>)}
          {recipe.nutrition.fat && (<><dt class="font-medium text-zinc-600 dark:text-zinc-400">Fat</dt><dd>{recipe.nutrition.fat}</dd></>)}
          {recipe.nutrition.carbohydrates && (<><dt class="font-medium text-zinc-600 dark:text-zinc-400">Carbohydrates</dt><dd>{recipe.nutrition.carbohydrates}</dd></>)}
          {recipe.nutrition.fiber && (<><dt class="font-medium text-zinc-600 dark:text-zinc-400">Fiber</dt><dd>{recipe.nutrition.fiber}</dd></>)}
          {recipe.nutrition.sugar && (<><dt class="font-medium text-zinc-600 dark:text-zinc-400">Sugar</dt><dd>{recipe.nutrition.sugar}</dd></>)}
          {recipe.nutrition.sodium && (<><dt class="font-medium text-zinc-600 dark:text-zinc-400">Sodium</dt><dd>{recipe.nutrition.sodium}</dd></>)}
        </dl>
      </section>
    )}

    {recipe.notes && (
      <section class="mt-6">
        <h2 class="text-lg font-semibold tracking-tight">Notes</h2>
        <p class="mt-2">{recipe.notes}</p>
      </section>
    )}

    {recipe.sourceUrl && (
      <p class="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
        Source: <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer" class="text-green-700 dark:text-green-400">{recipe.sourceUrl}</a>
      </p>
    )}

    <div class="mt-6">
      {copyAction.type === "copy" ? (
        <button
          type="button"
          class="copy-recipe-button inline-block rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:bg-green-700 dark:hover:bg-green-800"
          data-owner={copyAction.owner}
          data-repo={copyAction.repo}
          data-slug={recipe.slug}
        >
          Add to my recipes
        </button>
      ) : (
        <a
          href={copyAction.type === "login" ? "/api/auth/login" : "/settings"}
          class="inline-block rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white no-underline hover:bg-green-800 dark:bg-green-700 dark:hover:bg-green-800"
        >
          {copyAction.type === "login" ? "Log in to add" : "Add a repo to save recipes"}
        </a>
      )}
    </div>
  </article>
</Layout>

<script src="../../../../scripts/copy-recipe.ts"></script>
```

- [ ] **Step 2: Commit**

```bash
git add "src/pages/u/[owner]/[repo]/[slug].astro"
git commit -m "feat: add public recipe detail page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 13: Settings page — "Share your profile" section

**Files:**
- Modify: `src/pages/settings.astro`
- Create: `src/scripts/settings.ts`

**Interfaces:**
- Consumes: `session.repo.owner`/`.name`/`.private` (Task 2).
- Produces: a share-link box with copy-to-clipboard, shown whenever a repo is configured; a warning when `session.repo.private` is true.

- [ ] **Step 1: Create `src/scripts/settings.ts`**

```ts
const copyButton = document.getElementById("copy-share-link");
copyButton?.addEventListener("click", async () => {
  const input = document.getElementById("share-link") as HTMLInputElement;
  await navigator.clipboard.writeText(input.value);
  const original = copyButton.textContent;
  copyButton.textContent = "Copied!";
  setTimeout(() => {
    copyButton.textContent = original;
  }, 2000);
});
```

- [ ] **Step 2: Update `src/pages/settings.astro`**

Read the current file, then insert this section right after the closing `</ul>` of the repo list and before the final `</Layout>`:

```astro
  {session.repo && (
    <section class="mt-8 rounded-md border border-zinc-200 p-4 dark:border-zinc-700">
      <h2 class="text-lg font-semibold tracking-tight">Share your profile</h2>
      <p class="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Anyone with this link can view recipes you've marked public.
      </p>
      <div class="mt-3 flex gap-2">
        <input
          type="text"
          id="share-link"
          readonly
          value={`${Astro.url.origin}/u/${session.repo.owner}/${session.repo.name}`}
          class="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <button
          type="button"
          id="copy-share-link"
          class="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >Copy</button>
      </div>
      {session.repo.private && (
        <p class="mt-2 text-sm text-amber-700 dark:text-amber-400">
          This repo is private on GitHub — the link above won't work until you make it public.
        </p>
      )}
    </section>
  )}
```

Then add the script tag at the end of the file, after `</Layout>`:

```astro

<script src="../scripts/settings.ts"></script>
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/settings.astro src/scripts/settings.ts
git commit -m "feat: add share-your-profile link to Settings

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 14: Recipe form — public toggle

**Files:**
- Modify: `src/components/RecipeForm.astro`
- Modify: `src/scripts/recipe-form.ts`

**Interfaces:**
- Produces: a "Make this recipe public" checkbox (`id="public"`) wired into the same create/edit payload used by Task 6's routes.

- [ ] **Step 1: Update `src/components/RecipeForm.astro`**

Read the current file. In the `initial` object, add:

```ts
  public: recipe?.public ?? false,
```

In the markup, add the checkbox right after the tags field (after the `<input type="text" id="tags" ... />` line):

```astro
  <label class="mt-3 flex items-center gap-2 text-sm font-medium">
    <input type="checkbox" id="public" />
    Make this recipe public
  </label>
```

- [ ] **Step 2: Update `src/scripts/recipe-form.ts`**

In the `FormData_` interface, add:

```ts
  public: boolean;
```

In `fillForm`, add (alongside the other `fillField` calls):

```ts
  (document.getElementById("public") as HTMLInputElement).checked = data.public;
```

In the import handler's `fillForm(...)` call (inside the `importButton` click listener), add `public: false,` to the object passed in — imported recipes always start private:

```ts
      fillForm({
        title: json.recipe.title ?? "",
        sourceUrl: json.recipe.sourceUrl ?? url,
        image: json.recipe.image ?? "",
        tags: (json.recipe.tags ?? []).join(", "),
        servings: json.recipe.servings ?? "",
        prepTime: json.recipe.prepTime ?? "",
        cookTime: json.recipe.cookTime ?? "",
        ingredients: json.recipe.ingredients ?? [],
        instructions: json.recipe.instructions ?? [],
        nutrition: json.recipe.nutrition ?? {},
        notes: json.recipe.notes ?? "",
        public: false,
      });
```

In the submit handler's `payload` object, add:

```ts
    public: (document.getElementById("public") as HTMLInputElement).checked,
```

- [ ] **Step 3: Commit**

```bash
git add src/components/RecipeForm.astro src/scripts/recipe-form.ts
git commit -m "feat: add public toggle to recipe form

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 15: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including every new file from Tasks 1–7.

- [ ] **Step 2: Build the project**

Run: `npm run build`
Expected: builds cleanly — this is the primary type-check for the `.astro` files touched in Tasks 8–14, which have no unit test coverage in this codebase.

- [ ] **Step 3: Fix any failures**

If `npm test` or `npm run build` fail, fix the reported issue in the relevant task's files and re-run both commands before proceeding. Do not commit broken state.

- [ ] **Step 4: Manual smoke check (optional but recommended)**

Run `npm run dev`, then:
1. Log in, configure a public GitHub repo in Settings, confirm the share link and (if the repo were private) the warning banner appear correctly.
2. Create a recipe with "Make this recipe public" checked.
3. Visit `/u/{owner}/{repo}` in a private/incognito window (no session) — confirm the recipe appears, search/tag filters work, and the CTA reads "Log in to add".
4. Visit `/u/{owner}/{repo}/{slug}` the same way — confirm the detail page renders and the CTA works.
5. Log in as a different account with no repo configured, click "Add to my recipes" — confirm it goes to Settings.
6. Configure a repo for that account, click "Add to my recipes" again — confirm it copies the recipe, redirects to `/recipes/{slug}`, and the copy is private by default.

This step has no pass/fail gate in CI — it's a final sanity pass on the golden path before calling the feature done.
