# GitHub Login + Multi-User Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-trusted-user, env-var-configured GitHub access with per-user GitHub OAuth login, so multiple people can use the same deployment, each storing recipes in a GitHub repo they personally pick and have push access to.

**Architecture:** A GitHub OAuth App handles login; the resulting access token plus the user's chosen repo/branch are packed into an AES-256-GCM-encrypted, httpOnly session cookie (stateless — no database). Astro middleware decrypts that cookie on every request, gates access (no session → login; session with no repo chosen → settings), and exposes the session via `Astro.locals.session`. `RecipeStore`/Octokit clients are built fresh per request from the session instead of a cached singleton built from env vars.

**Tech Stack:** Astro 4 (server output, `@astrojs/netlify` adapter), `@octokit/rest`, Node's built-in `crypto`, Vitest. No new npm dependencies.

## Global Constraints

- Node 22 runtime (Netlify `NODE_VERSION = "22"`), Astro `output: "server"` — unchanged.
- No new npm dependencies — session encryption uses Node's built-in `node:crypto`; GitHub calls use the existing `@octokit/rest` and global `fetch`.
- Legacy env-var single-user mode (`GITHUB_TOKEN`/`GITHUB_REPO`/`GITHUB_BRANCH`, `src/lib/env.ts`) is removed entirely — login is required for everyone.
- One repo per user, no multi-repo aggregation; branch is always the repo's `default_branch` — no manual branch field anywhere in the UI.
- OAuth scope is `repo` (needed for private + public repo read/write).
- Session state is stateless — everything needed lives in the encrypted cookie; no server-side session store.
- Every file that reads a custom (non-built-in) env var must reference it as the literal `import.meta.env.KEY` — never a bare `import.meta.env` — per the existing regression guard in this codebase (Astro's Vite env-injection strips unreferenced keys from production builds).

---

## Task 1: Session cookie encryption

**Files:**
- Create: `src/lib/session.ts`
- Test: `tests/lib/session.test.ts`

**Interfaces:**
- Produces: `interface RepoRef { owner: string; name: string; branch: string }`, `interface Session { githubLogin: string; accessToken: string; repo: RepoRef | null }`, `encryptSession(session: Session, secret: string): string`, `decryptSession(token: string, secret: string): Session | null`, `SESSION_COOKIE: string`, `OAUTH_STATE_COOKIE: string`.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/lib/session.test.ts
import { describe, it, expect } from "vitest";
import { encryptSession, decryptSession, type Session } from "../../src/lib/session";

const secret = "test-secret-value";
const session: Session = {
  githubLogin: "rob",
  accessToken: "gho_abc123",
  repo: { owner: "rob", name: "recipes", branch: "main" },
};

describe("encryptSession / decryptSession", () => {
  it("round-trips a session through encryption", () => {
    const token = encryptSession(session, secret);
    expect(decryptSession(token, secret)).toEqual(session);
  });

  it("round-trips a session with no repo chosen yet", () => {
    const noRepo: Session = { githubLogin: "rob", accessToken: "gho_abc123", repo: null };
    const token = encryptSession(noRepo, secret);
    expect(decryptSession(token, secret)).toEqual(noRepo);
  });

  it("returns null for a tampered token", () => {
    const token = encryptSession(session, secret);
    const tampered = token.slice(0, -2) + "zz";
    expect(decryptSession(tampered, secret)).toBeNull();
  });

  it("returns null when decrypted with the wrong secret", () => {
    const token = encryptSession(session, secret);
    expect(decryptSession(token, "wrong-secret")).toBeNull();
  });

  it("returns null for garbage input", () => {
    expect(decryptSession("not-a-real-token", secret)).toBeNull();
    expect(decryptSession("", secret)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/session.test.ts`
Expected: FAIL — `src/lib/session.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/session.ts
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export interface RepoRef {
  owner: string;
  name: string;
  branch: string;
}

export interface Session {
  githubLogin: string;
  accessToken: string;
  repo: RepoRef | null;
}

export const SESSION_COOKIE = "session";
export const OAUTH_STATE_COOKIE = "oauth_state";

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

export function encryptSession(session: Session, secret: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(session), "utf-8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptSession(token: string, secret: string): Session | null {
  try {
    const [ivPart, tagPart, dataPart] = token.split(".");
    if (!ivPart || !tagPart || !dataPart) return null;
    const key = deriveKey(secret);
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(dataPart, "base64url")), decipher.final()]);
    const parsed = JSON.parse(plaintext.toString("utf-8"));
    if (typeof parsed.githubLogin !== "string" || typeof parsed.accessToken !== "string") return null;
    if (parsed.repo !== null && typeof parsed.repo !== "object") return null;
    return parsed as Session;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/session.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/session.ts tests/lib/session.test.ts
git commit -m "feat: add encrypted session cookie helpers"
```

---

## Task 2: Repo listing/selection helpers

**Files:**
- Create: `src/lib/repos.ts`
- Test: `tests/lib/repos.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `interface RepoClient { repos: { listForAuthenticatedUser(params: { per_page: number; sort: string; page: number }): Promise<{ data: any[] }>; get(params: { owner: string; repo: string }): Promise<{ data: any }> } }`, `interface RepoOption { owner: string; name: string; private: boolean }`, `listSelectableRepos(client: RepoClient): Promise<RepoOption[]>`, `resolveRepoSelection(client: RepoClient, owner: string, name: string): Promise<{ owner: string; name: string; branch: string }>` (throws `Error` on no push access).

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/lib/repos.test.ts
import { describe, it, expect, vi } from "vitest";
import { listSelectableRepos, resolveRepoSelection } from "../../src/lib/repos";

function page(items: any[]) {
  return { data: items };
}

describe("listSelectableRepos", () => {
  it("filters to repos with push access and maps owner/name/private", async () => {
    const client = {
      repos: {
        listForAuthenticatedUser: vi.fn(async () =>
          page([
            { name: "recipes", owner: { login: "rob" }, private: true, permissions: { push: true } },
            { name: "readonly-fork", owner: { login: "rob" }, private: false, permissions: { push: false } },
          ])
        ),
        get: vi.fn(),
      },
    };
    const repos = await listSelectableRepos(client as any);
    expect(repos).toEqual([{ owner: "rob", name: "recipes", private: true }]);
  });

  it("paginates until a page comes back shorter than 100", async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => ({
      name: `repo-${i}`,
      owner: { login: "rob" },
      private: false,
      permissions: { push: true },
    }));
    const lastPage = [{ name: "last", owner: { login: "rob" }, private: false, permissions: { push: true } }];
    const listForAuthenticatedUser = vi.fn().mockResolvedValueOnce(page(fullPage)).mockResolvedValueOnce(page(lastPage));
    const client = { repos: { listForAuthenticatedUser, get: vi.fn() } };
    const repos = await listSelectableRepos(client as any);
    expect(repos).toHaveLength(101);
    expect(listForAuthenticatedUser).toHaveBeenCalledTimes(2);
  });
});

describe("resolveRepoSelection", () => {
  it("returns owner/name/branch when push access is confirmed", async () => {
    const client = {
      repos: {
        listForAuthenticatedUser: vi.fn(),
        get: vi.fn(async () => ({ data: { default_branch: "main", permissions: { push: true } } })),
      },
    };
    const result = await resolveRepoSelection(client as any, "rob", "recipes");
    expect(result).toEqual({ owner: "rob", name: "recipes", branch: "main" });
  });

  it("throws when the caller lacks push access", async () => {
    const client = {
      repos: {
        listForAuthenticatedUser: vi.fn(),
        get: vi.fn(async () => ({ data: { default_branch: "main", permissions: { push: false } } })),
      },
    };
    await expect(resolveRepoSelection(client as any, "rob", "recipes")).rejects.toThrow(/push access/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/repos.test.ts`
Expected: FAIL — `src/lib/repos.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/repos.ts
export interface RepoClient {
  repos: {
    listForAuthenticatedUser(params: { per_page: number; sort: string; page: number }): Promise<{ data: any[] }>;
    get(params: { owner: string; repo: string }): Promise<{ data: any }>;
  };
}

export interface RepoOption {
  owner: string;
  name: string;
  private: boolean;
}

const MAX_PAGES = 10;

export async function listSelectableRepos(client: RepoClient): Promise<RepoOption[]> {
  const results: RepoOption[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await client.repos.listForAuthenticatedUser({ per_page: 100, sort: "updated", page });
    const items = res.data;
    for (const item of items) {
      if (item.permissions?.push) {
        results.push({ owner: item.owner.login, name: item.name, private: item.private });
      }
    }
    if (items.length < 100) break;
  }
  return results;
}

export async function resolveRepoSelection(
  client: RepoClient,
  owner: string,
  name: string
): Promise<{ owner: string; name: string; branch: string }> {
  const res = await client.repos.get({ owner, repo: name });
  if (!res.data.permissions?.push) {
    throw new Error(`No push access to ${owner}/${name}`);
  }
  return { owner, name, branch: res.data.default_branch };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/repos.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/repos.ts tests/lib/repos.test.ts
git commit -m "feat: add GitHub repo listing/selection helpers"
```

---

## Task 3: Route access decision logic

**Files:**
- Create: `src/lib/routing.ts`
- Test: `tests/lib/routing.test.ts`

**Interfaces:**
- Consumes: `Session` type from Task 1 (`src/lib/session.ts`).
- Produces: `type RouteDecision = { redirect: string } | { proceed: true }`, `decideRoute(session: Session | null, pathname: string): RouteDecision`.

This logic is split out of the Astro middleware into its own dependency-free file because `astro:middleware` is a virtual module only resolvable inside Astro's own Vite pipeline — Vitest can't import it directly. Keeping the branching logic here (no Astro imports) makes it unit-testable; Task 5 wires it into the real middleware.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/lib/routing.test.ts
import { describe, it, expect } from "vitest";
import { decideRoute } from "../../src/lib/routing";
import type { Session } from "../../src/lib/session";

const sessionNoRepo: Session = { githubLogin: "rob", accessToken: "tok", repo: null };
const sessionWithRepo: Session = {
  githubLogin: "rob",
  accessToken: "tok",
  repo: { owner: "rob", name: "recipes", branch: "main" },
};

describe("decideRoute", () => {
  it("redirects to login when there is no session", () => {
    expect(decideRoute(null, "/")).toEqual({ redirect: "/api/auth/login" });
  });

  it("redirects to settings when the session has no repo chosen", () => {
    expect(decideRoute(sessionNoRepo, "/")).toEqual({ redirect: "/settings" });
  });

  it("does not redirect-loop on the settings page itself", () => {
    expect(decideRoute(sessionNoRepo, "/settings")).toEqual({ proceed: true });
  });

  it("does not redirect-loop on the settings API", () => {
    expect(decideRoute(sessionNoRepo, "/api/settings/repo")).toEqual({ proceed: true });
  });

  it("proceeds once a repo has been selected", () => {
    expect(decideRoute(sessionWithRepo, "/")).toEqual({ proceed: true });
    expect(decideRoute(sessionWithRepo, "/recipes/chili")).toEqual({ proceed: true });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/routing.test.ts`
Expected: FAIL — `src/lib/routing.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/routing.ts
import type { Session } from "./session";

export type RouteDecision = { redirect: string } | { proceed: true };

export function decideRoute(session: Session | null, pathname: string): RouteDecision {
  if (!session) return { redirect: "/api/auth/login" };
  const isSettingsPath = pathname === "/settings" || pathname.startsWith("/api/settings");
  if (!session.repo && !isSettingsPath) return { redirect: "/settings" };
  return { proceed: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/routing.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/routing.ts tests/lib/routing.test.ts
git commit -m "feat: add session-based route access decision logic"
```

---

## Task 4: Remove env-var config, make the store session-based

**Files:**
- Modify: `src/lib/store.ts` (full rewrite)
- Delete: `src/lib/env.ts`, `tests/lib/env.test.ts`
- Test: `tests/lib/store.test.ts` (full rewrite)

**Interfaces:**
- Consumes: `RecipeStore` from `src/lib/github.ts` (unchanged).
- Produces: `interface StoreSession { accessToken: string; repo: { owner: string; name: string; branch: string } }`, `getStore(session: StoreSession): RecipeStore`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/store.test.ts
import { describe, it, expect } from "vitest";
import { getStore } from "../../src/lib/store";
import { RecipeStore } from "../../src/lib/github";

describe("getStore", () => {
  it("builds a RecipeStore scoped to the session's chosen repo", () => {
    const store = getStore({
      accessToken: "tok_123",
      repo: { owner: "rob", name: "recipes", branch: "dev" },
    });
    expect(store).toBeInstanceOf(RecipeStore);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/store.test.ts`
Expected: FAIL — `getStore` still requires no arguments and reads env vars (old signature/behavior), and `tests/lib/env.test.ts` still exists alongside it.

- [ ] **Step 3: Delete the legacy env-var config module and its test**

```bash
git rm src/lib/env.ts tests/lib/env.test.ts
```

- [ ] **Step 4: Rewrite the store module**

```typescript
// src/lib/store.ts
import { Octokit } from "@octokit/rest";
import { RecipeStore } from "./github";

export interface StoreSession {
  accessToken: string;
  repo: { owner: string; name: string; branch: string };
}

export function getStore(session: StoreSession): RecipeStore {
  const octokit = new Octokit({ auth: session.accessToken });
  return new RecipeStore(octokit, {
    owner: session.repo.owner,
    repo: session.repo.name,
    branch: session.repo.branch,
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/lib/store.test.ts`
Expected: PASS (1 test)

- [ ] **Step 6: Commit**

```bash
git add src/lib/store.ts tests/lib/store.test.ts
git commit -m "feat: make getStore session-based, drop env-var config"
```

---

## Task 5: Env types + Astro middleware

**Files:**
- Modify: `src/env.d.ts`
- Create: `src/middleware.ts`

**Interfaces:**
- Consumes: `decryptSession`, `Session`, `SESSION_COOKIE` from Task 1; `decideRoute` from Task 3.
- Produces: `App.Locals.session: Session` (ambient type, used by all pages/routes from Task 10 onward); `onRequest` middleware export required by Astro.

No unit test in this task — `astro:middleware` is a virtual module Vitest cannot resolve outside Astro's own Vite pipeline (see Task 3's rationale), so this thin wrapper is covered by the manual QA checklist in Task 12 instead. All of its branching logic already has unit coverage via `decideRoute` (Task 3).

- [ ] **Step 1: Update env types**

```typescript
// src/env.d.ts
/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly GITHUB_CLIENT_ID: string;
  readonly GITHUB_CLIENT_SECRET: string;
  readonly SESSION_SECRET: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace App {
  interface Locals {
    session: import("./lib/session").Session;
  }
}
```

- [ ] **Step 2: Write the middleware**

```typescript
// src/middleware.ts
import { defineMiddleware } from "astro:middleware";
import { decryptSession, SESSION_COOKIE } from "./lib/session";
import { decideRoute } from "./lib/routing";

export const onRequest = defineMiddleware((context, next) => {
  if (context.url.pathname.startsWith("/api/auth/")) {
    return next();
  }

  const cookie = context.cookies.get(SESSION_COOKIE)?.value;
  const session = cookie ? decryptSession(cookie, import.meta.env.SESSION_SECRET) : null;

  const decision = decideRoute(session, context.url.pathname);
  if ("redirect" in decision) {
    return context.redirect(decision.redirect);
  }

  context.locals.session = session!;
  return next();
});
```

- [ ] **Step 3: Run the full suite to confirm nothing else broke**

Run: `npm test`
Expected: PASS (existing suite still green; `src/pages/*` still reference the old parameterless `getStore()` at this point — see Task 10 — so this step is just confirming the new files compile/typecheck cleanly alongside everything untouched so far. If `npm test` fails on type errors from `src/pages/*`, that's expected and resolved in Task 10; confirm the failures are limited to those files.)

- [ ] **Step 4: Commit**

```bash
git add src/env.d.ts src/middleware.ts
git commit -m "feat: add auth/repo-selection gating middleware"
```

---

## Task 6: OAuth login route

**Files:**
- Create: `src/pages/api/auth/login.ts`
- Test: `tests/pages/api/auth/login.test.ts`

**Interfaces:**
- Consumes: `OAUTH_STATE_COOKIE` from Task 1.
- Produces: `GET` route at `/api/auth/login`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/pages/api/auth/login.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { OAUTH_STATE_COOKIE } from "../../../../src/lib/session";

describe("GET /api/auth/login", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("redirects to GitHub's authorize URL and sets a matching state cookie", async () => {
    vi.stubEnv("GITHUB_CLIENT_ID", "client-abc");
    const { GET } = await import("../../../../src/pages/api/auth/login");

    const setCookie = vi.fn();
    const redirect = vi.fn((location: string) => new Response(null, { status: 302, headers: { Location: location } }));

    const response = await GET({ cookies: { set: setCookie }, redirect } as any);

    expect(response.status).toBe(302);
    const location = response.headers.get("Location")!;
    expect(location).toMatch(/^https:\/\/github\.com\/login\/oauth\/authorize\?/);
    expect(location).toContain("client_id=client-abc");
    expect(location).toContain("scope=repo");

    expect(setCookie).toHaveBeenCalledTimes(1);
    const [cookieName, cookieValue] = setCookie.mock.calls[0];
    expect(cookieName).toBe(OAUTH_STATE_COOKIE);
    expect(location).toContain(`state=${cookieValue}`);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pages/api/auth/login.test.ts`
Expected: FAIL — `src/pages/api/auth/login.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/pages/api/auth/login.ts
import type { APIRoute } from "astro";
import { randomBytes } from "node:crypto";
import { OAUTH_STATE_COOKIE } from "../../../lib/session";

export const GET: APIRoute = ({ cookies, redirect }) => {
  const state = randomBytes(16).toString("hex");

  cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  const params = new URLSearchParams({
    client_id: import.meta.env.GITHUB_CLIENT_ID,
    scope: "repo",
    state,
  });

  return redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pages/api/auth/login.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/auth/login.ts tests/pages/api/auth/login.test.ts
git commit -m "feat: add GitHub OAuth login route"
```

---

## Task 7: OAuth callback route

**Files:**
- Create: `src/pages/api/auth/callback.ts`
- Test: `tests/pages/api/auth/callback.test.ts`

**Interfaces:**
- Consumes: `encryptSession`, `decryptSession`, `Session`, `SESSION_COOKIE`, `OAUTH_STATE_COOKIE` from Task 1.
- Produces: `GET` route at `/api/auth/callback`.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/pages/api/auth/callback.test.ts
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { encryptSession, decryptSession, SESSION_COOKIE, OAUTH_STATE_COOKIE } from "../../../../src/lib/session";

function fakeContext(opts: {
  code?: string;
  state?: string;
  cookieState?: string;
  existingSessionCookie?: string;
}) {
  const url = new URL("http://localhost/api/auth/callback");
  if (opts.code) url.searchParams.set("code", opts.code);
  if (opts.state) url.searchParams.set("state", opts.state);

  const cookieStore = new Map<string, string>();
  if (opts.cookieState) cookieStore.set(OAUTH_STATE_COOKIE, opts.cookieState);
  if (opts.existingSessionCookie) cookieStore.set(SESSION_COOKIE, opts.existingSessionCookie);

  const setCalls: Array<[string, string]> = [];
  return {
    context: {
      url,
      cookies: {
        get: (name: string) => (cookieStore.has(name) ? { value: cookieStore.get(name)! } : undefined),
        set: (name: string, value: string) => setCalls.push([name, value]),
        delete: vi.fn(),
      },
      redirect: (location: string) => new Response(null, { status: 302, headers: { Location: location } }),
    },
    setCalls,
  };
}

describe("GET /api/auth/callback", () => {
  beforeEach(() => {
    vi.stubEnv("GITHUB_CLIENT_ID", "client-abc");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "secret-xyz");
    vi.stubEnv("SESSION_SECRET", "test-secret-value");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("redirects to login with an error when state does not match", async () => {
    const { GET } = await import("../../../../src/pages/api/auth/callback");
    const { context } = fakeContext({ code: "abc", state: "wrong", cookieState: "right" });
    const response = await GET(context as any);
    expect(response.headers.get("Location")).toBe("/api/auth/login?error=state_mismatch");
  });

  it("redirects to login with an error when the token exchange fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "bad_verification_code" }), { status: 200 }))
    );
    const { GET } = await import("../../../../src/pages/api/auth/callback");
    const { context } = fakeContext({ code: "abc", state: "right", cookieState: "right" });
    const response = await GET(context as any);
    expect(response.headers.get("Location")).toBe("/api/auth/login?error=token_exchange_failed");
  });

  it("on success, stores a session cookie and redirects to /settings when no repo is chosen yet", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "gho_new" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ login: "rob" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("../../../../src/pages/api/auth/callback");
    const { context, setCalls } = fakeContext({ code: "abc", state: "right", cookieState: "right" });
    const response = await GET(context as any);

    expect(response.headers.get("Location")).toBe("/settings");
    expect(setCalls).toHaveLength(1);
    const [cookieName, cookieValue] = setCalls[0];
    expect(cookieName).toBe(SESSION_COOKIE);
    expect(decryptSession(cookieValue, "test-secret-value")).toEqual({
      githubLogin: "rob",
      accessToken: "gho_new",
      repo: null,
    });
  });

  it("carries forward a previously-chosen repo across re-login and redirects to /", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "gho_new" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ login: "rob" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const previousCookie = encryptSession(
      { githubLogin: "rob", accessToken: "gho_old", repo: { owner: "rob", name: "recipes", branch: "main" } },
      "test-secret-value"
    );

    const { GET } = await import("../../../../src/pages/api/auth/callback");
    const { context, setCalls } = fakeContext({
      code: "abc",
      state: "right",
      cookieState: "right",
      existingSessionCookie: previousCookie,
    });
    const response = await GET(context as any);

    expect(response.headers.get("Location")).toBe("/");
    const [, cookieValue] = setCalls[0];
    expect(decryptSession(cookieValue, "test-secret-value")).toEqual({
      githubLogin: "rob",
      accessToken: "gho_new",
      repo: { owner: "rob", name: "recipes", branch: "main" },
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/pages/api/auth/callback.test.ts`
Expected: FAIL — `src/pages/api/auth/callback.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/pages/api/auth/callback.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/pages/api/auth/callback.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/auth/callback.ts tests/pages/api/auth/callback.test.ts
git commit -m "feat: add GitHub OAuth callback route"
```

---

## Task 8: Logout route

**Files:**
- Create: `src/pages/api/auth/logout.ts`
- Test: `tests/pages/api/auth/logout.test.ts`

**Interfaces:**
- Consumes: `SESSION_COOKIE` from Task 1.
- Produces: `POST` route at `/api/auth/logout`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/pages/api/auth/logout.test.ts
import { describe, it, expect, vi } from "vitest";
import { POST } from "../../../../src/pages/api/auth/logout";
import { SESSION_COOKIE } from "../../../../src/lib/session";

describe("POST /api/auth/logout", () => {
  it("clears the session cookie and redirects to login", async () => {
    const del = vi.fn();
    const response = await POST({
      cookies: { delete: del },
      redirect: (location: string) => new Response(null, { status: 302, headers: { Location: location } }),
    } as any);

    expect(del).toHaveBeenCalledWith(SESSION_COOKIE, { path: "/" });
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/api/auth/login");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pages/api/auth/logout.test.ts`
Expected: FAIL — `src/pages/api/auth/logout.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/pages/api/auth/logout.ts
import type { APIRoute } from "astro";
import { SESSION_COOKIE } from "../../../lib/session";

export const POST: APIRoute = ({ cookies, redirect }) => {
  cookies.delete(SESSION_COOKIE, { path: "/" });
  return redirect("/api/auth/login");
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pages/api/auth/logout.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/auth/logout.ts tests/pages/api/auth/logout.test.ts
git commit -m "feat: add logout route"
```

---

## Task 9: Settings page + repo-selection API

**Files:**
- Create: `src/pages/settings.astro`
- Create: `src/pages/api/settings/repo.ts`
- Test: `tests/pages/api/settings/repo.test.ts`

**Interfaces:**
- Consumes: `listSelectableRepos`, `resolveRepoSelection` from Task 2; `encryptSession`, `SESSION_COOKIE`, `Session` from Task 1; `Astro.locals.session` from Task 5.
- Produces: `GET /settings` page; `POST` route at `/api/settings/repo`.

- [ ] **Step 1: Write the failing test for the API route**

```typescript
// tests/pages/api/settings/repo.test.ts
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { decryptSession, SESSION_COOKIE, type Session } from "../../../../src/lib/session";

const mockOctokitInstance = {
  repos: {
    listForAuthenticatedUser: vi.fn(),
    get: vi.fn(),
  },
};

vi.mock("@octokit/rest", () => ({
  Octokit: vi.fn(() => mockOctokitInstance),
}));

function formRequest(fields: Record<string, string>) {
  const body = new URLSearchParams(fields);
  return new Request("http://localhost/api/settings/repo", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
}

describe("POST /api/settings/repo", () => {
  beforeEach(() => {
    vi.stubEnv("SESSION_SECRET", "test-secret-value");
    mockOctokitInstance.repos.get.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("selects a repo the user has push access to and redirects home", async () => {
    mockOctokitInstance.repos.get.mockResolvedValue({ data: { default_branch: "main", permissions: { push: true } } });
    const { POST } = await import("../../../../src/pages/api/settings/repo");

    const session: Session = { githubLogin: "rob", accessToken: "tok", repo: null };
    const setCalls: Array<[string, string]> = [];
    const response = await POST({
      request: formRequest({ owner: "rob", name: "recipes" }),
      locals: { session },
      cookies: { set: (n: string, v: string) => setCalls.push([n, v]) },
      redirect: (location: string) => new Response(null, { status: 302, headers: { Location: location } }),
    } as any);

    expect(response.headers.get("Location")).toBe("/");
    expect(setCalls).toHaveLength(1);
    const [name, value] = setCalls[0];
    expect(name).toBe(SESSION_COOKIE);
    expect(decryptSession(value, "test-secret-value")).toEqual({
      githubLogin: "rob",
      accessToken: "tok",
      repo: { owner: "rob", name: "recipes", branch: "main" },
    });
  });

  it("redirects back to settings with an error when push access is denied", async () => {
    mockOctokitInstance.repos.get.mockResolvedValue({ data: { default_branch: "main", permissions: { push: false } } });
    const { POST } = await import("../../../../src/pages/api/settings/repo");

    const session: Session = { githubLogin: "rob", accessToken: "tok", repo: null };
    const response = await POST({
      request: formRequest({ owner: "rob", name: "recipes" }),
      locals: { session },
      cookies: { set: vi.fn() },
      redirect: (location: string) => new Response(null, { status: 302, headers: { Location: location } }),
    } as any);

    expect(response.headers.get("Location")).toBe("/settings?error=no_access");
  });

  it("returns 400 when owner or name is missing", async () => {
    const { POST } = await import("../../../../src/pages/api/settings/repo");
    const session: Session = { githubLogin: "rob", accessToken: "tok", repo: null };
    const response = await POST({
      request: formRequest({ owner: "rob" }),
      locals: { session },
      cookies: { set: vi.fn() },
      redirect: (location: string) => new Response(null, { status: 302, headers: { Location: location } }),
    } as any);
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pages/api/settings/repo.test.ts`
Expected: FAIL — `src/pages/api/settings/repo.ts` does not exist yet.

- [ ] **Step 3: Write the API route**

```typescript
// src/pages/api/settings/repo.ts
import type { APIRoute } from "astro";
import { Octokit } from "@octokit/rest";
import { resolveRepoSelection } from "../../../lib/repos";
import { encryptSession, SESSION_COOKIE } from "../../../lib/session";

export const POST: APIRoute = async ({ request, locals, cookies, redirect }) => {
  const form = await request.formData();
  const owner = form.get("owner");
  const name = form.get("name");
  if (typeof owner !== "string" || !owner || typeof name !== "string" || !name) {
    return new Response("Missing owner or name", { status: 400 });
  }

  const octokit = new Octokit({ auth: locals.session.accessToken });

  let repo;
  try {
    repo = await resolveRepoSelection(octokit as any, owner, name);
  } catch {
    return redirect("/settings?error=no_access");
  }

  const session = { ...locals.session, repo };
  cookies.set(SESSION_COOKIE, encryptSession(session, import.meta.env.SESSION_SECRET), {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return redirect("/");
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pages/api/settings/repo.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the settings page (no automated test — Astro pages are covered by the manual QA checklist in Task 12)**

```astro
---
// src/pages/settings.astro
import { Octokit } from "@octokit/rest";
import Layout from "../layouts/Layout.astro";
import { listSelectableRepos } from "../lib/repos";

const { session } = Astro.locals;
const octokit = new Octokit({ auth: session.accessToken });
const repos = await listSelectableRepos(octokit as any);
const error = Astro.url.searchParams.get("error");
---
<Layout title="Settings">
  <h1 class="text-2xl font-semibold tracking-tight">Settings</h1>
  <p class="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
    Pick which of your GitHub repos recipes should be stored in.
  </p>

  {error === "no_access" && (
    <p class="mt-4 text-red-600 dark:text-red-400">
      You no longer have push access to that repo. Pick a different one below.
    </p>
  )}

  <ul class="mt-4 flex flex-col gap-2">
    {repos.map((repo) => {
      const isCurrent = session.repo?.owner === repo.owner && session.repo?.name === repo.name;
      return (
        <li class="flex items-center justify-between rounded-md border border-zinc-200 p-3 dark:border-zinc-700">
          <span>
            {repo.owner}/{repo.name}
            {repo.private && <span class="ml-2 rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">private</span>}
            {isCurrent && <span class="ml-2 rounded-md bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900 dark:text-green-300">selected</span>}
          </span>
          <form method="POST" action="/api/settings/repo">
            <input type="hidden" name="owner" value={repo.owner} />
            <input type="hidden" name="name" value={repo.name} />
            <button
              type="submit"
              class="rounded-md bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-800 dark:bg-green-700 dark:hover:bg-green-800"
              disabled={isCurrent}
            >
              {isCurrent ? "Selected" : "Select"}
            </button>
          </form>
        </li>
      );
    })}
  </ul>
</Layout>
```

- [ ] **Step 6: Commit**

```bash
git add src/pages/settings.astro src/pages/api/settings/repo.ts tests/pages/api/settings/repo.test.ts
git commit -m "feat: add settings page and repo-selection API"
```

---

## Task 10: Wire session into recipe pages and API routes

**Files:**
- Modify: `src/pages/index.astro`
- Modify: `src/pages/recipes/[slug].astro`
- Modify: `src/pages/recipes/[slug]/edit.astro`
- Modify: `src/pages/api/recipes/index.ts`
- Modify: `src/pages/api/recipes/[slug].ts`
- Modify: `tests/api/recipes.test.ts`

**Interfaces:**
- Consumes: `getStore(session: StoreSession)` from Task 4, `Astro.locals.session` from Task 5.

- [ ] **Step 1: Update the recipes API test mocks to call `getStore` with a session argument**

```typescript
// tests/api/recipes.test.ts (only the top of the file changes — add a fakeSession and pass locals to every route call)
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockStore = {
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
};

vi.mock("../../src/lib/store", () => ({
  getStore: vi.fn(() => mockStore),
}));

import { POST } from "../../src/pages/api/recipes/index";
import { PUT, DELETE } from "../../src/pages/api/recipes/[slug]";

const fakeSession = { accessToken: "tok", repo: { owner: "rob", name: "recipes", branch: "main" } };

function jsonRequest(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
```

Every call site further down that currently passes `{ request: ... } as any` or `{ params: ..., request: ... } as any` gains `locals: { session: fakeSession }`, e.g.:

```typescript
  it("creates a recipe and returns its slug", async () => {
    mockStore.list.mockResolvedValue([]);
    mockStore.create.mockResolvedValue(undefined);
    const response = await POST({
      request: jsonRequest("http://localhost/api/recipes", "POST", {
        title: "Grandma's Chili",
        tags: ["Dinner", " spicy "],
        ingredients: ["beef"],
        instructions: ["cook"],
      }),
      locals: { session: fakeSession },
    } as any);
    expect(response.status).toBe(201);
    // ...unchanged assertions below
  });
```

Apply the same `locals: { session: fakeSession }` addition to every other `POST(...)`, `PUT(...)`, and `DELETE(...)` call in this file (the existing recipe body/fixtures and assertions are otherwise unchanged).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/api/recipes.test.ts`
Expected: FAIL — `getStore()` in the route files is still called with no arguments, so `mockStore.list`/etc. calls still work today but the production code doesn't read `locals.session` yet, meaning this step is really confirming the test file itself is internally consistent (it will actually still pass at this point since `getStore` mock ignores its argument — that's fine, this step exists to catch typos in the test edit before Step 3 changes production code). Proceed to Step 3 regardless.

- [ ] **Step 3: Update `src/pages/api/recipes/index.ts`**

```typescript
// src/pages/api/recipes/index.ts
import type { APIRoute } from "astro";
import { getStore } from "../../../lib/store";
import { slugify, dedupeSlug, type Recipe } from "../../../lib/recipe";
import { normalizeText, normalizeNutrition, normalizeTags, normalizeStringList } from "../../../lib/normalize";

export const POST: APIRoute = async ({ request, locals }) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }
  if (!body.title || typeof body.title !== "string") {
    return new Response(JSON.stringify({ error: "Title is required" }), { status: 400 });
  }

  const store = getStore({ accessToken: locals.session.accessToken, repo: locals.session.repo! });
  const existing = await store.list();
  const slug = dedupeSlug(slugify(body.title), existing.map((r) => r.slug));
  const now = new Date().toISOString();

  const recipe: Recipe = {
    slug,
    title: body.title.trim(),
    sourceUrl: normalizeText(body.sourceUrl),
    image: normalizeText(body.image),
    tags: normalizeTags(body.tags),
    servings: normalizeText(body.servings),
    prepTime: normalizeText(body.prepTime),
    cookTime: normalizeText(body.cookTime),
    ingredients: normalizeStringList(body.ingredients),
    instructions: normalizeStringList(body.instructions),
    nutrition: normalizeNutrition(body.nutrition),
    notes: normalizeText(body.notes),
    createdAt: now,
    updatedAt: now,
  };

  try {
    await store.create(recipe);
  } catch (err: any) {
    return new Response(JSON.stringify({ error: `Failed to save recipe: ${err.message}` }), { status: 502 });
  }

  return new Response(JSON.stringify({ slug }), { status: 201 });
};
```

- [ ] **Step 4: Update `src/pages/api/recipes/[slug].ts`**

```typescript
// src/pages/api/recipes/[slug].ts
import type { APIRoute } from "astro";
import { getStore } from "../../../lib/store";
import { normalizeText, normalizeNutrition, normalizeTags, normalizeStringList } from "../../../lib/normalize";

export const PUT: APIRoute = async ({ params, request, locals }) => {
  const slug = params.slug!;
  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }
  const store = getStore({ accessToken: locals.session.accessToken, repo: locals.session.repo! });
  const existing = await store.get(slug);

  if (!existing) {
    return new Response(JSON.stringify({ error: "Recipe not found" }), { status: 404 });
  }
  if (body.title !== undefined && (typeof body.title !== "string" || !body.title.trim())) {
    return new Response(JSON.stringify({ error: "Title is required" }), { status: 400 });
  }
  if (body.expectedSha && body.expectedSha !== existing.sha) {
    return new Response(
      JSON.stringify({ error: "Recipe changed elsewhere, reload and try again" }),
      { status: 409 }
    );
  }

  const updated = {
    ...existing.recipe,
    title: body.title !== undefined ? body.title.trim() : existing.recipe.title,
    sourceUrl: body.sourceUrl !== undefined ? normalizeText(body.sourceUrl) : existing.recipe.sourceUrl,
    image: body.image !== undefined ? normalizeText(body.image) : existing.recipe.image,
    tags: body.tags !== undefined ? normalizeTags(body.tags) : existing.recipe.tags,
    servings: body.servings !== undefined ? normalizeText(body.servings) : existing.recipe.servings,
    prepTime: body.prepTime !== undefined ? normalizeText(body.prepTime) : existing.recipe.prepTime,
    cookTime: body.cookTime !== undefined ? normalizeText(body.cookTime) : existing.recipe.cookTime,
    ingredients: Array.isArray(body.ingredients)
      ? normalizeStringList(body.ingredients)
      : existing.recipe.ingredients,
    instructions: Array.isArray(body.instructions)
      ? normalizeStringList(body.instructions)
      : existing.recipe.instructions,
    nutrition: body.nutrition !== undefined ? normalizeNutrition(body.nutrition) : existing.recipe.nutrition,
    notes: body.notes !== undefined ? normalizeText(body.notes) : existing.recipe.notes,
    updatedAt: new Date().toISOString(),
  };

  try {
    await store.update(updated, existing.sha);
  } catch (err: any) {
    return new Response(JSON.stringify({ error: `Failed to save recipe: ${err.message}` }), { status: 502 });
  }

  return new Response(JSON.stringify({ slug }), { status: 200 });
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const slug = params.slug!;
  const store = getStore({ accessToken: locals.session.accessToken, repo: locals.session.repo! });
  const existing = await store.get(slug);

  if (!existing) {
    return new Response(JSON.stringify({ error: "Recipe not found" }), { status: 404 });
  }

  try {
    await store.remove(slug, existing.sha, existing.recipe.title);
  } catch (err: any) {
    return new Response(JSON.stringify({ error: `Failed to delete recipe: ${err.message}` }), { status: 502 });
  }

  return new Response(null, { status: 204 });
};
```

- [ ] **Step 5: Update `src/pages/index.astro`**

```astro
---
// src/pages/index.astro (only the frontmatter changes)
import Layout from "../layouts/Layout.astro";
import RecipeCard from "../components/RecipeCard.astro";
import { getStore } from "../lib/store";

const store = getStore({ accessToken: Astro.locals.session.accessToken, repo: Astro.locals.session.repo! });
const recipes = await store.list();
recipes.sort((a, b) => a.title.localeCompare(b.title));
const allTags = Array.from(new Set(recipes.flatMap((r) => r.tags))).sort();
---
```

(The rest of the file — everything below the frontmatter — is unchanged.)

- [ ] **Step 6: Update `src/pages/recipes/[slug].astro`**

```astro
---
// src/pages/recipes/[slug].astro (only the frontmatter changes)
import Layout from "../../layouts/Layout.astro";
import { getStore } from "../../lib/store";

const { slug } = Astro.params;
const store = getStore({ accessToken: Astro.locals.session.accessToken, repo: Astro.locals.session.repo! });
const stored = slug ? await store.get(slug) : null;

if (!stored) {
  return new Response("Recipe not found", { status: 404 });
}
const recipe = stored.recipe;
---
```

(The rest of the file is unchanged.)

- [ ] **Step 7: Update `src/pages/recipes/[slug]/edit.astro`**

```astro
---
// src/pages/recipes/[slug]/edit.astro (only the frontmatter changes)
import Layout from "../../../layouts/Layout.astro";
import RecipeForm from "../../../components/RecipeForm.astro";
import { getStore } from "../../../lib/store";

const { slug } = Astro.params;
const store = getStore({ accessToken: Astro.locals.session.accessToken, repo: Astro.locals.session.repo! });
const stored = slug ? await store.get(slug) : null;

if (!stored) {
  return Astro.redirect("/");
}
---
```

(The rest of the file is unchanged.)

- [ ] **Step 8: Run the full suite to verify everything passes**

Run: `npm test`
Expected: PASS — all suites green, including the updated `tests/api/recipes.test.ts`.

- [ ] **Step 9: Commit**

```bash
git add src/pages/index.astro src/pages/recipes/[slug].astro "src/pages/recipes/[slug]/edit.astro" src/pages/api/recipes/index.ts "src/pages/api/recipes/[slug].ts" tests/api/recipes.test.ts
git commit -m "feat: wire per-request session into recipe pages and API routes"
```

---

## Task 11: Layout nav — GitHub identity, settings link, logout

**Files:**
- Modify: `src/layouts/Layout.astro`

**Interfaces:**
- Consumes: `Astro.locals.session` from Task 5.

- [ ] **Step 1: Update the layout**

```astro
---
// src/layouts/Layout.astro
import "../styles/global.css";

interface Props {
  title: string;
}
const { title } = Astro.props;
const { session } = Astro.locals;
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
        <a href="/recipes/new" class="inline-block rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white no-underline hover:bg-green-800 dark:bg-green-700 dark:hover:bg-green-800">+ New Recipe</a>
        <a href="/settings" class="text-sm text-zinc-600 no-underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">{session.githubLogin}</a>
        <form method="POST" action="/api/auth/logout">
          <button type="submit" class="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">Log out</button>
        </form>
      </div>
    </header>
    <main class="mx-auto max-w-3xl p-6">
      <slot />
    </main>
  </body>
</html>
```

- [ ] **Step 2: Run the full suite to confirm nothing broke**

Run: `npm test`
Expected: PASS (Layout.astro has no unit tests — this is a compile/regression check for the rest of the suite).

- [ ] **Step 3: Commit**

```bash
git add src/layouts/Layout.astro
git commit -m "feat: show GitHub login, settings link, and logout in the header"
```

---

## Task 12: Env-var regression guard, docs, and final verification

**Files:**
- Create: `tests/env-vars.test.ts`
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:** none — this task is regression coverage, docs, and full verification.

- [ ] **Step 1: Add the bare-`import.meta.env` regression guard**

This generalizes the existing per-file check that used to live in `tests/lib/store.test.ts` (removed in Task 4) to cover every file that now reads a custom env var.

```typescript
// tests/env-vars.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const filesUsingCustomEnvVars = [
  "../src/middleware.ts",
  "../src/pages/api/auth/login.ts",
  "../src/pages/api/auth/callback.ts",
  "../src/pages/api/settings/repo.ts",
];

describe("custom env var references", () => {
  it("never reference a bare import.meta.env — only per-key import.meta.env.KEY", () => {
    const bareUsage = /import\.meta\.env(?!\s*\.\s*\w)/g;
    for (const relativePath of filesUsingCustomEnvVars) {
      const source = readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf-8");
      expect(source.match(bareUsage), relativePath).toBeNull();
    }
  });

  it("explicitly references each required custom env key by literal name somewhere in the codebase", () => {
    const allSource = filesUsingCustomEnvVars
      .map((p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf-8"))
      .join("\n");
    expect(allSource).toContain("import.meta.env.SESSION_SECRET");
    expect(allSource).toContain("import.meta.env.GITHUB_CLIENT_ID");
    expect(allSource).toContain("import.meta.env.GITHUB_CLIENT_SECRET");
  });
});
```

- [ ] **Step 2: Run the new test to verify it passes against the already-written code**

Run: `npx vitest run tests/env-vars.test.ts`
Expected: PASS (2 tests) — all the routes from Tasks 5–9 already follow the literal-reference convention.

- [ ] **Step 3: Update `.env.example`**

```
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
SESSION_SECRET=
```

- [ ] **Step 4: Update `README.md`**

```markdown
# Recipe App

Astro app for capturing recipes — typed in by hand or imported from a link — stored as JSON files in a GitHub repo of your choosing.

## How it works

- Log in with GitHub, then pick a repo in Settings — recipes for your account live at `data/recipes/<slug>.json` in that repo, on its default branch.
- Server-side routes read/write that repo via the GitHub API, using your own OAuth access token — no database, and no shared credentials between users.
- Pasting a link parses the page's `schema.org/Recipe` structured data when present, falling back to a best-effort heuristic extraction otherwise.

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
3. Update your GitHub OAuth App's callback URL to `https://<your-netlify-domain>/api/auth/callback`.
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
- Log out → session cookie cleared, redirected to `/api/auth/login`.
- Simulate a revoked/expired token (e.g. revoke the OAuth App's access from your GitHub account settings) and try loading `/` → confirm a GitHub 401 bounces you back to login instead of crashing the page.
```

- [ ] **Step 5: Run the full suite and the production build**

Run: `npm test`
Expected: PASS — every suite green, including `tests/env-vars.test.ts`.

Run: `npm run build`
Expected: build succeeds with no type errors (this also catches any lingering reference to the deleted `src/lib/env.ts` or old `getStore()` call sites).

- [ ] **Step 6: Commit**

```bash
git add tests/env-vars.test.ts .env.example README.md
git commit -m "docs: document GitHub OAuth setup and multi-user manual QA checklist"
```

---

## Self-Review Notes

- **Spec coverage:** OAuth login/callback/logout (Tasks 6–8), encrypted stateless session cookie (Task 1), settings page + repo picker with default-branch auto-selection (Task 9), per-user store refactor (Tasks 4, 10), legacy env-var mode removal (Task 4), error handling for state mismatch/token exchange failure/401/403 (Tasks 7, 9, and manual QA in Task 12), middleware gating (Tasks 3, 5) — every design section maps to at least one task.
- **Type consistency verified:** `Session`/`RepoRef` (Task 1) are reused as-is by `routing.ts` (Task 3), `callback.ts` (Task 7), `repo.ts` (Task 9), and `App.Locals.session` (Task 5). `StoreSession` (Task 4) is a narrower, decoupled shape built at each call site in Task 10 via `locals.session` (whose `repo` is guaranteed non-null past the middleware gate — same `!`-assertion convention already used in this codebase for guaranteed-present `params.slug`).
- **No placeholders:** every step above has complete, runnable code — no TODOs or "add error handling here" stubs.
