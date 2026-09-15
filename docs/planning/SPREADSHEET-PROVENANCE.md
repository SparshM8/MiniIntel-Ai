# Increment 5: persisted spreadsheet evidence

Follows merged PR #5. Adds worksheet evidence alongside existing text extraction and persists it through the document-processing page mapper.

## Additive page contract

DocumentPage keeps documentId, pageNumber, content, and wordCount. Spreadsheet pages additionally have sourceKind (spreadsheet_sheet or csv_sheet) and spreadsheet:

- sheetName: original workbook sheet name (CSV uses the parser's synthetic sheet name).
- cells: address, parser cellType, rawValue, formattedText, numberFormat, formula, and valueOrigin.
- valueOrigin: literal, cached_formula_result, or missing_formula_cache. Formulas are never evaluated by this contribution; cached results may be stale.
- mergedRanges: one-based startRow/startColumn/endRow/endColumn. Anchor values are not copied into other merged cells.
- omittedCells, omittedMergedRanges, truncated: explicit evidence-limit indicators.

A page's existing documentId plus sheetName and cell address form the source locator. The retained pageNumber is a compatibility ordering index, not a printed PDF page. Consumers should use sourceKind and sheet/cell evidence; existing citation UI is not yet migrated.

Raw numeric Excel dates remain serial values with type/format evidence. Formatted text is copied only when supplied by the parser; it is not invented. CSV raw mode retains lexical fields such as leading-zero identifiers. Error-cell values retain their error type and must not be treated as production figures.

## Storage and limits

Optional subdocuments preserve existing PDF/Word pages and historical spreadsheet pages unchanged. The current document-details controller returns stored page objects without requiring a new endpoint. No new public mutation route is introduced.

Evidence collection iterates actual stored cell keys rather than all coordinates in !ref. Per sheet it retains at most 10,000 cells and approximately 2 MiB of serialized cell evidence, plus up to 10,000 merged ranges. Oversized cells are omitted and counted, not silently shortened. These limits bound added evidence only: they do not bound workbook decompression, legacy CSV rendering, total sheet count, or overall upload resource usage.

Formula-only sheets are retained even when text rendering is empty. Truly empty sheets retain the earlier omission behavior for XLSX. CSV retains its single-page behavior. Text extraction consumers remain available; CSV lexical formatting may differ from earlier inferred-value output.

## Verification

Run `npm test --prefix server`. The local suite passed 146 tests, including 12 new provenance tests. Synthetic worksheet objects and injected XLSX adapters test metadata retention, zero/false/error cells, formula caches, merged ranges, sparse dimensions, evidence limits, multi-sheet output, CSV parser options, and the actual persistence-mapping helper.

These are not binary XLSX round-trip tests or real MongoDB persistence tests. The installed XLSX parser and Mongoose schemas require separate integration verification; no such result is claimed here. No database, external AI, or real operational documents were used.

## Remaining work

- Add real XLSX/CSV fixture round-trip and Mongoose integration tests in an isolated environment.
- Link extracted numeric facts to validated sheet/cell locators, rather than merely preserving page-level evidence.
- Update reviewer preview and citations to show sheet/cell locations instead of synthetic page indices.
- Apply existing document permissions consistently to evidence retrieval and review access.
- Connect source versions and report snapshots in a later contribution.
