# Goal

Add a private shopping list built from selected recipes. Keep ingredient lines as written; users can edit, check, add, remove, copy, and print items. Persist the list in the selected private source repo.

# Plan and targets

1. Private storage and API (executor: Codex subagent): add `data/shopping-list.json` storage with strict item validation, private-repo verification, optimistic SHA updates, and authenticated GET/PUT. Target new `src/lib/shoppingList.ts`, `src/pages/api/shopping-list.ts`, and focused tests.
2. Interface (executor: main): add `/shopping-list` page and client script for recipe selection, raw ingredient collection, editable checklist, save/reload conflict handling, copy, and print. Add authenticated navigation. Target new page/script and `src/layouts/Layout.astro`.
3. Docs and integration (executor: main): explain list behavior and verify route privacy, keyboard access, labels, visible focus, and mobile layout. Target README/how-to-use and tests where material.
4. Run tests, TypeScript check, production build, and diff check.

# Acceptance

- Anonymous visitors cannot read or write shopping lists; data is stored only in the current private source repo.
- Recipe selection adds original ingredient lines without automatic quantity merging.
- Items can be edited, checked, added, removed, copied, and printed.
- Save persists across reload; concurrent changes produce a clear conflict instead of overwriting data.
- Tests, typecheck, build, and diff check pass.

# Result

Shopping list implemented. Full suite: 222 tests passed. TypeScript check, production build, and diff check passed. Frontend accessibility audit findings addressed.

## Follow-up: private repo move and documentation

Goal: verify all source recipes in `rkalajian/privrec`, remove the redundant source copies from the public code repo only after byte-level verification, and update About, How to Use, and README for the deployed shopping list and separate private/public repos.

1. Inspect both repositories, compare recipe paths and contents, and verify the private repo's sharing configuration. Executor: main.
2. Update `src/pages/about.astro`, `src/pages/how-to-use.astro`, and `README.md` with accurate shopping list and repo guidance. Executor: subagent.
3. Remove only verified redundant `data/recipes/*.json` files from the public repo, retain `data/shared-recipes`, then test, build, and check the diff. Executor: main.

Acceptance: destination contains every source recipe with matching content apart from line endings; public sharing copies remain available; docs explain private shopping lists and Git history exposure; checks pass.

Result: `privrec` has all 22 source recipe paths with identical content ignoring line endings, and its sharing config points to `rkalajian/recipies`. Public source recipe files removed; 20 published copies retained. Docs updated. Full suite: 222 tests passed. TypeScript check, production build, and diff checks passed.

## Follow-up: local recipe images

Goal: allow image uploads and download supplied image URLs into repository storage.

1. Backend (executor: image backend subagent): validate image uploads and remote downloads, store bounded image files in GitHub, serve saved images, preserve public sharing, and add focused tests.
2. Form (executor: main): add accessible local file input; send selected image with recipe save while retaining URL entry.
3. Run tests, TypeScript check, build, and diff check.

Acceptance: PNG, JPEG, WebP, and GIF uploads up to 4 MB render; HTTPS image URLs download into repository storage; private images require authorization; shared images render publicly; unsafe or oversized images fail clearly.

Result: local uploads and HTTPS downloads store content addressed images in GitHub. Private image route checks the selected repo; published copies use the public repo, with unused live public files removed on unshare or replacement. Full suite: 236 tests passed. TypeScript check, production build, and diff check passed. Git history still retains previously published image bytes.

## Follow-up: responsive UX/UI refresh

Goal: make recipe discovery, editing, shopping, and settings clearer and more attractive on desktop and mobile while preserving behavior.

1. Foundation and discovery (executor: main): establish warm culinary design tokens and responsive navigation; refresh home, recipe cards, recipe detail/profile views.
2. Creation (executor: main): restructure recipe form into readable sections with clear image, sharing, and save controls.
3. Secondary flows (executor: UI subagent): refresh shopping list and settings layouts, spacing, button hierarchy, and mobile stacking without changing API behavior.
4. Validate keyboard focus, text contrast, 24px targets, mobile overflow, form labels, test suite, TypeScript, production build, and diff.

Acceptance: navigation and primary actions remain obvious at narrow and wide widths; recipe cards and detail pages use consistent hierarchy; forms and list controls are usable by touch and keyboard; existing flows and checks pass.

Result: responsive navigation, discovery pages, cards, shared detail view, editor, shopping list, settings, and informational pages refreshed. Saved image previews no longer expose internal paths. Manual focus, target, overflow, and color checks completed; primary text combinations exceed 4.5:1. Full suite: 236 tests passed. TypeScript check, production build, and diff check passed.
