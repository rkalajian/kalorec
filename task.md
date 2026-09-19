# Goal

Implement four reviewed improvements: disclose public-repo recipe visibility; secure URL import and bound response size; make GitHub recipe listing complete and reliable; validate saved URLs and improve input labels.

# Steps and targets

1. Privacy (executor: subagent): update settings and recipe form messaging, plus README/tests where relevant. In a public repo, every recipe JSON is public on GitHub regardless of the app's shared-profile toggle.
2. Import security (executor: subagent): validate redirect destinations and resolved addresses, reject unsafe targets, enforce a real streamed byte limit, add focused tests. Target `src/lib/extract/index.ts` and its tests.
3. Listing reliability (executor: subagent): surface failed reads, avoid unbounded parallel requests, handle the Contents API 1,000-entry limit or fail explicitly at it; add focused tests. Target `src/lib/github.ts`, `tests/lib/github.test.ts`, and any needed interfaces.
4. Validation and accessibility (executor: main): validate persisted `sourceUrl`/`image` schemes and size, add labels for search and generated ingredient/instruction fields, and tests. Target normalization/API/form/list files.
5. Integrate and verify with `npm test`, `npm run build`, and `git diff --check`.

# Acceptance criteria

- Public repo selection and recipe form clearly disclose GitHub visibility.
- Import cannot follow unchecked redirects or fetch private/resolved internal destinations; body limit applies without `Content-Length`.
- Listing never silently returns partial results after failed reads; request load is bounded; large directory behavior is explicit.
- API rejects unsafe URL schemes and oversized relevant fields; search and dynamic rows have programmatic labels.
- Tests and build pass.

# Verification

- Completed all four improvements.
- `npm test`: 178 passed.
- `npm run build`: passed.
- `npx tsc --noEmit`: passed.
- `git diff --check`: passed.
- WCAG audit via Claude unavailable; focused manual review completed. User requested no further Claude use.
