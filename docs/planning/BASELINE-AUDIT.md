# SIH 26023 baseline audit: first increment

## Status and limits

This is a focused static inspection, not a completed application audit. Existing README accuracy and test-pass claims have not been independently reproduced. No application server, MongoDB instance, or external AI provider was used. No application endpoints were changed in this increment.

Local environment: Node 24.14.1 and npm 11.11.0. Repository engines specify Node 20.x. Server/client dependencies are not installed locally. CI is configured to run the new dependency-free tests on Node 20 and 24; a remote CI result is not yet available.

## Observations and prioritized follow-up

| Area | Inspected evidence | Finding | Next acceptance criterion |
| --- | --- | --- | --- |
| Numerical parsing | server/services/validationService.js; server/services/miningIntelligenceService.js | Parsers remove nonnumeric characters before parseFloat, allowing annotated values and ranges to be misinterpreted. | Strict parsing rejects ambiguous fields; callers flag invalid values instead of replacing them with zero. |
| Extracted fact contract | server/models/ExtractedRecord.js | Has document/page, free-text period/unit, status, source text, and edit history. No explicit sheet/cell locator or actual/target field in this schema. | Add backward-compatible provenance and fact semantics with migration tests. |
| Spreadsheet extraction | server/services/excelService.js | Sheets become CSV strings and synthetic page numbers; structured cell references are not returned. | Preserve sheet/cell locations alongside existing text output. |
| Validation | server/services/validationService.js | Numeric comparisons do not normalize units; duplicate grouping does not distinguish revisions. | Compare only compatible records and route conflicting revisions for review. |
| Numerical reporting | server/services/miningIntelligenceService.js | Aggregations use permissive parsing and do not normalize units in the inspected loops. | Approved, compatible records only; missing/invalid data never silently becomes zero. |
| Report evidence metrics | server/services/reportService.js | Confidence is floored at 0.75; missing retrieval defaults to 0.85. Evidence coverage counts similarity-qualified sources rather than verifying claims. | Separate retrieval similarity from measured factual/citation coverage; no artificial confidence floor. |
| Topics | server/services/topicService.js | Invalid model JSON produces a placeholder topic. | Explicit extraction failure or validated retry, without persisting invented topics. |
| Test execution | server/package.json; client/package.json; scratch/run_full_api_verification.js | No unit-test scripts before this increment. Legacy runner calls a local API and writes API_TEST_REPORT.md. Full script was not reviewed or executed. | Isolated tests by default; review all legacy runner side effects before using an isolated test deployment. |

Authorization, upload security, approval transitions, UI integration, OCR fidelity, and deployment behavior remain pending review. Any security findings must be reported privately under CONTRIBUTING.md, not added to public issue details.

## First implementation slice

Added a dependency-free parseReportedNumber utility and table-driven unit tests. It accepts finite numbers, plain decimals, and correctly grouped Western/Indian thousands. It rejects units inside numeric fields, percentages, ranges, annotations, scientific notation, malformed grouping, unsupported objects, and non-finite values. Unit and percentage interpretation require explicit domain handling rather than character stripping.

The utility is intentionally not wired into production services yet: changing parsing without changing missing-data handling would leave existing zero fallbacks in place. Integration must include validation issues and calculation exclusion tests in the next focused change. JavaScript Number is used here; this is not a decimal-precision accounting engine.

Run the isolated suite with `npm test --prefix server` from the repository root. It requires no npm install, database, credentials, network, or document uploads. CI uses the same command. Passing these unit tests does not establish extraction accuracy or application correctness.

## Proposed child-issue sequence

1. Integrate strict parsing with explicit invalid-value validation and regression tests; never silently coerce rejected fields to zero.
2. Define normalized fact, reporting-period, source-version, and source-locator contracts; preserve legacy APIs.
3. Preserve spreadsheet evidence coordinates and add synthetic workbook fixtures.
4. Implement unit-compatible comparison and revision conflict handling.
5. Review report evidence/abstention and replace unsupported confidence metrics.
6. Complete private authorization review and isolated end-to-end baseline before exposing additional retrieval/reporting features.
7. Deliver reviewed report snapshots and exports, then topic-discovery corrections and benchmark workflows.

These are proposed tasks, not published GitHub issues. The parent proposal is SIH-26023-tracking-issue.md. Maintainer approval, representative templates, domain definitions, and deployment/data policies remain open decisions.
