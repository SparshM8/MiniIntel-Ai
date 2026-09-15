# Increment 4: structured reporting periods and optional fact metadata


Follows merged PR #4. This is a schema/normalization foundation, not a period-aware calculation rollout or spreadsheet provenance implementation.

## Additive extracted-record fields

- factMetadata.version: derivation contract version (1).
- factMetadata.metricIdentity: coal_production, coal_dispatch, or unknown.
- factMetadata.figureType: actual, target, or unknown.
- factMetadata.reportingPeriod: originalLabel, resolved/unresolved status, and either kind/key/startDate/endDate or an unresolved reason.
- publicationStatus: optional unknown/provisional/revised/final; distinct from the existing pending/approved/rejected reviewer status.
- sourceVersion: optional source-supplied version label, not a generated revision identity.
- extractionMethod: optional unknown/llm_from_document_text/spreadsheet/manual. It is not inferred from file extension or assumed when absent.

Only explicit Coal Production, Coal Production Target, and Coal Dispatch labels derive a known metric. Generic production/target/dispatch labels remain unknown because geological/mining documents may refer to non-coal measures. This is deliberately more conservative than the earlier calculation module's MVP aliases; calculations are not yet switched to metadata.

## Period contract

- FY 2025-26, FY 2025-2026, and slash/en-dash variants resolve to FY:2025-2026, inclusive 2025-04-01 through 2026-03-31. Indian financial-year boundaries are the explicit domain convention.
- CY 2025 resolves to CY:2025 and January through December.
- YYYY-MM resolves to a calendar month with leap-year-aware boundaries.
- Bare years, incomplete FY labels, natural-language dates, and unsupported formats remain unresolved. No context is guessed. Four-digit years from 1000 through 9999 are supported within complete representable intervals.
- Dates are ISO date-only strings, not timezone-dependent instants. Original labels are preserved verbatim.

## Persistence and compatibility

Document validation derives metadata for newly constructed ExtractedRecord documents (including existing extractionService save calls), changed parameter/period labels, or attempted direct edits to derived metadata. Loading legacy data and saving unrelated fields do not backfill it. There is no bulk migration or automatic historical rewrite.

The old period, parameter, status, value, unit, and provenance fields remain unchanged. Publication/version/method fields are optional and currently remain absent unless explicitly supplied by a trusted writer. No new public write API is introduced. Raw record responses may include the additive fields after document save; clients must tolerate their absence on legacy records.

Query updates such as updateMany/findOneAndUpdate do not run document validation hooks. Existing approval query updates do not change period/parameter. Any future label-edit endpoint must use document save/validate or explicitly apply the same derivation contract; arbitrary database writers are not covered by this hook.

## Verification and limitations

Run `npm test --prefix server`. New tests exercise financial/calendar/month semantics, invalid and ambiguous periods, century rollover, leap years, conservative metric identity, and legacy immutability. Schema adapter tests load the actual model definition and invoke its registered hook with synthetic documents, checking new/legacy/edited-label behavior. These are contract tests, not real Mongoose casting or database integration tests; dependencies are not installed locally.

No client UI, OpenAPI endpoint, calculation grouping, OCR, spreadsheet coordinates, reviewer workflow, or revision precedence changes are included. Follow-up: verify real Mongoose save behavior in an isolated environment, preserve spreadsheet sheet/cell evidence, then integrate validated period identities into calculations and queries together.
