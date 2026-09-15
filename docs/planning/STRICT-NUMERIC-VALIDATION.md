# Increment 2: strict numeric document validation


## Delivered behavior

Document validation now uses the shared parseReportedNumber utility instead of stripping nonnumeric characters. Nonempty malformed values for the existing monitored parameter categories (production, dispatch, target, cost, quantity) produce an open invalid_value issue with error severity, field value, and details.reason equal to invalid_numeric_format.

Blank/null/undefined fields remain missing_data warnings. Narrative fields are not automatically treated as numeric. Genuine zero remains valid; negative monitored values retain their existing error. Extracted records are never rewritten by this validation change.

Rejected numbers are excluded from validation averages and production/dispatch/target comparisons. They are not converted to zero. Existing open-issue deduplication remains unchanged; resolved or ignored issues do not prevent a new finding.

## Compatibility and testing

The existing validateDocument(documentId) entry point, controllers, routes, and response envelopes remain unchanged. No schema changes or new dependencies are required. The existing ValidationResult schema already accepts invalid_value and details.

A createValidationService factory accepts model adapters so the actual validation logic can be exercised with in-memory persistence. Production models are loaded lazily through the original entry point. Tests do not load Mongoose, access a database, start a server, or call AI providers.

Run `npm test --prefix server` from the repository root. The local Node 24.14.1 run passed 74 tests: 40 parser tests and 34 validation regression tests. The latter cover malformed fields, missing values, grouped numbers, zeros, negative values, narrative fields, monitored categories, comparison exclusion, average exclusion, repeated validation, resolved issues, empty documents, and persistence failures. This does not establish MongoDB integration or end-to-end API correctness. Remote CI results must be checked on the PR.

## Deliberate limits and next work

- The existing parameter-name heuristic is retained; a domain metric registry remains future work.
- Numeric parsing changes apply to document validation only. Mining intelligence and report calculations still need explicit missing-data handling and removal of permissive/zero fallbacks.
- Unit normalization, period alignment, revision reconciliation, concurrent issue deduplication, and automatic resolution of stale findings remain outside this change.
- Existing dispatch-versus-production checks remain warnings; stock movements mean dispatch exceeding production is not necessarily an operational error.
- No extraction-accuracy, report-accuracy, or automation percentage is claimed.

This increment follows merged upstream PR #2. It implements the validation portion of the first follow-up task in BASELINE-AUDIT.md; that audit describes the earlier baseline and is not a current completion checklist.
