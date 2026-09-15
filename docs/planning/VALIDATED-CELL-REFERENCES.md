# Increment 6: value-matched spreadsheet references


Follows merged PR #6. Adds an optional cellReference to extracted facts and carries it into calculation sources. This is numeric value matching, not full semantic citation verification.

## Extraction and matching

The extraction prompt receives bounded stored cell evidence (up to 12,000 serialized cell characters plus framing) and may return sourceCell with exact sheetName/cellAddress. The server, not the model, assigns reference status. A matched reference requires the current worksheet name, exactly one stored cell at that address, a literal numeric/string cell, and strict numeric equality between raw cell value and extracted value. No nearest-value search or inferred coordinate is used.

Formula cells/caches, error cells, booleans, missing/duplicate cells, wrong sheets, malformed addresses, and mismatched values remain unverified with explicit reasons. A missing reference is not silently replaced with a page citation. Numeric zero is retained through extraction's value alias selection.

The optional persisted cellReference contains kind, status (unverified/value_matched), sheetName, cellAddress when matched, matchedValue, and reason. Matching always carries semantic_review_required: equal numbers alone do not verify the parameter, header, unit, entity, or period. Duplicate equal values elsewhere cannot establish those semantics. Records remain pending under the existing review workflow.

## Calculation evidence

Source objects for new spreadsheet-linked records use pageNumber null and additive cellReference rather than treating a sheet index as a PDF page. Mining summary text includes sheet/cell/status information. If the current record value differs from the saved matched value, calculation source output is downgraded to unverified with record_value_changed. The persisted original reference is retained as extraction-time evidence; this change does not mutate audit history or certify later edits.

Existing PDF and legacy records without typed references retain their old page metadata. No legacy migration occurs. Existing raw record responses may include cellReference; no new public write endpoint is added. Future consumers must distinguish extraction-time matching from current-value matching and semantic approval.

## Verification and limits

Run `npm test --prefix server`: 163 local tests passed, including 17 new reference tests. Tests cover matching zero, missing/wrong/ambiguous locators, unsupported cell types, bounded prompt data, legacy compatibility, calculation propagation, and changed-value invalidation.

The resolver and calculation path are tested with synthetic records. Full extraction-provider orchestration, real XLSX parsing, Mongoose persistence, report exports, and reviewer UI are not verified by these tests. Worksheet evidence is untrusted data; prompt labeling is not a complete prompt-injection defense. Cached formulas are deliberately withheld. Document access control remains the caller's existing responsibility.

Next: isolated real-parser/database integration verification and a reviewer evidence panel, followed by semantic header/entity/period verification and source-version snapshots. A value-matched locator must not be advertised as proof of report factual correctness.
