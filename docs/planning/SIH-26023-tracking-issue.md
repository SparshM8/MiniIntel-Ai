# [Feature Request]: SIH 26023 evidence-backed reporting roadmap

## Purpose

Track incremental delivery of a trustworthy geological, mining, production, and administrative reporting workflow for CMPDI/CIL under SIH 2026 problem statement 26023.

The goal is not another generic PDF chatbot. It is an auditable pipeline:

**Ingest -> extract -> structure -> validate -> retrieve/calculate -> draft -> review -> export.**

## Repository context and current status

- Upstream: https://github.com/Vishal202-rgb/MiniIntel-Ai
- Contributor fork: https://github.com/SparshM8/MiniIntel-Ai
- The existing repository documents React/Vite, Express, MongoDB/Mongoose, OCR, extraction, validation, RAG, reports, review, and topic modules.
- Documentation was inspected for planning; implementation correctness and claimed test results have not yet been independently verified.
- This proposal extends and hardens existing modules rather than assuming they are absent or proposing a wholesale rewrite.
- Maintainer agreement is requested before significant architecture, schema, or policy changes.

## Problem and user benefit

Reporting teams must compile evidence from scanned PDFs, digital documents, spreadsheets, images, and historical records. Manual work causes delays, inconsistent figures, dependence on individual expertise, and weak traceability.

Users need accurate, source-linked reports and inquiry responses, with reliable calculations, visible uncertainty, and authorized human approval. The solution must also provide topic identification and word clouds.

## Initial scope

Deliver a production-versus-target report and a high-priority inquiry response as complete workflows. Include a narrative geological/mining document use case to verify that the platform is not limited to production tables.

Support representative digital PDFs, scanned PDFs, images, spreadsheets, and digital Word documents. Preserve source versions and page/table or sheet/cell references where applicable. Never invent source coordinates that an extractor cannot recover.

Predictive mining operations, IoT, satellite analysis, autonomous regulatory submission, and additional client platforms are outside this initial scope.

## Delivery plan

Each part becomes one or more linked child issues and small pull requests after the baseline audit. Parts are milestones, not instructions to create one oversized PR per milestone. Backend, frontend, tests, and documentation must be integrated for each delivered workflow.

### Part 0: Baseline audit and agreed acceptance criteria

- [ ] Inventory actual routes, schemas, services, UI actions, and test coverage against SIH requirements.
- [ ] Mark capabilities as verified, partial, missing, or blocked, citing files and test evidence.
- [ ] Inspect test scripts before execution; use isolated local/test resources, never production data or live deployment mutation.
- [ ] Record reproducible setup, test commands, prerequisites, and failures without overstating coverage.
- [ ] Agree MVP report fields, terminology, approval policy, data access rules, and representative fixtures.
- [ ] Create the prioritized child-issue backlog and identify dependencies.

Acceptance: maintainers can see what already works, what needs improvement, and how each requirement will be tested.

### Part 1: Test foundation and domain/provenance contracts

Depends on Part 0.

- [ ] Establish repeatable local tests and fork-safe CI without production credentials; mock external AI for deterministic tests.
- [ ] Define entity, metric, period, unit, actual/target, provisional/revised status, source version, source locator, and review state.
- [ ] Define access boundaries for documents, records, search, reports, and exports before exposing new capabilities.
- [ ] Use additive schema changes where possible; document migration and compatibility behavior.
- [ ] Add synthetic or explicitly redistributable fixtures with manually verified expected outputs.

Acceptance: records with different periods, units, or statuses cannot silently become equivalent; fixtures and tests run reproducibly.

### Part 2: Ingestion and source-preserving extraction

Depends on Part 1.

- [ ] Audit and improve upload validation, original-file preservation, hashing, metadata, versioning, and retryable processing status.
- [ ] Preserve spreadsheet sheet/cell locations and PDF page/table evidence where extraction supports it.
- [ ] Test merged headers, multi-page tables, image/scanned input, poor scans, and OCR failures.
- [ ] Flag uncertain extraction for review rather than inventing values or evidence.
- [ ] Provide processing/error states and a usable source preview in the UI.

Acceptance: users can inspect where an extracted fact came from; failed or uncertain processing is visible and recoverable.

### Part 3: Validation, conflicts, and correction review

Depends on Part 2.

- [ ] Implement/test unit and period normalization, required fields, total checks, duplicate checks, and conflict detection.
- [ ] Distinguish production from dispatch, financial from calendar year, and targets from actuals.
- [ ] Preserve domain-specific geological classifications instead of combining incompatible categories.
- [ ] Support documented revision precedence or explicit reviewer resolution.
- [ ] Preserve correction history and prevent unresolved critical conflicts from entering approved reports.
- [ ] Deliver a validation queue with source comparison and auditable reviewer actions.

Acceptance: conflicting figures are never silently selected or overwritten; reviewer decisions remain attributable.

### Part 4: Deterministic numerical queries and evidence-backed Q&A

Depends on Parts 1 and 3.

- [ ] Use controlled structured queries/calculation functions for numerical results and document retrieval for narrative evidence.
- [ ] Return inspectable source citations, formulas, units, scope, and reporting periods.
- [ ] Ask clarification for ambiguous questions and abstain when evidence is insufficient.
- [ ] Apply permissions before retrieval and across caches, citations, and source downloads.
- [ ] Treat uploaded text as untrusted evidence, not executable instructions; test document prompt-injection attempts.

Acceptance: test answers match verified facts, restricted evidence does not leak, and unsupported questions do not produce fabricated figures.

### Part 5: Reproducible reports, review, and export

Depends on Parts 3 and 4.

- [ ] Generate the MVP production-versus-target table, deterministic variance calculations, charts, and cited narrative.
- [ ] Generate a high-priority inquiry response draft from the same evidence-backed pipeline.
- [ ] Preserve the data/source snapshot, template version, and calculation outputs used for a report.
- [ ] Enforce authorized review and approval transitions server-side; draft exports must be visibly marked.
- [ ] Export DOCX/PDF with evidence references, warnings, and review status.
- [ ] Ensure post-approval edits create a new reviewable revision rather than silently changing an approved artifact.

Acceptance: an authorized reviewer can trace and reproduce report facts; an unapproved draft cannot masquerade as an approved release.

### Part 6: Topic identification and word clouds

Depends on Parts 1 and 2; can proceed alongside Parts 4 and 5 after shared contracts stabilize.

- [ ] Audit and improve existing topic modules rather than adding duplicate infrastructure.
- [ ] Remove boilerplate and stop words and normalize relevant domain terminology.
- [ ] Provide word clouds, topic grouping, period/subsidiary filters, and source-document drill-down.
- [ ] Apply the same permissions to aggregates and document retrieval.
- [ ] Handle empty/small corpora and explain that topic frequency is not operational risk.

Acceptance: users can navigate from a topic to its accessible evidence and understand how the visualization was produced.

### Part 7: Integrated verification, benchmarking, and adoption

Depends on Parts 2 through 6.

- [ ] Run end-to-end workflows including ingestion, correction, calculation, Q&A, approval, and export.
- [ ] Test conflicting revisions, missing years, mixed units, poor scans, access denial, provider failures, and unanswerable questions.
- [ ] Evaluate on held-out documents distinct from development fixtures; report sample sizes and limitations.
- [ ] Measure preparation time including corrections and review, not only LLM latency.
- [ ] Publish extraction accuracy by field, numerical correctness, citation correctness, supported-claim rate, and abstention behavior.
- [ ] Publish deployment/backup/recovery requirements, a pilot integration plan, reviewer guidance, and training instructions.
- [ ] Document scale/cost limits and remaining operational risks rather than declaring production readiness without evidence.

Acceptance: a repeatable demonstration and honest benchmark show which SIH outcomes were achieved and which remain incomplete.

## Measurement definitions

No performance percentages are claimed by this proposal. Thresholds must be agreed after the baseline and representative dataset are established.

- Time reduction (%) = (manual baseline time - assisted time) / manual baseline time * 100, for equivalent tasks and quality.
- Extraction accuracy: correctness against labeled values, entities, units, periods, and row/column associations; a correct number assigned to the wrong entity is incorrect.
- Automation (%) = eligible repetitive tasks completed without manual rework / total eligible repetitive tasks * 100; document the eligible task set and track approval effort separately.
- Report quality: numerical correctness, supported claims, citation correctness, completeness, and appropriate handling of missing/conflicting evidence.
- API test pass rate is not extraction accuracy or report factual accuracy.

## Feasibility and security

Retain the existing stack unless the audit establishes a specific limitation. Evaluate durable background processing, storage, provider quotas, and deployment constraints before choosing infrastructure. External AI use must follow the agreed data policy; do not assume confidential documents may be sent to third parties.

Use synthetic/publicly redistributable test records. Never commit credentials, operational documents, uploaded files, or sensitive test logs. Any discovered security vulnerability must be disclosed privately in accordance with CONTRIBUTING.md, not detailed in this public tracking issue.

## Fork contribution workflow

1. Discuss this tracking issue in the upstream repository and obtain agreement on scope.
2. Create focused upstream child issues with acceptance criteria.
3. Branch from current upstream main into feature/*, fix/*, docs/*, or test/* branches on the contributor fork.
4. Implement a small change with tests and relevant API/schema documentation.
5. Review staged files, commit using Conventional Commits, and push only the feature branch to the fork.
6. Open a pull request from the fork branch to upstream main, referencing the child issue and this tracker.
7. Address review; upstream maintainers control merging. Start subsequent independent work from updated upstream main; explicitly document any stacked PR dependency.

Do not directly push implementation work to upstream main or close the entire tracker from the first incremental PR.

## Decisions requested from maintainers

- Is the MVP scope and phased approach acceptable?
- Which report template and inquiry example should be authoritative for acceptance?
- Which safely usable sample documents and domain definitions are available?
- What subsidiary/document-sharing, classification, and approval policy should apply?
- What deployment, external-AI, language, retention, and scale constraints are required?
- Who reviews domain correctness and signs off each milestone?

## Tracker completion criteria

- [ ] All three required modules are demonstrated through integrated, source-backed workflows.
- [ ] Accepted child issues are merged or explicitly deferred with reasons.
- [ ] Correctness, authorization, failure handling, and provenance tests pass in the documented test environment.
- [ ] Benchmarks, known limitations, operating guidance, and rollout plan are published.
