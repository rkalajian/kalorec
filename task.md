# Goal

Keep source recipes in a private GitHub repo and publish only selected recipes into a distinct public GitHub repo. Anonymous profile pages must read only published copies.

# Plan and targets

1. Storage boundary (executor: main): make `RecipeStore` directory configurable; read public profiles and copy sources only from `data/shared-recipes` in the public repo. Target `src/lib/github.ts`, `src/lib/publicStore.ts`, tests.
2. Sharing configuration (executor: subagent): add an optional public sharing repo to the encrypted session, validate that it is public, writable, and distinct from the private source repo; expose selection and profile link in Settings. Target session, settings route/page, relevant tests.
3. Publication lifecycle (executor: main): on create/edit/delete, synchronize chosen recipes to the sharing repo. Remove a public copy before unsharing/deleting its source. Report cross-repo partial failures without claiming publication succeeded. Target recipe API routes, new publishing helper, tests.
4. UX and docs (executor: subagent): explain private source and explicit public copies, including Git history after unsharing; update recipe form and README. Target form/docs.
5. Integrate, migrate existing shared recipes on first sharing-repo selection, and verify tests, typecheck, build, and diff check.

# Acceptance

- New private source recipes never appear in anonymous routes unless explicitly shared.
- Sharing requires a private source repo and a separate public sharing repo.
- Public pages read only `data/shared-recipes`; public selection publishes existing flagged recipes.
- Unsharing or deleting removes the public copy before changing the source.
- GitHub history permanence and public source repo exposure are disclosed.
- Tests, typecheck, and build pass.

# Verification

- `npm test`: 207 tests passed across 23 files.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- Full browser accessibility audit unavailable locally (`wcag-audit` command absent); changed Settings controls reviewed for labels, focus visibility, and target size.
