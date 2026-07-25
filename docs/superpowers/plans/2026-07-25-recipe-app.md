# Recipe App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Astro app (Netlify SSR) for capturing recipes — manually or by pasting a link — that stores each recipe as a JSON file committed to a GitHub repo, with view/edit pages and tag-based categorization.

**Architecture:** Astro `output: "server"` on the Netlify adapter. No database — a thin `RecipeStore` wraps the GitHub Contents API (via Octokit) and is the only place that touches persistence. Pages read live from GitHub on every request; API routes handle writes. A link-import pipeline (`extract/`) parses `schema.org/Recipe` JSON-LD with a heuristic fallback. UI is Astro components with small vanilla-JS islands — no client framework.

**Tech Stack:** Astro 4, `@astrojs/netlify`, `@octokit/rest`, `node-html-parser`, TypeScript (strict), Vitest.

## Global Constraints

- Single-user app, no login/auth — do not add an auth flow.
- Persistence is GitHub only: recipes live at `data/recipes/<slug>.json` in the repo identified by `GITHUB_REPO`. No database.
- Tags are freeform strings (lowercased, trimmed on save) — no fixed category list.
- Nutrition fields are optional free-text strings — no unit parsing/normalization.
- No client-side JS framework — vanilla JS islands only.
- No e2e/browser test infra — UI tasks are verified manually against the dev server; only `src/lib/**` and `src/pages/api/**` get automated (Vitest) tests.
- Env vars: `GITHUB_TOKEN` (required), `GITHUB_REPO` in `owner/name` form (required), `GITHUB_BRANCH` (optional, defaults to `main`). Missing required vars must fail fast with a clear error.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `astro.config.mjs`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `netlify.toml`
- Create: `src/env.d.ts`
- Create: `src/layouts/Layout.astro`
- Create: `public/global.css`
- Create: `src/pages/index.astro` (placeholder, replaced in Task 14)

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `Layout.astro` — Astro component, prop `{ title: string }`, renders `<slot />` inside `<main>` with `/global.css` linked. All later pages wrap content in this.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "recipe-app",
  "type": "module",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "astro": "^4.16.0",
    "@astrojs/netlify": "^5.5.0",
    "@octokit/rest": "^20.1.1",
    "node-html-parser": "^6.1.13"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "extends": "astro/tsconfigs/strict",
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist"]
}
```

- [ ] **Step 3: Write `astro.config.mjs`**

```js
import { defineConfig } from "astro/config";
import netlify from "@astrojs/netlify";

export default defineConfig({
  output: "server",
  adapter: netlify(),
});
```

- [ ] **Step 4: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 5: Write `.gitignore`**

```
node_modules/
dist/
.netlify/
.env
.env.*
!.env.example
```

- [ ] **Step 6: Write `.env.example`**

```
GITHUB_TOKEN=
GITHUB_REPO=owner/name
GITHUB_BRANCH=main
```

- [ ] **Step 7: Write `netlify.toml`**

```toml
[build]
command = "astro build"
publish = "dist"
```

- [ ] **Step 8: Write `src/env.d.ts`**

```ts
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly GITHUB_TOKEN: string;
  readonly GITHUB_REPO: string;
  readonly GITHUB_BRANCH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 9: Write `src/layouts/Layout.astro`**

```astro
---
interface Props {
  title: string;
}
const { title } = Astro.props;
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{title} · Recipes</title>
    <link rel="stylesheet" href="/global.css" />
  </head>
  <body>
    <header class="site-header">
      <a href="/" class="site-title">Recipes</a>
      <a href="/recipes/new" class="button">+ New Recipe</a>
    </header>
    <main>
      <slot />
    </main>
  </body>
</html>
```

- [ ] **Step 10: Write `public/global.css`**

```css
:root {
  color-scheme: light dark;
  --border: #d9d3c7;
  --accent: #b3521e;
  --text: #2b2620;
  --bg: #faf7f2;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: system-ui, sans-serif;
  color: var(--text);
  background: var(--bg);
}

main { max-width: 860px; margin: 0 auto; padding: 1.5rem; }

.site-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border);
}

.site-title { font-weight: 700; text-decoration: none; color: inherit; font-size: 1.2rem; }

.button, button[type="submit"], #add-ingredient, #add-instruction, #import-button {
  background: var(--accent);
  color: #fff;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  text-decoration: none;
  display: inline-block;
  font-size: 0.95rem;
}

button.danger { background: #a3312a; }

.recipe-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1rem;
  margin-top: 1rem;
}

.recipe-card {
  display: block;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 1rem;
  text-decoration: none;
  color: inherit;
}

.recipe-card img { width: 100%; height: 140px; object-fit: cover; border-radius: 6px; }

.tag-list { list-style: none; display: flex; flex-wrap: wrap; gap: 0.4rem; padding: 0; margin: 0.5rem 0; }

.tag, .tag-filter {
  background: rgba(179, 82, 30, 0.12);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.15rem 0.6rem;
  font-size: 0.8rem;
}

button.tag-filter { cursor: pointer; }
button.tag-filter.active { background: var(--accent); color: #fff; }

.message { min-height: 1.2rem; }
.message.error { color: #a3312a; }

.row { display: flex; gap: 0.5rem; margin-bottom: 0.4rem; }
.row input { flex: 1; }

form label { display: block; margin-top: 0.75rem; font-weight: 600; }
form input, form textarea { width: 100%; padding: 0.4rem; border: 1px solid var(--border); border-radius: 4px; }

.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.5rem; }

fieldset { border: 1px solid var(--border); border-radius: 6px; margin-top: 1rem; }

.form-actions { display: flex; gap: 0.5rem; margin-top: 1.5rem; }

.recipe-header { display: flex; justify-content: space-between; align-items: center; }
.recipe-image { max-width: 100%; border-radius: 8px; }
```

- [ ] **Step 11: Write placeholder `src/pages/index.astro`**

```astro
---
import Layout from "../layouts/Layout.astro";
---
<Layout title="Recipes">
  <h1>Recipes</h1>
  <p>Coming soon.</p>
</Layout>
```

- [ ] **Step 12: Install dependencies and verify build**

Run: `npm install`
Run: `npm run build`
Expected: build succeeds, `dist/` created, no errors.

- [ ] **Step 13: Commit**

```bash
git add package.json tsconfig.json astro.config.mjs vitest.config.ts .gitignore .env.example netlify.toml src/env.d.ts src/layouts/Layout.astro public/global.css src/pages/index.astro package-lock.json
git commit -m "chore: scaffold Astro project with Netlify SSR adapter"
```

---

### Task 2: Recipe data model & slug utilities

**Files:**
- Create: `src/lib/recipe.ts`
- Test: `tests/lib/recipe.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `interface Nutrition { calories?, protein?, fat?, carbohydrates?, fiber?, sugar?, sodium?: string }`
  - `interface Recipe { slug: string; title: string; sourceUrl?: string; image?: string; tags: string[]; servings?: string; prepTime?: string; cookTime?: string; ingredients: string[]; instructions: string[]; nutrition?: Nutrition; notes?: string; createdAt: string; updatedAt: string }`
  - `slugify(title: string): string`
  - `dedupeSlug(base: string, existingSlugs: string[]): string`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/recipe.test.ts
import { describe, it, expect } from "vitest";
import { slugify, dedupeSlug } from "../../src/lib/recipe";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Grandma's Chili")).toBe("grandma-s-chili");
  });

  it("collapses punctuation and whitespace", () => {
    expect(slugify("  Spicy!!  Thai   Soup  ")).toBe("spicy-thai-soup");
  });

  it("falls back to 'recipe' for empty input", () => {
    expect(slugify("   ")).toBe("recipe");
  });
});

describe("dedupeSlug", () => {
  it("returns the base slug when unused", () => {
    expect(dedupeSlug("chili", [])).toBe("chili");
  });

  it("appends -2 on first collision", () => {
    expect(dedupeSlug("chili", ["chili"])).toBe("chili-2");
  });

  it("finds the next free suffix", () => {
    expect(dedupeSlug("chili", ["chili", "chili-2", "chili-3"])).toBe("chili-4");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/recipe.test.ts`
Expected: FAIL — `src/lib/recipe.ts` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/recipe.ts
export interface Nutrition {
  calories?: string;
  protein?: string;
  fat?: string;
  carbohydrates?: string;
  fiber?: string;
  sugar?: string;
  sodium?: string;
}

export interface Recipe {
  slug: string;
  title: string;
  sourceUrl?: string;
  image?: string;
  tags: string[];
  servings?: string;
  prepTime?: string;
  cookTime?: string;
  ingredients: string[];
  instructions: string[];
  nutrition?: Nutrition;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "recipe";
}

export function dedupeSlug(base: string, existingSlugs: string[]): string {
  const taken = new Set(existingSlugs);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/recipe.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/recipe.ts tests/lib/recipe.test.ts
git commit -m "feat: add recipe data model and slug utilities"
```

---

### Task 3: Env config loader

**Files:**
- Create: `src/lib/env.ts`
- Test: `tests/lib/env.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `interface AppConfig { githubToken: string; owner: string; repo: string; branch: string }`
  - `loadConfig(env: Record<string, string | undefined>): AppConfig` — throws `Error` with a clear message on missing/malformed vars.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/env.test.ts
import { describe, it, expect } from "vitest";
import { loadConfig } from "../../src/lib/env";

describe("loadConfig", () => {
  it("parses valid env vars", () => {
    const config = loadConfig({
      GITHUB_TOKEN: "tok_123",
      GITHUB_REPO: "rob/recipes",
      GITHUB_BRANCH: "main",
    });
    expect(config).toEqual({
      githubToken: "tok_123",
      owner: "rob",
      repo: "recipes",
      branch: "main",
    });
  });

  it("defaults branch to main when unset", () => {
    const config = loadConfig({ GITHUB_TOKEN: "tok_123", GITHUB_REPO: "rob/recipes" });
    expect(config.branch).toBe("main");
  });

  it("throws when GITHUB_TOKEN is missing", () => {
    expect(() => loadConfig({ GITHUB_REPO: "rob/recipes" })).toThrow(/GITHUB_TOKEN/);
  });

  it("throws when GITHUB_REPO is missing", () => {
    expect(() => loadConfig({ GITHUB_TOKEN: "tok_123" })).toThrow(/GITHUB_REPO/);
  });

  it("throws when GITHUB_REPO is malformed", () => {
    expect(() => loadConfig({ GITHUB_TOKEN: "tok_123", GITHUB_REPO: "not-a-repo" })).toThrow(/owner\/name/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/env.test.ts`
Expected: FAIL — `src/lib/env.ts` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/env.ts
export interface AppConfig {
  githubToken: string;
  owner: string;
  repo: string;
  branch: string;
}

export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const token = env.GITHUB_TOKEN;
  const repoFull = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH || "main";

  if (!token) throw new Error("Missing required env var GITHUB_TOKEN");
  if (!repoFull) throw new Error("Missing required env var GITHUB_REPO");

  const [owner, repo] = repoFull.split("/");
  if (!owner || !repo) {
    throw new Error(`GITHUB_REPO must be in "owner/name" format, got "${repoFull}"`);
  }

  return { githubToken: token, owner, repo, branch };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/env.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/env.ts tests/lib/env.test.ts
git commit -m "feat: add env config loader with fail-fast validation"
```

---

### Task 4: GitHub RecipeStore

**Files:**
- Create: `src/lib/github.ts`
- Create: `src/lib/store.ts`
- Test: `tests/lib/github.test.ts`

**Interfaces:**
- Consumes: `Recipe` from `src/lib/recipe.ts`; `AppConfig`, `loadConfig` from `src/lib/env.ts`
- Produces:
  - `interface GithubClient { repos: { getContent(params): Promise<any>; createOrUpdateFileContents(params): Promise<any>; deleteFile(params): Promise<any> } }`
  - `class RecipeStore { constructor(client: GithubClient, config: { owner: string; repo: string; branch: string }); list(): Promise<Recipe[]>; get(slug: string): Promise<{ recipe: Recipe; sha: string } | null>; create(recipe: Recipe): Promise<void>; update(recipe: Recipe, sha: string): Promise<void>; remove(slug: string, sha: string, title: string): Promise<void> }`
  - `getStore(): RecipeStore` (from `store.ts`, real Octokit-backed singleton, used by pages/API routes)

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/github.test.ts
import { describe, it, expect, vi } from "vitest";
import { RecipeStore } from "../../src/lib/github";
import type { Recipe } from "../../src/lib/recipe";

const config = { owner: "rob", repo: "recipes", branch: "main" };

function b64(obj: unknown) {
  return Buffer.from(JSON.stringify(obj)).toString("base64");
}

const sampleRecipe: Recipe = {
  slug: "chili",
  title: "Chili",
  tags: ["dinner"],
  ingredients: ["beef"],
  instructions: ["cook"],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("RecipeStore", () => {
  it("lists recipes from the recipes directory", async () => {
    const client = {
      repos: {
        getContent: vi.fn(async ({ path }: { path: string }) => {
          if (path === "data/recipes") {
            return { data: [{ type: "file", name: "chili.json", path: "data/recipes/chili.json" }] };
          }
          return { data: { type: "file", content: b64(sampleRecipe), sha: "sha-1" } };
        }),
        createOrUpdateFileContents: vi.fn(),
        deleteFile: vi.fn(),
      },
    };
    const store = new RecipeStore(client as any, config);
    const recipes = await store.list();
    expect(recipes).toEqual([sampleRecipe]);
  });

  it("returns an empty list when the directory does not exist", async () => {
    const client = {
      repos: {
        getContent: vi.fn(async () => {
          const err: any = new Error("Not Found");
          err.status = 404;
          throw err;
        }),
        createOrUpdateFileContents: vi.fn(),
        deleteFile: vi.fn(),
      },
    };
    const store = new RecipeStore(client as any, config);
    expect(await store.list()).toEqual([]);
  });

  it("gets a single recipe with its sha", async () => {
    const client = {
      repos: {
        getContent: vi.fn(async () => ({ data: { type: "file", content: b64(sampleRecipe), sha: "sha-1" } })),
        createOrUpdateFileContents: vi.fn(),
        deleteFile: vi.fn(),
      },
    };
    const store = new RecipeStore(client as any, config);
    expect(await store.get("chili")).toEqual({ recipe: sampleRecipe, sha: "sha-1" });
  });

  it("returns null when a recipe is not found", async () => {
    const client = {
      repos: {
        getContent: vi.fn(async () => {
          const err: any = new Error("Not Found");
          err.status = 404;
          throw err;
        }),
        createOrUpdateFileContents: vi.fn(),
        deleteFile: vi.fn(),
      },
    };
    const store = new RecipeStore(client as any, config);
    expect(await store.get("missing")).toBeNull();
  });

  it("creates a recipe via createOrUpdateFileContents without a sha", async () => {
    const createOrUpdateFileContents = vi.fn(async () => ({}));
    const client = { repos: { getContent: vi.fn(), createOrUpdateFileContents, deleteFile: vi.fn() } };
    const store = new RecipeStore(client as any, config);
    await store.create(sampleRecipe);
    expect(createOrUpdateFileContents).toHaveBeenCalledWith(
      expect.objectContaining({ path: "data/recipes/chili.json", sha: undefined })
    );
  });

  it("updates a recipe via createOrUpdateFileContents with the given sha", async () => {
    const createOrUpdateFileContents = vi.fn(async () => ({}));
    const client = { repos: { getContent: vi.fn(), createOrUpdateFileContents, deleteFile: vi.fn() } };
    const store = new RecipeStore(client as any, config);
    await store.update(sampleRecipe, "sha-1");
    expect(createOrUpdateFileContents).toHaveBeenCalledWith(
      expect.objectContaining({ path: "data/recipes/chili.json", sha: "sha-1" })
    );
  });

  it("removes a recipe via deleteFile", async () => {
    const deleteFile = vi.fn(async () => ({}));
    const client = { repos: { getContent: vi.fn(), createOrUpdateFileContents: vi.fn(), deleteFile } };
    const store = new RecipeStore(client as any, config);
    await store.remove("chili", "sha-1", "Chili");
    expect(deleteFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: "data/recipes/chili.json", sha: "sha-1" })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/github.test.ts`
Expected: FAIL — `src/lib/github.ts` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/github.ts
import type { Recipe } from "./recipe";

const RECIPES_DIR = "data/recipes";

export interface GithubClient {
  repos: {
    getContent(params: { owner: string; repo: string; path: string; ref?: string }): Promise<any>;
    createOrUpdateFileContents(params: {
      owner: string;
      repo: string;
      path: string;
      message: string;
      content: string;
      sha?: string;
      branch: string;
    }): Promise<any>;
    deleteFile(params: {
      owner: string;
      repo: string;
      path: string;
      message: string;
      sha: string;
      branch: string;
    }): Promise<any>;
  };
}

export interface GithubStoreConfig {
  owner: string;
  repo: string;
  branch: string;
}

export interface StoredRecipe {
  recipe: Recipe;
  sha: string;
}

export class RecipeStore {
  constructor(private client: GithubClient, private config: GithubStoreConfig) {}

  private path(slug: string): string {
    return `${RECIPES_DIR}/${slug}.json`;
  }

  async list(): Promise<Recipe[]> {
    const { owner, repo, branch } = this.config;
    let entries: any[];
    try {
      const res = await this.client.repos.getContent({ owner, repo, path: RECIPES_DIR, ref: branch });
      entries = Array.isArray(res.data) ? res.data : [];
    } catch (err: any) {
      if (err.status === 404) return [];
      throw err;
    }
    const files = entries.filter((e) => e.type === "file" && e.name.endsWith(".json"));
    const results = await Promise.all(
      files.map((f) => this.get(f.name.replace(/\.json$/, "")))
    );
    return results.filter((r): r is StoredRecipe => r !== null).map((r) => r.recipe);
  }

  async get(slug: string): Promise<StoredRecipe | null> {
    const { owner, repo, branch } = this.config;
    try {
      const res = await this.client.repos.getContent({ owner, repo, path: this.path(slug), ref: branch });
      if (Array.isArray(res.data) || res.data.type !== "file") return null;
      const content = Buffer.from(res.data.content, "base64").toString("utf-8");
      return { recipe: JSON.parse(content) as Recipe, sha: res.data.sha };
    } catch (err: any) {
      if (err.status === 404) return null;
      throw err;
    }
  }

  async create(recipe: Recipe): Promise<void> {
    const { owner, repo, branch } = this.config;
    await this.client.repos.createOrUpdateFileContents({
      owner,
      repo,
      branch,
      path: this.path(recipe.slug),
      message: `Add recipe: ${recipe.title}`,
      content: Buffer.from(JSON.stringify(recipe, null, 2)).toString("base64"),
    });
  }

  async update(recipe: Recipe, sha: string): Promise<void> {
    const { owner, repo, branch } = this.config;
    await this.client.repos.createOrUpdateFileContents({
      owner,
      repo,
      branch,
      path: this.path(recipe.slug),
      message: `Update recipe: ${recipe.title}`,
      content: Buffer.from(JSON.stringify(recipe, null, 2)).toString("base64"),
      sha,
    });
  }

  async remove(slug: string, sha: string, title: string): Promise<void> {
    const { owner, repo, branch } = this.config;
    await this.client.repos.deleteFile({
      owner,
      repo,
      branch,
      path: this.path(slug),
      message: `Delete recipe: ${title}`,
      sha,
    });
  }
}
```

```ts
// src/lib/store.ts
import { Octokit } from "@octokit/rest";
import { RecipeStore } from "./github";
import { loadConfig } from "./env";

let cached: RecipeStore | null = null;

export function getStore(): RecipeStore {
  if (cached) return cached;
  const config = loadConfig(import.meta.env as unknown as Record<string, string | undefined>);
  const octokit = new Octokit({ auth: config.githubToken });
  cached = new RecipeStore(octokit, config);
  return cached;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/github.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/github.ts src/lib/store.ts tests/lib/github.test.ts
git commit -m "feat: add GitHub-backed RecipeStore"
```

---

### Task 5: JSON-LD recipe extractor

**Files:**
- Create: `src/lib/extract/jsonld.ts`
- Create: `tests/fixtures/jsonld-recipe.html`
- Create: `tests/fixtures/no-recipe.html`
- Test: `tests/lib/extract/jsonld.test.ts`

**Interfaces:**
- Consumes: `Recipe` from `src/lib/recipe.ts`
- Produces: `extractJsonLdRecipe(html: string): Omit<Recipe, "slug" | "createdAt" | "updatedAt"> | null`

- [ ] **Step 1: Write fixture HTML files**

```html
<!-- tests/fixtures/jsonld-recipe.html -->
<!doctype html>
<html>
<head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Recipe",
  "name": "Grandma's Chili",
  "image": ["https://example.com/chili.jpg"],
  "recipeYield": "6 servings",
  "prepTime": "PT15M",
  "cookTime": "PT2H",
  "recipeIngredient": ["1 lb ground beef", "2 cans kidney beans"],
  "recipeInstructions": [
    { "@type": "HowToStep", "text": "Brown the beef." },
    { "@type": "HowToStep", "text": "Add remaining ingredients and simmer." }
  ],
  "nutrition": {
    "@type": "NutritionInformation",
    "calories": "320 kcal",
    "proteinContent": "18g",
    "carbohydrateContent": "35g"
  }
}
</script>
</head>
<body><h1>Grandma's Chili</h1></body>
</html>
```

```html
<!-- tests/fixtures/no-recipe.html -->
<!doctype html>
<html>
<head><title>Just a blog post</title></head>
<body><h1>Not a recipe</h1><p>Nothing structured here.</p></body>
</html>
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/lib/extract/jsonld.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractJsonLdRecipe } from "../../../src/lib/extract/jsonld";

const fixture = (name: string) => readFileSync(join(__dirname, "../../fixtures", name), "utf-8");

describe("extractJsonLdRecipe", () => {
  it("parses a schema.org Recipe from JSON-LD", () => {
    const result = extractJsonLdRecipe(fixture("jsonld-recipe.html"));
    expect(result).toEqual({
      title: "Grandma's Chili",
      image: "https://example.com/chili.jpg",
      tags: [],
      servings: "6 servings",
      prepTime: "PT15M",
      cookTime: "PT2H",
      ingredients: ["1 lb ground beef", "2 cans kidney beans"],
      instructions: ["Brown the beef.", "Add remaining ingredients and simmer."],
      nutrition: { calories: "320 kcal", protein: "18g", carbohydrates: "35g" },
      notes: undefined,
      sourceUrl: undefined,
    });
  });

  it("returns null when no Recipe JSON-LD is present", () => {
    expect(extractJsonLdRecipe(fixture("no-recipe.html"))).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/lib/extract/jsonld.test.ts`
Expected: FAIL — `src/lib/extract/jsonld.ts` does not exist yet.

- [ ] **Step 4: Write minimal implementation**

```ts
// src/lib/extract/jsonld.ts
import { parse } from "node-html-parser";
import type { Recipe } from "../recipe";

type PartialRecipe = Omit<Recipe, "slug" | "createdAt" | "updatedAt">;

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function findRecipeNode(json: any): any | null {
  const nodes: any[] = [];
  const collect = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(collect);
      return;
    }
    nodes.push(node);
    if (Array.isArray(node["@graph"])) node["@graph"].forEach(collect);
  };
  collect(json);
  return (
    nodes.find((n) =>
      asArray(n["@type"]).some((t) => typeof t === "string" && t.toLowerCase() === "recipe")
    ) ?? null
  );
}

function textOf(value: any): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && typeof value.text === "string") return value.text.trim();
  return "";
}

function extractInstructions(raw: any): string[] {
  if (!raw) return [];
  if (typeof raw === "string") {
    return raw.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  }
  const steps: string[] = [];
  for (const item of asArray(raw)) {
    if (typeof item === "string") {
      steps.push(item.trim());
    } else if (item && item["@type"] === "HowToSection" && Array.isArray(item.itemListElement)) {
      steps.push(...extractInstructions(item.itemListElement));
    } else {
      const text = textOf(item);
      if (text) steps.push(text);
    }
  }
  return steps.filter(Boolean);
}

function extractImage(raw: any): string | undefined {
  if (!raw) return undefined;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return extractImage(raw[0]);
  if (typeof raw === "object" && typeof raw.url === "string") return raw.url;
  return undefined;
}

function extractNutrition(raw: any): Recipe["nutrition"] | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const nutrition: Recipe["nutrition"] = {
    calories: raw.calories?.trim?.() || undefined,
    protein: raw.proteinContent?.trim?.() || undefined,
    fat: raw.fatContent?.trim?.() || undefined,
    carbohydrates: raw.carbohydrateContent?.trim?.() || undefined,
    fiber: raw.fiberContent?.trim?.() || undefined,
    sugar: raw.sugarContent?.trim?.() || undefined,
    sodium: raw.sodiumContent?.trim?.() || undefined,
  };
  return Object.values(nutrition).some(Boolean) ? nutrition : undefined;
}

export function extractJsonLdRecipe(html: string): PartialRecipe | null {
  const root = parse(html);
  const scripts = root.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    let json: any;
    try {
      json = JSON.parse(script.textContent);
    } catch {
      continue;
    }
    const node = findRecipeNode(json);
    if (!node) continue;
    const title = typeof node.name === "string" ? node.name.trim() : "";
    if (!title) continue;
    return {
      title,
      image: extractImage(node.image),
      tags: [],
      servings: asArray(node.recipeYield).map(String).join(", ") || undefined,
      prepTime: typeof node.prepTime === "string" ? node.prepTime : undefined,
      cookTime: typeof node.cookTime === "string" ? node.cookTime : undefined,
      ingredients: asArray(node.recipeIngredient).map((i: any) => String(i).trim()).filter(Boolean),
      instructions: extractInstructions(node.recipeInstructions),
      nutrition: extractNutrition(node.nutrition),
      notes: undefined,
      sourceUrl: undefined,
    };
  }
  return null;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/lib/extract/jsonld.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/extract/jsonld.ts tests/fixtures/jsonld-recipe.html tests/fixtures/no-recipe.html tests/lib/extract/jsonld.test.ts
git commit -m "feat: parse schema.org Recipe JSON-LD from imported pages"
```

---

### Task 6: Fallback heuristic extractor

**Files:**
- Create: `src/lib/extract/fallback.ts`
- Create: `tests/fixtures/heuristic-recipe.html`
- Test: `tests/lib/extract/fallback.test.ts`

**Interfaces:**
- Consumes: `Recipe` from `src/lib/recipe.ts`
- Produces: `extractFallbackRecipe(html: string): Omit<Recipe, "slug" | "createdAt" | "updatedAt">` (never null — always returns a best-effort draft)

- [ ] **Step 1: Write fixture HTML**

```html
<!-- tests/fixtures/heuristic-recipe.html -->
<!doctype html>
<html>
<head><title>Weeknight Pasta</title></head>
<body>
  <h1>Weeknight Pasta</h1>
  <h2>Ingredients</h2>
  <ul>
    <li>1 lb spaghetti</li>
    <li>2 cloves garlic</li>
    <li>1/4 cup olive oil</li>
  </ul>
  <h2>Directions</h2>
  <ol>
    <li>Boil the pasta.</li>
    <li>Saute garlic in olive oil.</li>
    <li>Toss together and serve.</li>
  </ol>
</body>
</html>
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/lib/extract/fallback.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractFallbackRecipe } from "../../../src/lib/extract/fallback";

const fixture = (name: string) => readFileSync(join(__dirname, "../../fixtures", name), "utf-8");

describe("extractFallbackRecipe", () => {
  it("finds title, ingredients, and instructions near matching headings", () => {
    const result = extractFallbackRecipe(fixture("heuristic-recipe.html"));
    expect(result.title).toBe("Weeknight Pasta");
    expect(result.ingredients).toEqual(["1 lb spaghetti", "2 cloves garlic", "1/4 cup olive oil"]);
    expect(result.instructions).toEqual(["Boil the pasta.", "Saute garlic in olive oil.", "Toss together and serve."]);
    expect(result.tags).toEqual([]);
  });

  it("returns empty arrays instead of throwing when nothing matches", () => {
    const result = extractFallbackRecipe("<html><head><title>Empty</title></head><body></body></html>");
    expect(result.title).toBe("Empty");
    expect(result.ingredients).toEqual([]);
    expect(result.instructions).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/lib/extract/fallback.test.ts`
Expected: FAIL — `src/lib/extract/fallback.ts` does not exist yet.

- [ ] **Step 4: Write minimal implementation**

```ts
// src/lib/extract/fallback.ts
import { parse, type HTMLElement } from "node-html-parser";
import type { Recipe } from "../recipe";

type PartialRecipe = Omit<Recipe, "slug" | "createdAt" | "updatedAt">;

function extractTitle(root: HTMLElement): string {
  const h1 = root.querySelector("h1");
  if (h1 && h1.textContent.trim()) return h1.textContent.trim();
  const titleTag = root.querySelector("title");
  return titleTag && titleTag.textContent.trim() ? titleTag.textContent.trim() : "Untitled Recipe";
}

function findListNear(root: HTMLElement, keywords: RegExp): string[] {
  const headings = root.querySelectorAll("h1, h2, h3, h4, strong, b");
  for (const heading of headings) {
    if (!keywords.test(heading.textContent)) continue;
    let sibling = heading.nextElementSibling;
    let hops = 0;
    while (sibling && hops < 4) {
      if (sibling.tagName === "UL" || sibling.tagName === "OL") {
        const items = sibling
          .querySelectorAll("li")
          .map((li) => li.textContent.trim())
          .filter(Boolean);
        if (items.length) return items;
      }
      sibling = sibling.nextElementSibling;
      hops++;
    }
  }
  return [];
}

export function extractFallbackRecipe(html: string): PartialRecipe {
  const root = parse(html);
  return {
    title: extractTitle(root),
    tags: [],
    ingredients: findListNear(root, /ingredients?/i),
    instructions: findListNear(root, /instructions?|directions?|steps?|method/i),
    image: undefined,
    servings: undefined,
    prepTime: undefined,
    cookTime: undefined,
    nutrition: undefined,
    notes: undefined,
    sourceUrl: undefined,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/lib/extract/fallback.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/extract/fallback.ts tests/fixtures/heuristic-recipe.html tests/lib/extract/fallback.test.ts
git commit -m "feat: add heuristic fallback recipe extractor"
```

---

### Task 7: Extract orchestrator

**Files:**
- Create: `src/lib/extract/index.ts`
- Test: `tests/lib/extract/index.test.ts`

**Interfaces:**
- Consumes: `extractJsonLdRecipe` (Task 5), `extractFallbackRecipe` (Task 6), `Recipe` type
- Produces:
  - `interface ImportResult { recipe: Omit<Recipe, "slug" | "createdAt" | "updatedAt">; warning?: string }`
  - `extractRecipeFromUrl(url: string): Promise<ImportResult>` — throws `Error` on unreachable URL or non-OK response

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/extract/index.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { extractRecipeFromUrl } from "../../../src/lib/extract";

afterEach(() => {
  vi.unstubAllGlobals();
});

const jsonLdHtml = `<html><head><script type="application/ld+json">
{"@type":"Recipe","name":"Soup","recipeIngredient":["water"],"recipeInstructions":["Boil it."]}
</script></head><body></body></html>`;

const plainHtml = `<html><head><title>Blog</title></head><body><h1>Blog</h1></body></html>`;

describe("extractRecipeFromUrl", () => {
  it("returns a recipe with no warning when JSON-LD is present", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(jsonLdHtml, { status: 200 })));
    const result = await extractRecipeFromUrl("https://example.com/soup");
    expect(result.recipe.title).toBe("Soup");
    expect(result.recipe.sourceUrl).toBe("https://example.com/soup");
    expect(result.warning).toBeUndefined();
  });

  it("falls back with a warning when no JSON-LD is present", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(plainHtml, { status: 200 })));
    const result = await extractRecipeFromUrl("https://example.com/blog");
    expect(result.recipe.title).toBe("Blog");
    expect(result.warning).toMatch(/heuristically/);
  });

  it("throws when the response is not OK", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    await expect(extractRecipeFromUrl("https://example.com/missing")).rejects.toThrow(/404/);
  });

  it("throws when fetch itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    await expect(extractRecipeFromUrl("https://example.com/down")).rejects.toThrow(/network down/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/extract/index.test.ts`
Expected: FAIL — `src/lib/extract/index.ts` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/extract/index.ts
import { extractJsonLdRecipe } from "./jsonld";
import { extractFallbackRecipe } from "./fallback";
import type { Recipe } from "../recipe";

export interface ImportResult {
  recipe: Omit<Recipe, "slug" | "createdAt" | "updatedAt">;
  warning?: string;
}

export async function extractRecipeFromUrl(url: string): Promise<ImportResult> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (recipe-importer)" } });
  } catch (err: any) {
    throw new Error(`Could not reach ${url}: ${err.message}`);
  }
  if (!response.ok) {
    throw new Error(`${url} responded with status ${response.status}`);
  }
  const html = await response.text();
  const jsonLd = extractJsonLdRecipe(html);
  if (jsonLd) {
    return { recipe: { ...jsonLd, sourceUrl: url } };
  }
  const fallback = extractFallbackRecipe(html);
  return {
    recipe: { ...fallback, sourceUrl: url },
    warning:
      "No structured recipe data found on this page. Fields were extracted heuristically — please review carefully before saving.",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/extract/index.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/extract/index.ts tests/lib/extract/index.test.ts
git commit -m "feat: orchestrate JSON-LD import with heuristic fallback"
```

---

### Task 8: API routes — create, update, delete recipe

**Files:**
- Create: `src/pages/api/recipes/index.ts`
- Create: `src/pages/api/recipes/[slug].ts`
- Test: `tests/api/recipes.test.ts`

**Interfaces:**
- Consumes: `getStore` from `src/lib/store.ts`; `slugify`, `dedupeSlug`, `Recipe` from `src/lib/recipe.ts`
- Produces: Astro `POST`/`PUT`/`DELETE` route handlers at `/api/recipes` and `/api/recipes/[slug]`. Response bodies: `{ slug: string }` on success, `{ error: string }` on failure. Status codes: 201 (create), 200 (update), 204 (delete), 400 (bad input), 404 (not found), 409 (sha conflict), 502 (GitHub failure).

- [ ] **Step 1: Write the failing test**

```ts
// tests/api/recipes.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockStore = {
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
};

vi.mock("../../src/lib/store", () => ({
  getStore: () => mockStore,
}));

import { POST } from "../../src/pages/api/recipes/index";
import { PUT, DELETE } from "../../src/pages/api/recipes/[slug]";

function jsonRequest(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const existingRecipe = {
  slug: "chili",
  title: "Chili",
  tags: ["dinner"],
  ingredients: ["beef"],
  instructions: ["cook"],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("POST /api/recipes", () => {
  beforeEach(() => vi.clearAllMocks());

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
    } as any);
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.slug).toBe("grandma-s-chili");
    expect(mockStore.create).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "grandma-s-chili", tags: ["dinner", "spicy"] })
    );
  });

  it("rejects a missing title with 400", async () => {
    const response = await POST({ request: jsonRequest("http://localhost/api/recipes", "POST", {}) } as any);
    expect(response.status).toBe(400);
  });

  it("returns 502 when the GitHub write fails", async () => {
    mockStore.list.mockResolvedValue([]);
    mockStore.create.mockRejectedValue(new Error("rate limited"));
    const response = await POST({
      request: jsonRequest("http://localhost/api/recipes", "POST", { title: "Chili" }),
    } as any);
    expect(response.status).toBe(502);
  });
});

describe("PUT /api/recipes/[slug]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates an existing recipe", async () => {
    mockStore.get.mockResolvedValue({ recipe: existingRecipe, sha: "sha-1" });
    mockStore.update.mockResolvedValue(undefined);
    const response = await PUT({
      params: { slug: "chili" },
      request: jsonRequest("http://localhost/api/recipes/chili", "PUT", { title: "Chili Updated" }),
    } as any);
    expect(response.status).toBe(200);
    expect(mockStore.update).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Chili Updated" }),
      "sha-1"
    );
  });

  it("returns 404 when the recipe does not exist", async () => {
    mockStore.get.mockResolvedValue(null);
    const response = await PUT({
      params: { slug: "missing" },
      request: jsonRequest("http://localhost/api/recipes/missing", "PUT", { title: "X" }),
    } as any);
    expect(response.status).toBe(404);
  });

  it("returns 409 on sha mismatch", async () => {
    mockStore.get.mockResolvedValue({ recipe: existingRecipe, sha: "sha-2" });
    const response = await PUT({
      params: { slug: "chili" },
      request: jsonRequest("http://localhost/api/recipes/chili", "PUT", {
        title: "Chili Updated",
        expectedSha: "sha-1",
      }),
    } as any);
    expect(response.status).toBe(409);
    expect(mockStore.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/recipes/[slug]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes an existing recipe", async () => {
    mockStore.get.mockResolvedValue({ recipe: existingRecipe, sha: "sha-1" });
    mockStore.remove.mockResolvedValue(undefined);
    const response = await DELETE({ params: { slug: "chili" } } as any);
    expect(response.status).toBe(204);
    expect(mockStore.remove).toHaveBeenCalledWith("chili", "sha-1", "Chili");
  });

  it("returns 404 when the recipe does not exist", async () => {
    mockStore.get.mockResolvedValue(null);
    const response = await DELETE({ params: { slug: "missing" } } as any);
    expect(response.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/recipes.test.ts`
Expected: FAIL — API route files do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/pages/api/recipes/index.ts
import type { APIRoute } from "astro";
import { getStore } from "../../../lib/store";
import { slugify, dedupeSlug, type Recipe } from "../../../lib/recipe";

function normalizeTags(tags: unknown): string[] {
  return Array.isArray(tags)
    ? tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean)
    : [];
}

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json();
  if (!body.title || typeof body.title !== "string") {
    return new Response(JSON.stringify({ error: "Title is required" }), { status: 400 });
  }

  const store = getStore();
  const existing = await store.list();
  const slug = dedupeSlug(slugify(body.title), existing.map((r) => r.slug));
  const now = new Date().toISOString();

  const recipe: Recipe = {
    slug,
    title: body.title,
    sourceUrl: body.sourceUrl || undefined,
    image: body.image || undefined,
    tags: normalizeTags(body.tags),
    servings: body.servings || undefined,
    prepTime: body.prepTime || undefined,
    cookTime: body.cookTime || undefined,
    ingredients: Array.isArray(body.ingredients) ? body.ingredients.filter(Boolean) : [],
    instructions: Array.isArray(body.instructions) ? body.instructions.filter(Boolean) : [],
    nutrition: body.nutrition || undefined,
    notes: body.notes || undefined,
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

```ts
// src/pages/api/recipes/[slug].ts
import type { APIRoute } from "astro";
import { getStore } from "../../../lib/store";

function normalizeTags(tags: unknown): string[] | undefined {
  return Array.isArray(tags) ? tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean) : undefined;
}

export const PUT: APIRoute = async ({ params, request }) => {
  const slug = params.slug!;
  const body = await request.json();
  const store = getStore();
  const existing = await store.get(slug);

  if (!existing) {
    return new Response(JSON.stringify({ error: "Recipe not found" }), { status: 404 });
  }
  if (body.expectedSha && body.expectedSha !== existing.sha) {
    return new Response(
      JSON.stringify({ error: "Recipe changed elsewhere, reload and try again" }),
      { status: 409 }
    );
  }

  const updated = {
    ...existing.recipe,
    title: body.title ?? existing.recipe.title,
    sourceUrl: body.sourceUrl ?? existing.recipe.sourceUrl,
    image: body.image ?? existing.recipe.image,
    tags: normalizeTags(body.tags) ?? existing.recipe.tags,
    servings: body.servings ?? existing.recipe.servings,
    prepTime: body.prepTime ?? existing.recipe.prepTime,
    cookTime: body.cookTime ?? existing.recipe.cookTime,
    ingredients: Array.isArray(body.ingredients) ? body.ingredients.filter(Boolean) : existing.recipe.ingredients,
    instructions: Array.isArray(body.instructions)
      ? body.instructions.filter(Boolean)
      : existing.recipe.instructions,
    nutrition: body.nutrition ?? existing.recipe.nutrition,
    notes: body.notes ?? existing.recipe.notes,
    updatedAt: new Date().toISOString(),
  };

  try {
    await store.update(updated, existing.sha);
  } catch (err: any) {
    return new Response(JSON.stringify({ error: `Failed to save recipe: ${err.message}` }), { status: 502 });
  }

  return new Response(JSON.stringify({ slug }), { status: 200 });
};

export const DELETE: APIRoute = async ({ params }) => {
  const slug = params.slug!;
  const store = getStore();
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api/recipes.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/recipes tests/api/recipes.test.ts
git commit -m "feat: add create/update/delete recipe API routes"
```

---

### Task 9: API route — import from link

**Files:**
- Create: `src/pages/api/import.ts`
- Test: `tests/api/import.test.ts`

**Interfaces:**
- Consumes: `extractRecipeFromUrl` from `src/lib/extract/index.ts`
- Produces: `POST /api/import` route. Body `{ url: string }` → `200 { recipe, warning? }` or `400`/`422 { error }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/api/import.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockExtract = vi.fn();

vi.mock("../../src/lib/extract", () => ({
  extractRecipeFromUrl: (url: string) => mockExtract(url),
}));

import { POST } from "../../src/pages/api/import";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/import", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the extracted recipe on success", async () => {
    mockExtract.mockResolvedValue({ recipe: { title: "Soup" } });
    const response = await POST({ request: jsonRequest({ url: "https://example.com/soup" }) } as any);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.recipe.title).toBe("Soup");
  });

  it("rejects a missing url with 400", async () => {
    const response = await POST({ request: jsonRequest({}) } as any);
    expect(response.status).toBe(400);
  });

  it("returns 422 with the error message when extraction fails", async () => {
    mockExtract.mockRejectedValue(new Error("responded with status 404"));
    const response = await POST({ request: jsonRequest({ url: "https://example.com/missing" }) } as any);
    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json.error).toMatch(/404/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/import.test.ts`
Expected: FAIL — `src/pages/api/import.ts` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/pages/api/import.ts
import type { APIRoute } from "astro";
import { extractRecipeFromUrl } from "../../lib/extract";

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json();
  if (!body.url || typeof body.url !== "string") {
    return new Response(JSON.stringify({ error: "URL is required" }), { status: 400 });
  }

  try {
    const result = await extractRecipeFromUrl(body.url);
    return new Response(JSON.stringify(result), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: `Could not import recipe: ${err.message}` }), { status: 422 });
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api/import.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/import.ts tests/api/import.test.ts
git commit -m "feat: add recipe import API route"
```

---

### Task 10: RecipeForm component

**Files:**
- Create: `src/components/RecipeForm.astro`
- Create: `src/scripts/recipe-form.ts`

**Interfaces:**
- Consumes: `Recipe` type from `src/lib/recipe.ts`. Calls `POST /api/recipes`, `PUT /api/recipes/[slug]`, `DELETE /api/recipes/[slug]`, `POST /api/import` (Tasks 8–9).
- Produces: `<RecipeForm mode="create" | "edit" recipe?={Recipe} sha?={string} />` — used by Task 11 (new page) and Task 12 (edit page). Renders `<form id="recipe-form" data-mode data-slug data-sha>`.

- [ ] **Step 1: Write `src/components/RecipeForm.astro`**

```astro
---
import type { Recipe } from "../lib/recipe";

interface Props {
  mode: "create" | "edit";
  recipe?: Recipe;
  sha?: string;
}

const { mode, recipe, sha } = Astro.props;
const initial = {
  title: recipe?.title ?? "",
  sourceUrl: recipe?.sourceUrl ?? "",
  image: recipe?.image ?? "",
  tags: recipe?.tags?.join(", ") ?? "",
  servings: recipe?.servings ?? "",
  prepTime: recipe?.prepTime ?? "",
  cookTime: recipe?.cookTime ?? "",
  ingredients: recipe?.ingredients?.length ? recipe.ingredients : [],
  instructions: recipe?.instructions?.length ? recipe.instructions : [],
  nutrition: recipe?.nutrition ?? {},
  notes: recipe?.notes ?? "",
};
---
<form id="recipe-form" data-mode={mode} data-slug={recipe?.slug ?? ""} data-sha={sha ?? ""}>
  <script type="application/json" id="recipe-initial-data" set:html={JSON.stringify(initial)} />

  {mode === "create" && (
    <section class="import-panel">
      <label for="import-url">Import from link</label>
      <div class="row">
        <input type="url" id="import-url" placeholder="https://example.com/recipe" />
        <button type="button" id="import-button">Import</button>
      </div>
      <p id="import-message" class="message" role="status"></p>
    </section>
  )}

  <p id="form-message" class="message" role="alert"></p>

  <label for="title">Title</label>
  <input type="text" id="title" required />

  <label for="tags">Tags (comma separated)</label>
  <input type="text" id="tags" />

  <div class="grid">
    <div>
      <label for="servings">Servings</label>
      <input type="text" id="servings" />
    </div>
    <div>
      <label for="prepTime">Prep time</label>
      <input type="text" id="prepTime" />
    </div>
    <div>
      <label for="cookTime">Cook time</label>
      <input type="text" id="cookTime" />
    </div>
  </div>

  <label for="image">Image URL</label>
  <input type="url" id="image" />

  <label for="sourceUrl">Source URL</label>
  <input type="url" id="sourceUrl" />

  <fieldset>
    <legend>Ingredients</legend>
    <div id="ingredients-list"></div>
    <button type="button" id="add-ingredient">+ Add ingredient</button>
  </fieldset>

  <fieldset>
    <legend>Instructions</legend>
    <div id="instructions-list"></div>
    <button type="button" id="add-instruction">+ Add step</button>
  </fieldset>

  <fieldset>
    <legend>Nutrition (per serving)</legend>
    <div class="grid">
      <div><label for="nutrition-calories">Calories</label><input id="nutrition-calories" /></div>
      <div><label for="nutrition-protein">Protein</label><input id="nutrition-protein" /></div>
      <div><label for="nutrition-fat">Fat</label><input id="nutrition-fat" /></div>
      <div><label for="nutrition-carbohydrates">Carbs</label><input id="nutrition-carbohydrates" /></div>
      <div><label for="nutrition-fiber">Fiber</label><input id="nutrition-fiber" /></div>
      <div><label for="nutrition-sugar">Sugar</label><input id="nutrition-sugar" /></div>
      <div><label for="nutrition-sodium">Sodium</label><input id="nutrition-sodium" /></div>
    </div>
  </fieldset>

  <label for="notes">Notes</label>
  <textarea id="notes"></textarea>

  <div class="form-actions">
    <button type="submit" id="save-button">Save recipe</button>
    {mode === "edit" && <button type="button" id="delete-button" class="danger">Delete</button>}
  </div>
</form>

<script src="../scripts/recipe-form.ts"></script>
```

- [ ] **Step 2: Write `src/scripts/recipe-form.ts`**

```ts
interface NutritionData {
  calories?: string;
  protein?: string;
  fat?: string;
  carbohydrates?: string;
  fiber?: string;
  sugar?: string;
  sodium?: string;
}

interface FormData_ {
  title: string;
  sourceUrl: string;
  image: string;
  tags: string;
  servings: string;
  prepTime: string;
  cookTime: string;
  ingredients: string[];
  instructions: string[];
  nutrition: NutritionData;
  notes: string;
}

const form = document.getElementById("recipe-form") as HTMLFormElement;
const dataScript = document.getElementById("recipe-initial-data") as HTMLScriptElement;
const initial: FormData_ = JSON.parse(dataScript.textContent || "{}");

const ingredientsList = document.getElementById("ingredients-list")!;
const instructionsList = document.getElementById("instructions-list")!;

function addRow(container: HTMLElement, kind: "ingredient" | "instruction", value = "") {
  const row = document.createElement("div");
  row.className = "row";
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.className = `${kind}-input`;
  input.placeholder = kind === "ingredient" ? "e.g. 2 cups flour" : "e.g. Preheat oven to 350°F";
  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.textContent = "Remove";
  removeBtn.addEventListener("click", () => row.remove());
  row.append(input, removeBtn);
  container.append(row);
}

function renderRows() {
  ingredientsList.innerHTML = "";
  instructionsList.innerHTML = "";
  (initial.ingredients.length ? initial.ingredients : [""]).forEach((v) => addRow(ingredientsList, "ingredient", v));
  (initial.instructions.length ? initial.instructions : [""]).forEach((v) => addRow(instructionsList, "instruction", v));
}

function fillField(id: string, value: string | undefined) {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (el) el.value = value ?? "";
}

function fillForm(data: FormData_) {
  fillField("title", data.title);
  fillField("tags", data.tags);
  fillField("servings", data.servings);
  fillField("prepTime", data.prepTime);
  fillField("cookTime", data.cookTime);
  fillField("image", data.image);
  fillField("sourceUrl", data.sourceUrl);
  fillField("notes", data.notes);
  fillField("nutrition-calories", data.nutrition.calories);
  fillField("nutrition-protein", data.nutrition.protein);
  fillField("nutrition-fat", data.nutrition.fat);
  fillField("nutrition-carbohydrates", data.nutrition.carbohydrates);
  fillField("nutrition-fiber", data.nutrition.fiber);
  fillField("nutrition-sugar", data.nutrition.sugar);
  fillField("nutrition-sodium", data.nutrition.sodium);
  initial.ingredients = data.ingredients;
  initial.instructions = data.instructions;
  renderRows();
}

fillForm(initial);

document.getElementById("add-ingredient")!.addEventListener("click", () => addRow(ingredientsList, "ingredient"));
document.getElementById("add-instruction")!.addEventListener("click", () => addRow(instructionsList, "instruction"));

function collectRows(container: HTMLElement, kind: "ingredient" | "instruction"): string[] {
  return Array.from(container.querySelectorAll<HTMLInputElement>(`.${kind}-input`))
    .map((el) => el.value.trim())
    .filter(Boolean);
}

function showMessage(id: string, text: string, isError: boolean) {
  const el = document.getElementById(id)!;
  el.textContent = text;
  el.classList.toggle("error", isError);
}

const importButton = document.getElementById("import-button");
if (importButton) {
  importButton.addEventListener("click", async () => {
    const urlInput = document.getElementById("import-url") as HTMLInputElement;
    const url = urlInput.value.trim();
    if (!url) return;
    showMessage("import-message", "Importing…", false);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Import failed");
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
      });
      showMessage(
        "import-message",
        json.warning || "Imported. Review the fields below before saving.",
        Boolean(json.warning)
      );
    } catch (err) {
      showMessage("import-message", err instanceof Error ? err.message : "Import failed", true);
    }
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const mode = form.dataset.mode as "create" | "edit";
  const slug = form.dataset.slug;

  const title = (document.getElementById("title") as HTMLInputElement).value.trim();
  if (!title) {
    showMessage("form-message", "Title is required", true);
    return;
  }

  const payload = {
    title,
    tags: (document.getElementById("tags") as HTMLInputElement).value.split(",").map((t) => t.trim()).filter(Boolean),
    servings: (document.getElementById("servings") as HTMLInputElement).value.trim(),
    prepTime: (document.getElementById("prepTime") as HTMLInputElement).value.trim(),
    cookTime: (document.getElementById("cookTime") as HTMLInputElement).value.trim(),
    image: (document.getElementById("image") as HTMLInputElement).value.trim(),
    sourceUrl: (document.getElementById("sourceUrl") as HTMLInputElement).value.trim(),
    notes: (document.getElementById("notes") as HTMLTextAreaElement).value.trim(),
    ingredients: collectRows(ingredientsList, "ingredient"),
    instructions: collectRows(instructionsList, "instruction"),
    nutrition: {
      calories: (document.getElementById("nutrition-calories") as HTMLInputElement).value.trim(),
      protein: (document.getElementById("nutrition-protein") as HTMLInputElement).value.trim(),
      fat: (document.getElementById("nutrition-fat") as HTMLInputElement).value.trim(),
      carbohydrates: (document.getElementById("nutrition-carbohydrates") as HTMLInputElement).value.trim(),
      fiber: (document.getElementById("nutrition-fiber") as HTMLInputElement).value.trim(),
      sugar: (document.getElementById("nutrition-sugar") as HTMLInputElement).value.trim(),
      sodium: (document.getElementById("nutrition-sodium") as HTMLInputElement).value.trim(),
    },
    expectedSha: form.dataset.sha || undefined,
  };

  const url = mode === "create" ? "/api/recipes" : `/api/recipes/${slug}`;
  const method = mode === "create" ? "POST" : "PUT";

  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Save failed");
    window.location.href = `/recipes/${json.slug}`;
  } catch (err) {
    showMessage("form-message", err instanceof Error ? err.message : "Save failed", true);
  }
});

const deleteButton = document.getElementById("delete-button");
if (deleteButton) {
  deleteButton.addEventListener("click", async () => {
    if (!confirm("Delete this recipe? This cannot be undone.")) return;
    const slug = form.dataset.slug;
    try {
      const res = await fetch(`/api/recipes/${slug}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Delete failed");
      }
      window.location.href = "/";
    } catch (err) {
      showMessage("form-message", err instanceof Error ? err.message : "Delete failed", true);
    }
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/RecipeForm.astro src/scripts/recipe-form.ts
git commit -m "feat: add shared recipe form component with import, add/remove rows"
```

(Manual verification happens in Tasks 11–12 once this form is mounted on a page.)

---

### Task 11: New recipe page

**Files:**
- Create: `src/pages/recipes/new.astro`

**Interfaces:**
- Consumes: `RecipeForm` (Task 10), `Layout` (Task 1)
- Produces: page at `/recipes/new`

- [ ] **Step 1: Write `src/pages/recipes/new.astro`**

```astro
---
import Layout from "../../layouts/Layout.astro";
import RecipeForm from "../../components/RecipeForm.astro";
---
<Layout title="New Recipe">
  <h1>New Recipe</h1>
  <RecipeForm mode="create" />
</Layout>
```

- [ ] **Step 2: Manually verify**

Run: `npm run dev`, open `http://localhost:4321/recipes/new`.
Expected: form renders with an empty ingredient/instruction row each, "+ Add ingredient"/"+ Add step" append rows, "Remove" removes a row. (Full save flow is verified end-to-end in Task 15 once `GITHUB_TOKEN`/`GITHUB_REPO` are configured.)

- [ ] **Step 3: Commit**

```bash
git add src/pages/recipes/new.astro
git commit -m "feat: add new-recipe page"
```

---

### Task 12: Edit recipe page

**Files:**
- Create: `src/pages/recipes/[slug]/edit.astro`

**Interfaces:**
- Consumes: `getStore` (Task 4), `RecipeForm` (Task 10), `Layout` (Task 1)
- Produces: page at `/recipes/[slug]/edit`, redirects to `/` if the slug doesn't exist

- [ ] **Step 1: Write `src/pages/recipes/[slug]/edit.astro`**

```astro
---
import Layout from "../../../layouts/Layout.astro";
import RecipeForm from "../../../components/RecipeForm.astro";
import { getStore } from "../../../lib/store";

const { slug } = Astro.params;
const store = getStore();
const stored = slug ? await store.get(slug) : null;

if (!stored) {
  return Astro.redirect("/");
}
---
<Layout title={`Edit ${stored.recipe.title}`}>
  <h1>Edit {stored.recipe.title}</h1>
  <RecipeForm mode="edit" recipe={stored.recipe} sha={stored.sha} />
</Layout>
```

- [ ] **Step 2: Manually verify**

Run: `npm run dev` with a valid `.env` (`GITHUB_TOKEN`, `GITHUB_REPO` pointing at a test repo containing at least one `data/recipes/*.json` file). Open `/recipes/<that-slug>/edit`.
Expected: form fields, ingredient/instruction rows, and nutrition fields are prefilled from the stored recipe. Visiting `/recipes/does-not-exist/edit` redirects to `/`.

- [ ] **Step 3: Commit**

```bash
git add "src/pages/recipes/[slug]/edit.astro"
git commit -m "feat: add edit-recipe page"
```

---

### Task 13: View recipe page

**Files:**
- Create: `src/pages/recipes/[slug].astro`

**Interfaces:**
- Consumes: `getStore` (Task 4), `Layout` (Task 1)
- Produces: page at `/recipes/[slug]`, returns a 404 `Response` if the slug doesn't exist

- [ ] **Step 1: Write `src/pages/recipes/[slug].astro`**

```astro
---
import Layout from "../../layouts/Layout.astro";
import { getStore } from "../../lib/store";

const { slug } = Astro.params;
const store = getStore();
const stored = slug ? await store.get(slug) : null;

if (!stored) {
  return new Response("Recipe not found", { status: 404 });
}
const recipe = stored.recipe;
---
<Layout title={recipe.title}>
  <article class="recipe-view">
    <div class="recipe-header">
      <h1>{recipe.title}</h1>
      <div class="recipe-actions">
        <a href={`/recipes/${recipe.slug}/edit`} class="button">Edit</a>
      </div>
    </div>

    {recipe.image && <img src={recipe.image} alt={recipe.title} class="recipe-image" />}

    <ul class="tag-list">
      {recipe.tags.map((tag) => <li class="tag">{tag}</li>)}
    </ul>

    <dl class="recipe-meta">
      {recipe.servings && (<><dt>Servings</dt><dd>{recipe.servings}</dd></>)}
      {recipe.prepTime && (<><dt>Prep time</dt><dd>{recipe.prepTime}</dd></>)}
      {recipe.cookTime && (<><dt>Cook time</dt><dd>{recipe.cookTime}</dd></>)}
    </dl>

    <section>
      <h2>Ingredients</h2>
      <ul>
        {recipe.ingredients.map((item) => <li>{item}</li>)}
      </ul>
    </section>

    <section>
      <h2>Instructions</h2>
      <ol>
        {recipe.instructions.map((step) => <li>{step}</li>)}
      </ol>
    </section>

    {recipe.nutrition && Object.values(recipe.nutrition).some(Boolean) && (
      <section>
        <h2>Nutrition (per serving)</h2>
        <dl class="recipe-meta">
          {recipe.nutrition.calories && (<><dt>Calories</dt><dd>{recipe.nutrition.calories}</dd></>)}
          {recipe.nutrition.protein && (<><dt>Protein</dt><dd>{recipe.nutrition.protein}</dd></>)}
          {recipe.nutrition.fat && (<><dt>Fat</dt><dd>{recipe.nutrition.fat}</dd></>)}
          {recipe.nutrition.carbohydrates && (<><dt>Carbohydrates</dt><dd>{recipe.nutrition.carbohydrates}</dd></>)}
          {recipe.nutrition.fiber && (<><dt>Fiber</dt><dd>{recipe.nutrition.fiber}</dd></>)}
          {recipe.nutrition.sugar && (<><dt>Sugar</dt><dd>{recipe.nutrition.sugar}</dd></>)}
          {recipe.nutrition.sodium && (<><dt>Sodium</dt><dd>{recipe.nutrition.sodium}</dd></>)}
        </dl>
      </section>
    )}

    {recipe.notes && (
      <section>
        <h2>Notes</h2>
        <p>{recipe.notes}</p>
      </section>
    )}

    {recipe.sourceUrl && (
      <p class="recipe-source">
        Source: <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer">{recipe.sourceUrl}</a>
      </p>
    )}
  </article>
</Layout>
```

- [ ] **Step 2: Manually verify**

Run: `npm run dev`, open `/recipes/<a-real-slug>`.
Expected: title, image (if any), tags, servings/times, ingredients, instructions, nutrition (only shown if any field is set), notes, and source link all render correctly. `/recipes/does-not-exist` returns a 404 page.

- [ ] **Step 3: Commit**

```bash
git add "src/pages/recipes/[slug].astro"
git commit -m "feat: add recipe view page"
```

---

### Task 14: List page with tag filter and search

**Files:**
- Create: `src/components/RecipeCard.astro`
- Create: `src/scripts/recipe-list.ts`
- Modify: `src/pages/index.astro` (replace Task 1 placeholder)

**Interfaces:**
- Consumes: `getStore` (Task 4), `Recipe` type, `Layout` (Task 1)
- Produces: `<RecipeCard recipe={Recipe} />` rendering `<a class="recipe-card" data-tags data-title>`; list page at `/`

- [ ] **Step 1: Write `src/components/RecipeCard.astro`**

```astro
---
import type { Recipe } from "../lib/recipe";

interface Props {
  recipe: Recipe;
}
const { recipe } = Astro.props;
---
<a href={`/recipes/${recipe.slug}`} class="recipe-card" data-tags={recipe.tags.join(",")} data-title={recipe.title.toLowerCase()}>
  {recipe.image && <img src={recipe.image} alt="" />}
  <h3>{recipe.title}</h3>
  <ul class="tag-list">
    {recipe.tags.map((tag) => <li class="tag">{tag}</li>)}
  </ul>
</a>
```

- [ ] **Step 2: Write `src/scripts/recipe-list.ts`**

```ts
const searchInput = document.getElementById("search-input") as HTMLInputElement | null;
const tagFilters = document.getElementById("tag-filters");
const grid = document.getElementById("recipe-grid");

if (searchInput && grid) {
  const activeTags = new Set<string>();

  function applyFilter() {
    const query = searchInput!.value.trim().toLowerCase();
    grid!.querySelectorAll<HTMLElement>(".recipe-card").forEach((card) => {
      const title = card.dataset.title || "";
      const cardTags = (card.dataset.tags || "").split(",").filter(Boolean);
      const matchesSearch = !query || title.includes(query);
      const matchesTags = activeTags.size === 0 || Array.from(activeTags).every((t) => cardTags.includes(t));
      card.style.display = matchesSearch && matchesTags ? "" : "none";
    });
  }

  searchInput.addEventListener("input", applyFilter);

  tagFilters?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (!target.classList.contains("tag-filter")) return;
    const tag = target.dataset.tag!;
    if (activeTags.has(tag)) {
      activeTags.delete(tag);
      target.classList.remove("active");
    } else {
      activeTags.add(tag);
      target.classList.add("active");
    }
    applyFilter();
  });
}
```

- [ ] **Step 3: Replace `src/pages/index.astro`**

```astro
---
import Layout from "../layouts/Layout.astro";
import RecipeCard from "../components/RecipeCard.astro";
import { getStore } from "../lib/store";

const store = getStore();
const recipes = await store.list();
recipes.sort((a, b) => a.title.localeCompare(b.title));
const allTags = Array.from(new Set(recipes.flatMap((r) => r.tags))).sort();
---
<Layout title="Recipes">
  <h1>Recipes</h1>

  <div class="list-controls">
    <input type="search" id="search-input" placeholder="Search recipes..." />
    <div id="tag-filters" class="tag-list">
      {allTags.map((tag) => (
        <button type="button" class="tag-filter" data-tag={tag}>{tag}</button>
      ))}
    </div>
  </div>

  {recipes.length === 0 ? (
    <p>No recipes yet. <a href="/recipes/new">Add your first one</a>.</p>
  ) : (
    <div id="recipe-grid" class="recipe-grid">
      {recipes.map((recipe) => <RecipeCard recipe={recipe} />)}
    </div>
  )}
</Layout>

<script src="../scripts/recipe-list.ts"></script>
```

- [ ] **Step 4: Manually verify**

Run: `npm run dev`, open `/`.
Expected: with recipes in the test repo, cards render with title/image/tags; typing in search filters by title; clicking a tag chip filters to matching recipes (toggle on/off, combinable with search). With zero recipes, the "Add your first one" empty state shows.

- [ ] **Step 5: Commit**

```bash
git add src/components/RecipeCard.astro src/scripts/recipe-list.ts src/pages/index.astro
git commit -m "feat: add recipe list page with tag filter and search"
```

---

### Task 15: Docs and end-to-end verification

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: nothing (documentation only)
- Produces: setup/deploy instructions; no code

- [ ] **Step 1: Write `README.md`**

```markdown
# Recipe App

Astro app for capturing recipes — typed in by hand or imported from a link — stored as JSON files in a GitHub repo.

## How it works

- Recipes live at `data/recipes/<slug>.json` in a GitHub repo (this repo, by default).
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
3. Deploy. Every recipe add/edit/delete commits directly to the configured GitHub branch and is visible on next page load (no rebuild needed).

## Testing

`npm test` runs the unit test suite (data model, GitHub client, link extraction, API routes).

UI pages are verified manually — see the plan's Task 15 checklist for the three core flows.
```

- [ ] **Step 2: Run full automated test suite**

Run: `npm test`
Expected: all tests from Tasks 2–9 pass.

- [ ] **Step 3: Manually verify all three core flows end-to-end**

With `.env` pointing at a real (test) GitHub repo:

1. **Manual add**: `/recipes/new` → Manual entry → fill title, one ingredient, one instruction → Save → redirected to `/recipes/<slug>` showing the new recipe → confirm the commit landed in the GitHub repo under `data/recipes/`.
2. **Link import**: `/recipes/new` → paste a URL for a recipe page known to expose `schema.org/Recipe` JSON-LD (e.g. a major recipe site) → Import → confirm fields populate → adjust if needed → Save → confirm the recipe appears at `/recipes/<slug>` and in the GitHub repo.
3. **Edit + delete**: open an existing recipe → Edit → change the title and add a tag → Save → confirm the view page reflects the change and a new tag chip appears on `/` → Edit again → Delete → confirm redirect to `/` and the file is gone from the repo.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add setup, deploy, and verification instructions"
```
