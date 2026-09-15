# Increment 3: conservative production calculations

Follows merged upstream PR #3. Replaces the mining intelligence service's permissive aggregations with a dependency-free production calculation module.

## Behavior

- Query only approved records within the requested document/entity/period scope. Empty results do not trigger broader or unreviewed fallback queries. Entity/period query strings use escaped, anchored, case-insensitive matching.
- Group by subsidiary, mine, and exact period label (case/outer whitespace normalized). Do not add subsidiary totals to mine totals or compare different period labels.
- Recognize explicit production, coal production, target, production target, coal production target, dispatch, and coal dispatch labels. Other metrics are not computed by this MVP module.
- Normalize t/tonne/tonnes/metric tonne(s) and explicit million tonne(s) to tonnes. Ambiguous MT and unsupported units are withheld, not guessed.
- Missing, negative, malformed, out-of-range, or ambiguous repeated metrics remain null with warnings. Duplicate candidates are not summed or silently selected; reconciliation is future work.
- Calculate variance = production - target, variance percentage = variance / target * 100, achievement = production / target * 100, dispatch gap = production - dispatch, and dispatch percentage = dispatch / production * 100. Undefined denominators yield null, not zero or infinity.
- Preserve record/document/page references for each role and both anomaly operands. No page reference is fabricated when unavailable.
- Pass calculation scope and any supplied user context to anomaly evidence retrieval. Retrieval failure does not discard deterministic results and does not establish a cause.

## Compatibility and deliberate behavior reductions

The original analyzeDataAndFindAnomalies entry point and summaryText/evidenceText/anomalies/combinedSources fields remain. Additive calculations and calculationWarnings fields expose structured results internally. No routes, persisted schemas, or dependencies change.

Unqualified historical trends and cross-period mine rankings are removed from this service until normalized period semantics, compatible entity coverage, and revision handling exist. This is a deliberate reduction in output coverage: missing evidence must not produce apparently authoritative rankings or trends. No-record cases now report insufficient evidence rather than absence of anomalies. The report-generation LLM and its confidence metric remain separate follow-up work; this change does not guarantee complete report factual correctness.

The existing access-control contract still needs a dedicated end-to-end review; query scope is not authorization. Passing user context to retrieval does not by itself establish complete authorization enforcement. No security certification is claimed.

## Verification

Run `npm test --prefix server`. Synthetic unit tests cover the pure calculation module and the actual mining service with injected database/retrieval adapters. No MongoDB, production data, or external provider is used. Tests cover invalid/missing fields, zeros, unit normalization, unsupported units, entity/period separation, duplicate candidates, target classification, approval filtering, overflow, empty-scope behavior, literal query matching, evidence context, and provider failure.

Limitations: exact-label domain mapping, conservative rejection of repeated totals, JavaScript floating-point arithmetic, no financial-year parser yet, no source-version snapshots, and bounded narrative context that may omit rows. Full structured rows are returned internally. UI, real MongoDB integration, provider integration, and export tests are not part of this increment.
