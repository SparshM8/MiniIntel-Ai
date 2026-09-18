# SIH 26023 Requirements and Verification

## Statement and Provenance

| Field | Statement supplied by the project owner |
| --- | --- |
| ID | 26023 (SIH26023) |
| Title | AI-Powered Geological, Mining and other Reporting Solution for CMPDI/CIL subsidiaries |
| Organization / Department | Ministry of Coal / Coal India Limited |
| Category / Theme | Software / Smart Automation |
| Source | [SIH 2026 problem statements](https://sih.gov.in/sih2026PS), plus full statement text supplied by the project owner |

The statement requires AI-assisted processing of scanned PDFs, digital documents, spreadsheets, images and historical archives for geological/mining reporting, including parliamentary and high-priority administrative inquiries. Its objectives include validation, consistency, traceability and a scalable foundation for subsidiary workflows.

The three explicit outputs are automated report generation, automated word cloud and topic identification, and AI-based query/response. Expected benefits include measured percentages for preparation-time reduction, extraction/report accuracy and automation of repetitive workflows. No fixed numeric target or dataset URL was included in the supplied text.

Source review date: 2026-09-18. Searching the official listing for `26023` confirmed SIH26023, the exact title, Ministry of Coal, Software and Smart Automation. The detailed description and Coal India Limited department are based on the full statement supplied by the project owner; those details were not independently exposed by the inspected listing. Code inspection is not live acceptance testing.

## Implementation Mapping

Status meanings: **Present** means an implementation path was inspected; **Partial** means relevant implementation exists but does not establish the full outcome; **Unverified** means acceptance evidence has not been collected. None means production certification.

| Requirement | Evidence | Assessment and remaining check |
| --- | --- | --- |
| Multi-format digitization and preprocessing | [processingService](../server/services/processingService.js) handles PDF/OCR, images, DOCX, XLSX, CSV and PPTX, saving pages and processing status | Present; benchmark scans, tables and historical documents from an authorized representative corpus |
| Automated report generation | [reportService](../server/services/reportService.js), [ReportGenerator](../client/src/pages/ReportGenerator.jsx), [report persistence tests](../server/tests/persistence/reportRevisions.test.js) | Present; verify factual accuracy, required templates, exports and end-to-end completion time with domain reviewers |
| Automated topic identification | [discoverTopics](../server/services/intelligenceService.js), [segmented discovery](../server/services/topicDiscovery.js) and [tests](../server/tests/topicDiscovery.test.js) | Supported text is processed in 12,000-character segments up to 96,000 characters; larger inputs fail explicitly. Mocked-provider tests cover late text and failures, not real topic quality |
| Automated word cloud | [Frequency builder](../server/utils/topicOverview.js), [TopicsExplorer](../client/src/pages/TopicsExplorer.jsx), [browser tests](../client/tests/browser/topics.spec.js) | Implemented with accessible-document counts, full extracted-text frequencies, search/table views and empty/error recovery; corpus-scale performance and linguistic quality remain unverified |
| AI query and response | [aiAssistantService](../server/services/aiAssistantService.js), [AIAssistant](../client/src/pages/AIAssistant.jsx) | Present; test cited answers, numeric questions, unanswerable questions and parliamentary-style requests against expert references |
| Validation, consistency and traceability | [reconciliationService](../server/services/reconciliationService.js), [reconciliation tests](../server/tests/reconciliationService.test.js), [evidence tests](../client/tests/evidencePresentation.test.js) | Partial; regression coverage is not proof of corpus-wide correctness or immutable historical traceability |
| Geological and historical coverage | General document processing and mining-oriented prompts | Unverified on geological reports and archives; production examples alone do not establish this domain coverage |
| Subsidiary workflow integration | Review/approval workflows and API contract exist | Partial; no actual CIL system integration or stakeholder acceptance was verified in this review |
| Scalability and long-term adoption | [Deployment limitations](DEPLOYMENT.md) and [testing guide](TESTING.md) | Unverified under representative load; temporary file storage, durable processing and operational security remain release gates |
| Training and continuous enhancement | Setup, architecture and testing guides now exist | Partial; operator training, stakeholder feedback and a demonstrated improvement cycle remain necessary |

## Concrete Evidence Gaps

- Topics Explorer now uses actual accessible-document counts; synthetic taxonomy and fabricated relevance percentages were removed from the list endpoint. Owner/reviewer/admin scoping and revocation are covered by [HTTP persistence tests](../server/tests/persistence/topicsHttp.test.js). This does not certify every endpoint in the topics module.
- Report `confidenceScore` is a compatibility field containing mean valid retrieval similarity or null, without an artificial minimum. `metricBasis: retrieval-similarity-v1` identifies the revised semantics; legacy scores are not displayed as current metrics. It is not measured report accuracy.
- Report `evidenceCoverage` counts retrieved chunks above a similarity threshold. It does not verify that generated claims actually cite and agree with those chunks.
- A prompt requiring grounded numbers does not guarantee grounded output. Compare report facts and citations with independent references.
- Mock AI paths produce synthetic output and cannot substantiate SIH benefit percentages.
- One official public-PDF parser smoke check preserved three independently listed English names. It is not a representative corpus benefit benchmark, Hindi/OCR test or AI accuracy evaluation. No accuracy, time-saving, automation or readiness percentage is claimed.

## Benefit Measurement Protocol

This is a proposed evaluation protocol, not an additional official SIH scoring rule. Agree targets with domain stakeholders before evaluating.

Use authorized samples stratified by file format, scan quality, subsidiary, historical/current period and geological/production content. Keep a held-out evaluation set. Have domain reviewers establish reference fields, expected report facts and reference answers independently of the model. Record sample counts, exclusions and failed cases.

| Metric | Calculation and acceptance evidence |
| --- | --- |
| Report preparation time reduction (%) | `100 * (manual_time - assisted_time) / manual_time`; baseline must be positive. Use matched tasks and the same final quality standard; include upload, corrections, review and export in assisted time |
| Structured extraction accuracy (%) | `100 * correct_required_fields / all_required_reference_fields`; missing fields count as incorrect. Define tolerances for value, unit, period, mine and source location before testing; also report unsupported extra fields |
| Report factual accuracy (%) | `100 * supported_correct_claims / all_checkable_generated_claims`; independently review numeric and narrative facts and citations. Report required-fact completeness separately so omission cannot inflate accuracy |
| Workflow automation (%) | `100 * successfully_automated_eligible_steps / all_predefined_eligible_steps`; define the repetitive steps in advance. Failed steps and manual repairs are not automated successes; report mandatory human approval separately |
| Inquiry response time and quality | Record end-to-end median and p95 latency, answer correctness, citation correctness and appropriate refusal on unanswerable questions |

An empty denominator is not 100% success; mark it not applicable and explain why. Preserve numerators/denominators, failure counts, commit, model/provider, environment, dataset manifest and reviewer decisions. Present results by document category as well as overall; do not substitute test pass rates or model confidence for domain accuracy.

## Phased Acceptance

| Phase requested by statement | Completion evidence to collect |
| --- | --- |
| Requirement analysis | Confirm full description and stakeholder acceptance of this mapping, report templates, inquiry examples and agreed targets |
| Digitization/preprocessing | Authorized corpus inventory, field references, parser/OCR results and failed-document handling |
| Platform development | Demonstrate all three outputs, including a real word cloud and evidence-linked reports/answers |
| System testing | Repeatable regression results plus held-out accuracy, timing and automation measurements |
| Workflow integration | Approved pilot with subsidiary users, role checks, handoff/approval and required export/integration formats |
| Training | Role-specific walkthrough, training materials and observed user task completion |
| Continuous enhancement | Feedback ownership, monitored failures, regression evaluation after changes and restoration/load evidence |

Word cloud, truthful topic statistics, bounded segmented topic/entity discovery and topic-endpoint access restrictions are implemented. Sequential topic reanalysis, stale-link removal and zero weights have regression coverage; legacy contribution migration and concurrent writes remain limitations. A tested [benchmark calculator](../scripts/evaluate-benchmark.cjs) calculates supplied measurements; representative corpus evaluation remains pending. Next priorities are evidence-grounding evaluation, resumable processing of oversized documents, broader endpoint authorization review and durable deployment. See [testing](TESTING.md) for collected evidence and its limits, and the [industry guide](INDUSTRY-AND-SUBMISSION.md) for research and demo scenarios.