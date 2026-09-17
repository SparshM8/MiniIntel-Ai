# MineIntel AI — Phase 1 Production Baseline Assessment

**Assessment date:** 16 September 2026

**Baseline:** `main` at `ba93f77c742ecb0e0d410438153d0d98e5ebdfb2`

**Decision:** **Phase 1 production baseline / controlled-pilot candidate**, not unrestricted general availability.

## Executive conclusion

The deterministic validation, reconciliation, provenance, authorization and review foundations are suitable for a controlled Phase 1 pilot. This label does not claim proven factual accuracy on real Indian mining reports, multilingual OCR readiness, production concurrency capacity, disaster recovery or security certification. The next program stage is testing, analysis and planning; remediation begins after an authorized corpus and acceptance thresholds are approved.

## Test safety and data integrity

- No live deployment, production database or operational account was mutated.
- Persistence tests used temporary `mongodb-memory-server` databases and teardown hooks.
- Browser tests used local/mocked traffic.
- No secrets or confidential reports are recorded here.
- Repository inventory found generic/synthetic samples only (`test.csv`, `server/test.pdf`, `scratch/test_sample_doc.pdf`), not an authorized representative mining-report corpus.
- Therefore no extraction/OCR accuracy, real-report throughput, supported-claim or time-saving percentage is claimed. API test pass rate is not factual accuracy.
- Temporary database state was destroyed at process teardown. Ignored build/Playwright artifacts are not application records.

## Measured automated baseline

Environment: Windows x64, Node.js 24.14.1, warm dependency cache. Wall time includes command startup and is not an SLO.

| Command | Scope | Result | Tests | Wall time |
|---|---|---:|---:|---:|
| `npm test --prefix server` | contracts, parsing, periods, evidence, calculations, reconciliation, validation | Pass | 195 | 2.090 s |
| `npm run test:integration --prefix server` | parser/model integration | Pass | 12 | 2.476 s |
| `npm run test:persistence --prefix server` | temporary MongoDB, HTTP auth, review/reconciliation writes | Pass | 33 | 7.930 s |
| `npm test --prefix client` | evidence/review utilities and reconciliation view logic | Pass | 27 | 1.088 s |
| `npm run build --prefix client` | Vite production build | Pass with warning | — | 11.683 s |
| `npm run test:browser --prefix client` | browser interaction, failure, concurrency and responsive behavior | Pass | 30 | 32.063 s |

**Serial total:** 57.330 seconds. **Reported automated tests:** 297; build excluded.

Four of the 30 browser tests came from a local untracked workspace preview. The tracked production baseline contributed 26 browser tests. Preview results must not be represented as production reconciliation-page E2E coverage.

The build produced a large-chunk warning: main JavaScript approximately **1,516.05 kB** (**424.09 kB gzip**). Route-level code splitting is a priority.

## Deterministic core capacity probe

This CPU-only micro-benchmark repeatedly called the in-process reconciliation engine over synthetic acceptance cases. It excludes HTTP, auth, MongoDB, parsing, OCR, network, queues and UI.

| Executions | Total | Mean | Approx./second | Heap delta |
|---:|---:|---:|---:|---:|
| 10,000 | 106.430 ms | 0.010643 ms | 93,958.7 | +677,296 B |
| 100,000 | 1,068.217 ms | 0.010682 ms | 93,614.0 | -362,952 B |

The core scaled nearly linearly in this single run. Garbage collection explains the negative heap delta. These values do not establish portal users, uploads/minute or OCR pages/minute. Repeat at least 30 times on target infrastructure and publish median/p95/p99.

## Coverage exercised

- **Values:** zero/negative zero, null/blank, malformed ranges, annotations, Infinity, oversized values, Indian/Western grouping, division by zero and unsupported units.
- **Scope:** production versus target, calendar versus financial years, invalid dates, mine/subsidiary/period mismatch and duplicate totals.
- **Evidence:** page/cell references, formulas/caches, merged and sparse sheets, leading-zero CSV, multi-sheet and byte/cell limits.
- **Reconciliation:** match, conversion, conflict, incompatibility, insufficient evidence, draft/unknown-source abstention and deterministic reasons.
- **Persistence:** immutable snapshots, hashes, idempotent create/decision, concurrent duplicate decisions and stale-version rejection.
- **Security behavior:** missing/invalid/expired tokens, suspended accounts, owner isolation, foreign-document denial, admin/reviewer checks and no partial bulk writes.
- **UI behavior:** stale-response suppression, HTML rendered as text, keyboard dialog handling, retries/deadlines, failed refreshes and 390/1440-pixel layouts.

## Portal access model

There is no `official` role. Current server roles are `user`, `reviewer` and `admin`; presentation labels do not create permissions.

| Capability | Anonymous | User | Reviewer | Admin |
|---|---:|---:|---:|---:|
| Public/auth pages | Yes | Yes | Yes | Yes |
| Own documents and extracted records | No | Yes | Yes | Yes |
| Other user's document | No | No | No under current rule | Yes |
| Create/list/read own-document reconciliation | No | Yes | Yes | Yes |
| Submit reconciliation decision | No | No | Yes, ownership still applies | Yes |
| Reconciliation review UI | No | No | No | Yes |
| Admin users/health/pending reviews | No | No | No | Yes |

Access points: user `/login`, admin `/admin/login`, reconciliation workspace `/admin/reconciliations`. Credentials must be provisioned out of band; no default password belongs in source or reports. `ADMIN_USERNAME` currently determines the only identity allowed to retain admin status.

### Access weaknesses

1. Define “official” as owner, reviewer, approver or publisher and implement explicit permissions.
2. Reviewer role cannot review foreign documents unless promoted to admin; add assignments/organization scope.
3. Tenant/subsidiary boundaries are not demonstrated.
4. MFA, SSO, rate limiting, revocation and privileged re-authentication were not proven.
5. Replace username-based admin authority with managed RBAC and immutable identity claims.

## Language finding

A single common language must not be assumed. Central technical/statutory reports are frequently English, while government environments are bilingual and state/field records may contain Hindi/regional scripts, stamps, annotations and place names. The IBM returns portal presents Hindi content, confirming a multilingual operating environment, but a portal UI does not prove the permitted language of every statutory return.

Current limitations:

- OCR creates Tesseract with **`eng` only**.
- Settings accept `en` and `hi`, but UI/report preference is not OCR/extraction support.
- Hindi and regional-script factual extraction are therefore **unvalidated**, not supported Phase 1 claims.

A compliance owner must inventory exact IBM/MCDR, Ministry/Coal Controller, CMPDI/CIL/subsidiary and state forms and record prescribed/permitted/customary languages. Add per-page language detection, justified OCR packs, separate original/translation evidence, mining glossaries and per-language accuracy reporting. See the companion protocol.

## Weaknesses

### Critical before unrestricted production

1. No authorized held-out mining corpus or domain-approved ground truth.
2. English-only OCR and unknown mixed-script quality.
3. No full upload-to-report sustained load/endurance benchmark.
4. Reviewer/official assignment and tenant policy unresolved.
5. Backup/restore, retention/deletion, incident response and disaster recovery unproven.

### High

1. Production reconciliation page lacks full browser E2E coverage.
2. Reconciliation is not fully orchestrated automatically from approved comparable facts.
3. Upload is limited to 50 MB, but page/decompression/OCR resource controls need proof.
4. MIME allow-list exists; signature validation, malware scanning and active-content policy are unproven.
5. External-AI confidentiality, residency, retention, outage and cost policy needs approval.
6. No real-document prompt-injection/redaction benchmark.
7. Large client bundle affects startup performance.

### Medium

1. No reconciliation pagination/filter/search/assignment queue.
2. No p95/p99 telemetry, queue depth or reviewer-turnaround dashboard.
3. Accessibility and browser/device coverage remain incomplete.
4. Local browser totals can include unknown untracked tests; release manifests should reject accidental artifacts.
5. Verbose logs need machine-readable summaries.

## Proposed timeline

| Window | Work | Exit criterion |
|---|---|---|
| 16–18 Sep 2026 | Freeze baseline; approve owners, policy, roles and test charter | No ambiguous “official” role |
| 19–25 Sep 2026 | Acquire authorized corpus and double-reviewed truth | Manifest, permission and adjudication complete |
| 26 Sep–2 Oct 2026 | Functional, OCR, multilingual and adversarial benchmark | Per-format/language metrics with run IDs |
| 3–6 Oct 2026 | Staging load, endurance, recovery and security tests | Saturation, p95/p99, restore evidence, findings |
| 7–9 Oct 2026 | Root-cause and prioritize weaknesses | Signed remediation backlog/thresholds |
| From 10 Oct 2026 | Execute fixes in small reviewed changes | Regression evidence for every closure |

## Proposed next decision gates (not achieved claims)

- 100% numerical correctness for agreed critical fields after adjudication.
- At least 99% correct source locators for approvable claims.
- Zero cross-user/tenant leakage and silent conflict overwrite.
- 100% blocking/abstention for agreed critical unresolved conflicts.
- Published stage p95/p99 and saturation on target infrastructure.
- Successful encrypted backup restore and test-data teardown.
- No open critical/high security finding.
- Separate per-language results; no pooled metric hiding weak scripts.
- Domain-owner approval for each report type.

## Baseline integrity

The assessment did not alter tracked application code or persistent application data. Ephemeral Mongo processes and HTTP listeners terminated successfully. Existing untracked preview/presentation/report-draft files were not treated as product data and were not deleted. Future corpus runs must use isolated DB/storage prefixes and verify zero residual documents, records, reconciliations and uploaded files after aggregate metrics are exported.
