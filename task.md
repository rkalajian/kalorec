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

## Follow-up: how-to-use cleanup

Goal: make the guide easier to scan and act on while preserving accurate privacy and sharing guidance.

1. Reorganize `src/pages/how-to-use.astro` into short setup, recipe, shopping, and sharing sections with direct links. Executor: main.
2. Check responsive layout, semantic headings, links, focus, build, and diff. Executor: main.

Acceptance: essential setup and privacy details remain clear; each task has a short action path; build and diff check pass.

Result: guide condensed into four linked steps plus a privacy note. Build and diff check passed. Manual review found a logical heading order, list semantics, visible focus, readable colors, and no fixed-width mobile content. External audit command did not return output and was stopped.

## Follow-up: site logo and favicon

Goal: use the supplied Kalorec wordmark in the shared header and the supplied icon as the favicon.

1. Copy the supplied PNGs into `public/` without altering them. Executor: asset subagent.
2. Replace the text brand in `src/layouts/Layout.astro`, add favicon metadata, and size the image in `src/styles/global.css`. Executor: main.
3. Verify build, asset references, responsive header, and diff. Executor: main.

Acceptance: logo appears in the shared header, favicon loads from every route, images retain source fidelity, and build passes.

Result: supplied PNGs copied byte for byte into `public/`; shared header uses the wordmark and links the favicon. Dark header gives the wordmark a light background. Production build and diff check passed.
