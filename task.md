# Goal

## Follow-up: login count and footer

Goal: count distinct GitHub accounts that successfully log in and show the total in a shared footer with a privacy policy and current copyright year.

1. Store one persistent record per immutable GitHub user ID in site-wide Netlify Blobs; read the total by listing records. Executor: main. Targets: `src/lib/loginCount.ts`, OAuth callback, dependency, focused tests.
2. Add a responsive shared footer and public privacy page with accurate account, recipe, shopping-list, and sharing disclosures. Executor: subagent. Targets: layout, styles, route policy, privacy page.
3. Verify login deduplication, failure behavior, route access, tests, TypeScript, build, and diff.

Acceptance: repeat logins by one GitHub ID leave the count unchanged; distinct IDs increase it; counter survives deployments; guests can read privacy policy and footer; login remains usable if count storage fails; privacy copy matches implementation.

Result: site-wide Netlify Blobs stores one key per GitHub account ID, with the unique total shown in the shared footer. Added a public privacy policy and current-year copyright line. Existing historical logins cannot be reconstructed; counting begins after deployment. All 245 tests, TypeScript, production build, and diff check passed.

---

# Previous work

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

## Follow-up: About page refresh

Goal: make `/about` a short, scannable explanation of Kalorec and its privacy model.

1. Replace dense copy in `src/pages/about.astro` with a clear introduction, feature sections, privacy note, and guide link. Executor: main.
2. Verify responsive layout, heading order, contrast, focus, production build, and diff. Executor: main.

Acceptance: app purpose and GitHub storage are clear; shopping and sharing behavior remain accurate; privacy history warning remains visible.

Result: About page now has a concise introduction, three feature cards, a Git history note, and a guide link. Responsive grid, heading order, focus styling, and text contrast reviewed; production build and diff check passed.

## Follow-up: Settings page cleanup

Goal: make selected repositories and next actions easy to find while keeping repo changes, sync, and profile sharing available.

1. Reorganize `src/pages/settings.astro` around current private/public selections, expandable alternative repo lists, and a conditional profile link. Executor: main.
2. Check error states, keyboard and mobile behavior, build, tests, and diff. Executor: main.
3. Commit and push to `main` as requested. Executor: main.

Acceptance: current repo choices remain visible; alternative choices are discoverable; reload/sync and copy-link actions work; required privacy guidance remains clear.

Result: selected repos now sit in prominent cards; alternative choices use accessible disclosure controls; public setup waits for private selection; profile link appears when available. Manual keyboard, heading, contrast, and mobile-width review completed. All 236 tests, production build, and diff check passed.

## Follow-up: Cook Mode

Goal: make recipe instructions easy to follow while cooking and keep the screen awake when the browser permits.

1. Add an accessible Cook Mode to the shared recipe detail component with ingredient checkboxes, one instruction at a time, previous/next controls, and clear close control. Executor: main.
2. Add client behavior for dialog state, step navigation, and Screen Wake Lock acquisition, reacquisition after returning to the tab, and release on exit. Show a clear fallback when wake lock is unavailable or denied. Executor: subagent.
3. Document behavior briefly and verify keyboard access, screen wake lifecycle, TypeScript, tests, build, and diff. Executor: main.

Acceptance: Cook Mode works on private and public recipe pages; a supported browser requests wake lock only while Cook Mode is open; wake lock releases on close and recovers after tab visibility changes; unsupported browsers remain usable with a status message; controls are accessible by keyboard and touch.

Result: shared recipe detail has Cook Mode with checkable ingredients and step navigation. Screen Wake Lock is requested while open, released on exit, and requested again after tab return; unsupported or denied wake lock shows a fallback message. Accessibility audit findings for step-button focus and live announcements addressed. All 236 tests, TypeScript check, production build, and diff check passed.

## Follow-up: independent screen wake option

Goal: let readers keep the recipe page awake without entering Cook Mode.

1. Add a separate, accessible Keep screen on toggle and status to the shared recipe detail header. Executor: main.
2. Coordinate one wake lock between the page toggle and Cook Mode. Preserve the page choice when Cook Mode closes; release when neither needs it or the page exits; reacquire on tab return. Executor: subagent.
3. Update guidance, review accessibility, run tests, TypeScript, build, and diff check. Executor: main.

Acceptance: private and public recipe pages expose the option even when instructions are empty; the button reports on/off state and errors; exiting Cook Mode leaves a manually enabled screen lock active; disabling the option does not interrupt active Cook Mode; locks release when no longer requested.

Result: every recipe detail has an independent Keep screen on toggle with a live status message. A shared wake lock stays active while the page option or Cook Mode needs it, resumes after tab return or browser history restore, and releases when neither needs it. Five focused lifecycle tests pass; full suite passed (240 tests), TypeScript, production build, and diff checks passed. Accessibility audit issues with initial status announcements and toggle naming addressed.
