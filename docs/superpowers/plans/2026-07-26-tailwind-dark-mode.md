# Tailwind Migration + Dark Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-written `public/global.css` with Tailwind CSS v4 across every page/component, add OS-driven dark mode (`dark:` variant, no toggle), and apply the approved "Modern Minimal" visual refresh (zinc neutrals + green accent).

**Architecture:** Tailwind v4 via `@tailwindcss/vite`, no config file — a single `@import "tailwindcss";` entry stylesheet imported once from `Layout.astro`. Every custom CSS class is deleted; all styling becomes inline Tailwind utility classes in markup. Client scripts that toggle state classes (`recipe-form.ts`'s message coloring, `recipe-list.ts`'s active tag chip) are updated to add/remove literal Tailwind utility classes instead of custom marker classes, since there is no longer any custom CSS to give a marker class meaning.

**Tech Stack:** Tailwind CSS v4, `@tailwindcss/vite`. No new runtime dependencies beyond that; no test framework changes.

## Global Constraints

- No custom CSS classes remain anywhere in the app — every visual style is an inline Tailwind utility class. The only exception is functional (non-visual) marker classes already required by existing client-script queries: `.recipe-card`, `.tag-filter`, `.ingredient-input`, `.instruction-input`, `.message` (kept as a plain marker so `getElementById` targets still resolve consistently — no CSS is defined for it).
- Dark mode is OS-preference only (`dark:` variant) — no toggle UI, no `localStorage`, no inline anti-flash script.
- Visual direction: zinc neutrals (`zinc-50`/`white` light backgrounds, `zinc-900`/`zinc-800` dark backgrounds, `zinc-200`/`zinc-700` borders), green accent (`green-600` light / `green-500`-`400` dark) for primary actions and active states, red (`red-600`/`red-400`) for destructive actions and errors, amber (`amber-600`/`amber-400`) for warnings. `rounded-md` shape, no drop shadows.
- No changes to `src/lib/**`, `src/pages/api/**`, or any test file — this is a styling-only change. The existing 74-test Vitest suite must remain green and untouched.
- No changes to any client-script *logic* (fetch calls, payload shapes, event wiring) — only the class-name strings those scripts add/remove/set.

---

### Task 1: Install Tailwind, replace stylesheet, rewrite Layout

**Files:**
- Modify: `package.json` (via `npm install`, not hand-edited)
- Modify: `astro.config.mjs`
- Delete: `public/global.css`
- Create: `src/styles/global.css`
- Modify: `src/layouts/Layout.astro`

**Interfaces:**
- Consumes: nothing
- Produces: `src/styles/global.css` imported by `Layout.astro`; every later task's `.astro` file relies on this being wired up before its own utility classes render with actual style.

- [ ] **Step 1: Install Tailwind**

Run: `npm install -D tailwindcss @tailwindcss/vite`

- [ ] **Step 2: Update `astro.config.mjs`**

```js
import { defineConfig } from "astro/config";
import netlify from "@astrojs/netlify";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  output: "server",
  adapter: netlify(),
  vite: {
    plugins: [tailwindcss()],
  },
});
```

- [ ] **Step 3: Delete `public/global.css`**

- [ ] **Step 4: Create `src/styles/global.css`**

```css
@import "tailwindcss";
```

- [ ] **Step 5: Rewrite `src/layouts/Layout.astro`**

```astro
---
import "../styles/global.css";

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
  </head>
  <body class="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
    <header class="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
      <a href="/" class="text-lg font-semibold tracking-tight text-zinc-900 no-underline dark:text-zinc-100">Recipes</a>
      <a href="/recipes/new" class="inline-block rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white no-underline hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-400">+ New Recipe</a>
    </header>
    <main class="mx-auto max-w-3xl p-6">
      <slot />
    </main>
  </body>
</html>
```

- [ ] **Step 6: Verify build succeeds and Tailwind actually generated CSS**

Run: `npm run build`
Expected: build succeeds with no errors.

Run: `grep -rl "bg-green-600" dist .netlify 2>/dev/null`
Expected: at least one file path printed — confirms Tailwind's build-time CSS generation picked up and emitted a rule for a utility class used in `Layout.astro`, proving the Vite plugin is wired correctly (this does not require `GITHUB_TOKEN`/`GITHUB_REPO` — `npm run build` compiles routes but does not execute them, since `output: "server"` performs no prerendering).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json astro.config.mjs public/global.css src/styles/global.css src/layouts/Layout.astro
git commit -m "feat: replace custom CSS with Tailwind v4, rewrite Layout"
```

---

### Task 2: Rewrite RecipeCard, list page, and list filtering script

**Files:**
- Modify: `src/components/RecipeCard.astro`
- Modify: `src/pages/index.astro`
- Modify: `src/scripts/recipe-list.ts`

**Interfaces:**
- Consumes: `Recipe` type from `src/lib/recipe.ts` (unchanged), `getStore()` from `src/lib/store.ts` (unchanged), Tailwind from Task 1
- Produces: `<RecipeCard recipe={Recipe} />` still renders `<a class="recipe-card ..." data-tags data-title>` (the `recipe-card` marker class is unchanged so `recipe-list.ts`'s `querySelectorAll(".recipe-card")` keeps working)

- [ ] **Step 1: Rewrite `src/components/RecipeCard.astro`**

```astro
---
import type { Recipe } from "../lib/recipe";

interface Props {
  recipe: Recipe;
}
const { recipe } = Astro.props;
---
<a
  href={`/recipes/${recipe.slug}`}
  class="recipe-card block rounded-md border border-zinc-200 bg-white p-4 text-inherit no-underline dark:border-zinc-700 dark:bg-zinc-800"
  data-tags={recipe.tags.join(",")}
  data-title={recipe.title.toLowerCase()}
>
  {recipe.image && <img src={recipe.image} alt="" class="mb-3 h-36 w-full rounded-md object-cover" />}
  <h3 class="font-semibold text-zinc-900 dark:text-zinc-100">{recipe.title}</h3>
  <ul class="mt-2 flex list-none flex-wrap gap-1.5 p-0">
    {recipe.tags.map((tag) => (
      <li class="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">{tag}</li>
    ))}
  </ul>
</a>
```

- [ ] **Step 2: Rewrite `src/pages/index.astro`**

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
          class="tag-filter rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          data-tag={tag}
        >{tag}</button>
      ))}
    </div>
  </div>

  {recipes.length === 0 ? (
    <p class="mt-6 text-zinc-600 dark:text-zinc-400">No recipes yet. <a href="/recipes/new" class="text-green-600 dark:text-green-400">Add your first one</a>.</p>
  ) : (
    <div id="recipe-grid" class="mt-4 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
      {recipes.map((recipe) => <RecipeCard recipe={recipe} />)}
    </div>
  )}
</Layout>

<script src="../scripts/recipe-list.ts"></script>
```

- [ ] **Step 3: Rewrite `src/scripts/recipe-list.ts`**

```ts
const searchInput = document.getElementById("search-input") as HTMLInputElement | null;
const tagFilters = document.getElementById("tag-filters");
const grid = document.getElementById("recipe-grid");

const activeTagClasses = ["bg-green-600", "text-white", "dark:bg-green-500"];

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
      target.classList.remove(...activeTagClasses);
    } else {
      activeTags.add(tag);
      target.classList.add(...activeTagClasses);
    }
    applyFilter();
  });
}
```

- [ ] **Step 4: Verify**

Run: `npm run build`
Expected: succeeds with no errors.

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/RecipeCard.astro src/pages/index.astro src/scripts/recipe-list.ts
git commit -m "feat: rewrite recipe list page and card with Tailwind"
```

---

### Task 3: Rewrite RecipeForm and its client script

**Files:**
- Modify: `src/components/RecipeForm.astro`
- Modify: `src/scripts/recipe-form.ts`

**Interfaces:**
- Consumes: `Recipe` type from `src/lib/recipe.ts` (unchanged). API contracts unchanged (`POST /api/recipes`, `PUT/DELETE /api/recipes/[slug]`, `POST /api/import`).
- Produces: same `mode`/`recipe`/`sha` props and same `data-mode`/`data-slug`/`data-sha` form dataset as before — Tasks 11/12 pages (`new.astro`, `edit.astro`) that mount this component need no changes.

- [ ] **Step 1: Rewrite `src/components/RecipeForm.astro`**

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

const labelClass = "mt-3 block text-sm font-medium";
const inputClass = "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const primaryButtonClass = "inline-block rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-400";
const dangerButtonClass = "inline-block rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-400";
---
<form id="recipe-form" data-mode={mode} data-slug={recipe?.slug ?? ""} data-sha={sha ?? ""} class="mt-4">
  <script type="application/json" id="recipe-initial-data" set:html={JSON.stringify(initial).replace(/</g, "\\u003c")} />

  {mode === "create" && (
    <section class="rounded-md border border-zinc-200 p-3 dark:border-zinc-700">
      <label for="import-url" class="block text-sm font-medium">Import from link</label>
      <div class="mt-1 flex gap-2">
        <input type="url" id="import-url" placeholder="https://example.com/recipe" class={inputClass + " mt-0"} />
        <button type="button" id="import-button" class={primaryButtonClass}>Import</button>
      </div>
      <p id="import-message" class="message mt-2 min-h-5 text-sm" role="status"></p>
    </section>
  )}

  <p id="form-message" class="message mt-3 min-h-5 text-sm" role="alert"></p>

  <label for="title" class={labelClass}>Title</label>
  <input type="text" id="title" required class={inputClass} />

  <label for="tags" class={labelClass}>Tags (comma separated)</label>
  <input type="text" id="tags" class={inputClass} />

  <div class="mt-3 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2">
    <div>
      <label for="servings" class="block text-sm font-medium">Servings</label>
      <input type="text" id="servings" class={inputClass} />
    </div>
    <div>
      <label for="prepTime" class="block text-sm font-medium">Prep time</label>
      <input type="text" id="prepTime" class={inputClass} />
    </div>
    <div>
      <label for="cookTime" class="block text-sm font-medium">Cook time</label>
      <input type="text" id="cookTime" class={inputClass} />
    </div>
  </div>

  <label for="image" class={labelClass}>Image URL</label>
  <input type="url" id="image" class={inputClass} />

  <label for="sourceUrl" class={labelClass}>Source URL</label>
  <input type="url" id="sourceUrl" class={inputClass} />

  <fieldset class="mt-4 rounded-md border border-zinc-200 p-3 dark:border-zinc-700">
    <legend class="px-1 text-sm font-semibold">Ingredients</legend>
    <div id="ingredients-list"></div>
    <button type="button" id="add-ingredient" class={primaryButtonClass + " mt-2"}>+ Add ingredient</button>
  </fieldset>

  <fieldset class="mt-4 rounded-md border border-zinc-200 p-3 dark:border-zinc-700">
    <legend class="px-1 text-sm font-semibold">Instructions</legend>
    <div id="instructions-list"></div>
    <button type="button" id="add-instruction" class={primaryButtonClass + " mt-2"}>+ Add step</button>
  </fieldset>

  <fieldset class="mt-4 rounded-md border border-zinc-200 p-3 dark:border-zinc-700">
    <legend class="px-1 text-sm font-semibold">Nutrition (per serving)</legend>
    <div class="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2">
      <div><label for="nutrition-calories" class="block text-sm font-medium">Calories</label><input id="nutrition-calories" class={inputClass} /></div>
      <div><label for="nutrition-protein" class="block text-sm font-medium">Protein</label><input id="nutrition-protein" class={inputClass} /></div>
      <div><label for="nutrition-fat" class="block text-sm font-medium">Fat</label><input id="nutrition-fat" class={inputClass} /></div>
      <div><label for="nutrition-carbohydrates" class="block text-sm font-medium">Carbs</label><input id="nutrition-carbohydrates" class={inputClass} /></div>
      <div><label for="nutrition-fiber" class="block text-sm font-medium">Fiber</label><input id="nutrition-fiber" class={inputClass} /></div>
      <div><label for="nutrition-sugar" class="block text-sm font-medium">Sugar</label><input id="nutrition-sugar" class={inputClass} /></div>
      <div><label for="nutrition-sodium" class="block text-sm font-medium">Sodium</label><input id="nutrition-sodium" class={inputClass} /></div>
    </div>
  </fieldset>

  <label for="notes" class={labelClass}>Notes</label>
  <textarea id="notes" class={inputClass}></textarea>

  <div class="mt-6 flex gap-2">
    <button type="submit" id="save-button" class={primaryButtonClass}>Save recipe</button>
    {mode === "edit" && <button type="button" id="delete-button" class={dangerButtonClass}>Delete</button>}
  </div>
</form>

<script src="../scripts/recipe-form.ts"></script>
```

- [ ] **Step 2: Rewrite `src/scripts/recipe-form.ts`**

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

const rowInputClass = "flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const removeButtonClass = "rounded-md border border-zinc-300 px-3 py-1 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800";

function addRow(container: HTMLElement, kind: "ingredient" | "instruction", value = "") {
  const row = document.createElement("div");
  row.className = "mt-2 flex gap-2";
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.className = `${kind}-input ${rowInputClass}`;
  input.placeholder = kind === "ingredient" ? "e.g. 2 cups flour" : "e.g. Preheat oven to 350°F";
  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = removeButtonClass;
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

type MessageKind = "info" | "warning" | "error";

const messageKindClasses: Record<"warning" | "error", string[]> = {
  warning: ["text-amber-600", "dark:text-amber-400"],
  error: ["text-red-600", "dark:text-red-400"],
};

function showMessage(id: string, text: string, kind: MessageKind = "info") {
  const el = document.getElementById(id)!;
  el.textContent = text;
  el.classList.remove(...messageKindClasses.warning, ...messageKindClasses.error);
  if (kind !== "info") el.classList.add(...messageKindClasses[kind]);
}

const importButton = document.getElementById("import-button");
if (importButton) {
  importButton.addEventListener("click", async () => {
    const urlInput = document.getElementById("import-url") as HTMLInputElement;
    const url = urlInput.value.trim();
    if (!url) return;
    showMessage("import-message", "Importing…", "info");
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
        json.warning ? "warning" : "info"
      );
    } catch (err) {
      showMessage("import-message", err instanceof Error ? err.message : "Import failed", "error");
    }
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const mode = form.dataset.mode as "create" | "edit";
  const slug = form.dataset.slug;

  const title = (document.getElementById("title") as HTMLInputElement).value.trim();
  if (!title) {
    showMessage("form-message", "Title is required", "error");
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
    showMessage("form-message", err instanceof Error ? err.message : "Save failed", "error");
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
      showMessage("form-message", err instanceof Error ? err.message : "Delete failed", "error");
    }
  });
}
```

- [ ] **Step 3: Verify**

Run: `npm run build`
Expected: succeeds with no errors.

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/RecipeForm.astro src/scripts/recipe-form.ts
git commit -m "feat: rewrite recipe form with Tailwind"
```

---

### Task 4: Rewrite view, new, and edit pages

**Files:**
- Modify: `src/pages/recipes/[slug].astro`
- Modify: `src/pages/recipes/new.astro`
- Modify: `src/pages/recipes/[slug]/edit.astro`

**Interfaces:**
- Consumes: `getStore()` from `src/lib/store.ts`, `RecipeForm` from Task 3, `Layout` from Task 1 — no signature changes to any of these
- Produces: no new interfaces — these are leaf pages

- [ ] **Step 1: Rewrite `src/pages/recipes/[slug].astro`**

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
  <article>
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-semibold tracking-tight">{recipe.title}</h1>
      <div>
        <a href={`/recipes/${recipe.slug}/edit`} class="inline-block rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white no-underline hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-400">Edit</a>
      </div>
    </div>

    {recipe.image && <img src={recipe.image} alt={recipe.title} class="mt-4 max-w-full rounded-md" />}

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
        Source: <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer" class="text-green-600 dark:text-green-400">{recipe.sourceUrl}</a>
      </p>
    )}
  </article>
</Layout>
```

- [ ] **Step 2: Rewrite `src/pages/recipes/new.astro`**

```astro
---
import Layout from "../../layouts/Layout.astro";
import RecipeForm from "../../components/RecipeForm.astro";
---
<Layout title="New Recipe">
  <h1 class="text-2xl font-semibold tracking-tight">New Recipe</h1>
  <RecipeForm mode="create" />
</Layout>
```

- [ ] **Step 3: Rewrite `src/pages/recipes/[slug]/edit.astro`**

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
  <h1 class="text-2xl font-semibold tracking-tight">Edit {stored.recipe.title}</h1>
  <RecipeForm mode="edit" recipe={stored.recipe} sha={stored.sha} />
</Layout>
```

- [ ] **Step 4: Verify**

Run: `npm run build`
Expected: succeeds with no errors.

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add "src/pages/recipes/[slug].astro" src/pages/recipes/new.astro "src/pages/recipes/[slug]/edit.astro"
git commit -m "feat: rewrite recipe view/new/edit pages with Tailwind"
```

---

### Task 5: Full verification pass

**Files:**
- None (verification only)

**Interfaces:**
- Consumes: everything from Tasks 1-4
- Produces: nothing — this task confirms the whole migration is consistent

- [ ] **Step 1: Run the full automated test suite**

Run: `npm test`
Expected: all 74 tests pass, unchanged from before this plan (no `src/lib/**` or `src/pages/api/**` file was touched).

- [ ] **Step 2: Run build and type-check one more time on the full branch**

Run: `npm run build && npx tsc --noEmit`
Expected: both clean.

- [ ] **Step 3: Grep for any leftover reference to a deleted custom CSS class**

Run: `grep -rn "class=\"site-header\|class=\"site-title\|class=\"recipe-grid\"\|class=\"recipe-view\|class=\"recipe-header\|class=\"recipe-actions\|class=\"recipe-meta\|class=\"recipe-source\|class=\"recipe-image\|class=\"list-controls\|class=\"import-panel\|class=\"form-actions\|class=\"tag-list\|button\.danger\|class=\"grid\"\b" src/ 2>/dev/null`
Expected: no matches — confirms no page/component still references a class name that no longer has any CSS behind it (the `public/global.css` file that defined them is deleted).

- [ ] **Step 4: Confirm `public/global.css` is gone and no page links it**

Run: `grep -rn "global.css" src/ public/ 2>/dev/null`
Expected: only `src/layouts/Layout.astro`'s `import "../styles/global.css";` line — no `<link rel="stylesheet" href="/global.css">` remnants anywhere.

- [ ] **Step 5: Report manual verification is deferred to the human operator**

This environment has no real `GITHUB_TOKEN`/`GITHUB_REPO` credentials, so every page except the build itself cannot be rendered end-to-end here (all pages call `getStore()`, which throws without real credentials). Note in the final report that the human operator should run `npm run dev` and manually check, in both light and dark OS appearance: the list page (search + tag filter chips toggling), the view page, the new-recipe page (manual entry tab and import tab), and the edit page (prefilled form, delete button) — confirming no visual regressions and that dark mode looks correct throughout.

- [ ] **Step 6: Commit if step 3's grep required any cleanup, otherwise this task has no commit**

If Step 3 found leftover references, fix them and commit:

```bash
git add -u
git commit -m "fix: remove leftover references to deleted CSS classes"
```

If Step 3 was clean, no commit is needed for this task — it was verification-only.
