# Phase 1 Authorized Mining Corpus — Brutal Test Protocol

| Metadata | Value |
|---|---|
| Issued | 16 September 2026 |
| Purpose | Measure limits honestly, expose weaknesses, and plan remediation before wider production use. |

## 1. Entry conditions

Do not run operational reports until all are true:

- data owner provides written test authorization, classification and retention/deletion terms;
- corpus is relevant to the SIH mining-reporting problem and legally usable;
- development fixtures and held-out evaluation documents are separated;
- domain owners approve metric/unit/period/status definitions;
- two annotators create ground truth and an adjudicator resolves differences;
- isolated test database, object storage, external-AI policy and run ID exist;
- credentials are temporary and never copied into reports/logs.

Manifest each document by opaque ID, SHA-256, issuing authority, source/license, report type, state/subsidiary/mine, period/revision, file type, pages/size, language/script, scan quality and expected facts/evidence locators.

## 2. Minimum corpus

Use at least 60 held-out documents:

- 15 digital PDFs;
- 15 scanned PDFs/images;
- 15 XLSX/CSV reports;
- 5 DOCX reports;
- 5 multi-page or merged-table reports;
- 5 degraded/rotated/annotated scans.

Include production, dispatch, target, geological narrative, statutory/administrative, revised/cancelled and deliberately conflicting sources. Include English, Hindi and at least one state script only when the approved source inventory proves material usage.

## 3. Execution timing

For every document capture monotonic start/end timestamps for:

1. upload and content/type validation;
2. malware/signature scan;
3. text extraction or OCR by page;
4. structured extraction;
5. validation;
6. reconciliation;
7. reviewer correction/decision;
8. report generation;
9. export;
10. cleanup.

Capture CPU, peak memory, input bytes/pages, retries, provider calls/tokens/cost and final state. Report median, p95, p99 and maximum by format, language and scan-quality cohort. Never publish only the mean.

## 4. Accuracy metrics

- entity, metric, value, unit, period and status precision/recall/F1;
- exact numerical correctness after normalization;
- table row/column association correctness;
- page/table/sheet/cell locator correctness;
- supported-claim, unsupported-claim and citation correctness;
- conflict detection and abstention precision/recall;
- reviewer correction count and active minutes;
- equivalent manual versus assisted completion time;
- failure/retry rate, pages/minute and cost/document.

A correct number assigned to the wrong mine, period, unit or status is incorrect. API test pass rate is never extraction accuracy.

## 5. Role and access cases

Test anonymous, inactive, user, reviewer, proposed official/approver, admin and cross-tenant actors. Cover missing/expired/tampered tokens, IDOR, role claim tampering, owner/foreign document access, reviewer assignment, bulk mixed ownership, export/download/citation leakage, cached results and audit access. Confirm denied requests cause zero writes.

Do not create a shared password list. Provision temporary identities through the approved identity system and revoke them after the run.

## 6. Functional and adversarial matrix

### Files and ingestion

- wrong extensions/MIME, polyglots, malformed PDFs, macro/active content;
- encrypted/password PDFs, huge pages, excessive pages, decompression bombs;
- duplicate uploads, partial files, network loss and retry after commit;
- rotated/skewed scans, low contrast, watermarks, stamps and handwriting.

### Values and context

- zero/negative zero, null/blank, NaN/Infinity and overflow;
- `MT` ambiguity, mixed units/exponents, locale decimals, lakh/crore grouping;
- production versus dispatch/target, provisional/revised/cancelled status;
- FY versus CY, month boundaries, impossible dates and missing periods;
- duplicate totals, subtotals, merged headers and conflicting revisions.

### Language

- English, Hindi and corpus-justified scripts;
- mixed-script pages, Indic digits, Unicode normalization/confusables;
- English mining abbreviations inside regional text;
- place/mine/seam names, transliteration and bilingual tables;
- original versus translated evidence kept separately;
- OCR character/word error and downstream fact accuracy per language.

### AI and retrieval

- document prompt injection, hidden/white text and malicious instructions;
- unsupported questions, conflicting evidence and provider outage;
- restricted-source leakage through answers, caches, citations or downloads;
- hallucinated coordinates, formulas, values or confidence.

### Concurrency and resilience

- simultaneous create/review/delete and identical/reused request IDs;
- stale versions, retry storms and process restart mid-OCR;
- database/storage/provider partial failure;
- backup restore, audit immutability, legal hold and deletion.

### UI/accessibility

- keyboard-only, focus order/traps, screen reader names;
- 200% zoom, 390px/desktop, long translated strings and dark mode;
- duplicate clicks, delayed/out-of-order responses and failed refresh;
- Chromium plus approved Firefox/WebKit and representative devices.

## 7. Load model

Run on staging only. Establish single-user baseline, then step through 5, 10, 25, 50 and 100 concurrent users—or stop earlier when safety thresholds are crossed. Separate upload/OCR, read/search, reconciliation and review workloads. Include 60-minute steady state and a controlled spike. Record queue depth, throughput, p50/p95/p99, errors, CPU, memory, database connections and provider limits.

Stop when error rate, resource pressure, data integrity or provider cost exceeds the approved guardrail. A CPU-only reconciliation micro-benchmark is not a portal load test.

## 8. Cleanup proof

Each run must use a unique prefix. In `finally`/teardown:

1. stop workers/listeners;
2. remove run-scoped uploads/temp/OCR outputs;
3. delete run-scoped reports, decisions, reconciliations, records, documents and users;
4. query each collection/storage prefix and record zero remaining objects;
5. revoke temporary credentials and provider keys;
6. retain only de-identified aggregate metrics, manifest hashes and approved failure evidence.

Never delete baseline fixtures or unrelated user files. If cleanup fails, quarantine the environment and mark the run invalid until resolved.

## 9. Finding format

Every defect records run ID, corpus cohort, severity, reproducible steps, expected/actual result, evidence hash, timing/resource impact, security/privacy impact, root-cause hypothesis, owner and regression test. Do not include sensitive report text in public issues.

Prioritize: data leakage or wrong approved number (critical); silent evidence/conflict corruption (high); recoverable workflow/performance issue (medium); cosmetic issue (low).

## 10. Exit report

Publish corpus composition and exclusions, environment/commit/config hashes, all commands, aggregate timings, per-format/language metrics, capacity/saturation, failures, cleanup proof, known limitations and approved remediation backlog. A domain reviewer, security owner and operations owner must sign the next production decision.
