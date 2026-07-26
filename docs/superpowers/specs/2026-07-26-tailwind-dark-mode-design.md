# Tailwind Migration + Dark Mode — Design

## Overview

Replace the hand-written `public/global.css` with Tailwind CSS v4, and add
dark mode support driven by OS preference (no manual toggle). Combined with
a visual refresh to a "Modern Minimal" aesthetic — neutral grayscale with a
single green accent — replacing the current warm/amber custom-CSS look.

## Setup

- Add `tailwindcss` and `@tailwindcss/vite` as dev dependencies.
- Register `@tailwindcss/vite` in `astro.config.mjs`'s Vite plugins.
- Replace `public/global.css` with a Tailwind entry stylesheet
  (`src/styles/global.css` containing `@import "tailwindcss";`), imported
  once from `src/layouts/Layout.astro`. No `tailwind.config.js` needed
  (Tailwind v4 is CSS-first) and no custom `@theme` block is required —
  the design uses only Tailwind's default palette (`zinc`, `green`, `red`,
  `amber`) and default spacing/radius scale.
- Dark mode uses Tailwind's default `dark:` variant, which follows
  `prefers-color-scheme` automatically — no `darkMode` config, no toggle
  UI, no `localStorage`, no inline anti-flash script needed.

## Visual direction: Modern Minimal

- **Neutrals:** zinc scale. Page background `bg-zinc-50` (light) /
  `bg-zinc-900` (dark). Cards/inputs `bg-white` (light) / `bg-zinc-800`
  (dark). Borders `border-zinc-200` (light) / `border-zinc-700` (dark).
- **Accent:** green — `green-600` (light) / `green-500`-`400` (dark) — used
  for primary buttons, active tag-filter chips, and links.
- **Typography:** system sans stack (no serif), default Tailwind font
  sizes/weights, tighter tracking on headings (`tracking-tight`).
- **Shape:** `rounded-md` throughout (not pill-shaped tags), thin 1px
  borders, no drop shadows — flat, clean surfaces.
- **Status colors:** errors `text-red-600`/`text-red-400` (dark), warnings
  `text-amber-600`/`text-amber-400` (dark) — the warning color was already
  introduced in the prior implementation phase for the import-warning
  message and carries over unchanged in spirit, just reimplemented as a
  Tailwind class instead of a custom `.message.warning` rule.

## Component mapping

Every custom class in the current `public/global.css` is deleted and
reimplemented as inline Tailwind utility classes directly in markup. No new
custom CSS classes are introduced — if a combination doesn't map cleanly to
utilities, it still stays inline (`class="..."` strings), not extracted
into `@apply` rules, to keep a single source of truth per element.

| Current class | Tailwind replacement (light `dark:` pattern) |
|---|---|
| `.site-header` | `flex justify-between items-center px-6 py-4 border-b border-zinc-200 dark:border-zinc-800` |
| `.button` / submit / add-row buttons | `bg-green-600 dark:bg-green-500 text-white rounded-md px-4 py-2 hover:bg-green-700 dark:hover:bg-green-400` |
| `button.danger` (delete) | same shape, `bg-red-600 dark:bg-red-500 hover:bg-red-700 dark:hover:bg-red-400` |
| `.recipe-grid` | `grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4` |
| `.recipe-card` | `block rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4` |
| `.tag` / `.tag-filter` | `rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs px-2 py-0.5`; active filter adds `bg-green-600 text-white dark:bg-green-500` |
| form `input`/`textarea` | `border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded-md px-3 py-2 text-zinc-900 dark:text-zinc-100 w-full` |
| `.message.error` | `text-red-600 dark:text-red-400` |
| `.message.warning` | `text-amber-600 dark:text-amber-400` |
| `.row` / `.grid` (form field grids) | `flex gap-2` / `grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2` |
| `fieldset` | `border border-zinc-200 dark:border-zinc-700 rounded-md mt-4 p-3` |
| body/page | `bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100` |

## Files touched

- `astro.config.mjs` — add `@tailwindcss/vite` plugin.
- `package.json` — new devDependencies.
- Delete `public/global.css`; add `src/styles/global.css`.
- `src/layouts/Layout.astro` — import the new stylesheet, apply page-level
  background/text classes, rebuild header markup with utilities.
- `src/components/RecipeForm.astro`, `src/components/RecipeCard.astro` —
  full utility-class rewrite per the mapping above.
- `src/pages/index.astro`, `src/pages/recipes/[slug].astro`,
  `src/pages/recipes/new.astro`, `src/pages/recipes/[slug]/edit.astro` —
  utility-class rewrite of any inline structural markup (most of these are
  thin wrappers already; `[slug].astro`'s detail view has the most markup
  to convert).
- `src/scripts/recipe-form.ts`, `src/scripts/recipe-list.ts` — no logic
  changes, but any class-name string these scripts reference for
  add/remove/toggle behavior (`.error`, `.warning`, `.active`,
  `.tag-filter`, `.ingredient-input`, `.instruction-input`) must be updated
  to match the new Tailwind class lists exactly, since the scripts do
  `classList.add/remove/toggle` and `querySelector` by those names.

## Testing

- No lib/API code changes — the existing 74-test Vitest suite (data model,
  GitHub client, link extraction, API routes) is untouched and must stay
  green with no modifications.
- `npm run build` must succeed.
- Manual verification (dev server): list page, view page, new-recipe page
  (both manual-entry and import tabs), edit page — checked in both light
  and dark OS appearance. Confirm dynamic ingredient/instruction row
  add/remove, tag-filter toggling, and error/warning message styling all
  still work after the class-name rewrite in the scripts.
