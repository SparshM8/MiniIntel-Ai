# Increment 7: real parser and model integration tests

Follows merged PR #7. Exercises the installed XLSX and Mongoose libraries, not the prior parser/schema adapters.

## Verified locally

- Generate a synthetic binary XLSX in a unique OS temporary directory, write it with XLSX, then parse it through the actual excelService.
- Preserve multi-sheet ordering, empty-sheet behavior, zero, booleans, leading-zero strings, formatted numbers, merged ranges, cached formulas, and formulas without cached results.
- Read a real CSV fixture with quoted commas and leading-zero identifiers.
- Pass parsed evidence through the real DocumentPage schema, validate it, and match a literal cell using the resulting Mongoose subdocument.
- Validate a real ExtractedRecord, exercise casting and metadata hooks, hydrate it, and verify changed-value citation invalidation.
- Validate legacy records without backfill, refresh metadata on period edits, and reject invalid enum values.

Temporary fixture directories are removed using node:test cleanup hooks. No operational files, uploads, credentials, or external AI calls are used. No fixture binaries are committed.

## Bug discovered and fixed

The installed XLSX parser omits uncached formula cells by default. With sheetStubs enabled it exposes them as type z cells with a synthetic v of zero. The previous evidence collector discarded all z cells. The reader now requests stubs, and the collector retains formula stubs with rawValue null and missing_formula_cache. Ordinary blank stubs remain excluded. The real binary round-trip test failed before this change and passes afterward.

## Reproduction

From the repository root:

1. `npm ci --prefix server --ignore-scripts --no-audit --no-fund`
2. `npm test --prefix server`
3. `npm run test:integration --prefix server`

Local Node 24.14.1 results: 163 unit tests and 5 parser/model integration tests passed. CI adds a separate integration job on Node 20 and 24 using the same locked dependencies. No dependency or lockfile changes were required. Lifecycle scripts are disabled because these tests do not require native OCR/PDF components; this install is not proof those components are functional.

## Limits

These tests use real Mongoose casting, validation, hydration, and hooks without a database connection. They do not verify save/insertMany/query behavior against MongoDB. No mongod or Docker executable was available in the local shell; database persistence remains a separate isolated test task. No application server, provider orchestration, UI, authorization, or export behavior is certified. Remote CI outcomes must be checked on the PR.

The dependency install reported existing deprecation warnings and a Node engine mismatch (project declares 20.x; local runtime is 24). Dependencies were not upgraded as part of this focused contribution.
