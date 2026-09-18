# Coal Reporting: Industry Guide and SIH Submission

Research reviewed on 2026-09-18. Public sources inform this guide; it is not a confirmed internal CIL operating procedure. Obtain stakeholder approval before operational use. Implementation status is tracked in [requirements](REQUIREMENTS.md).

## The Industry in Plain Language

The Ministry of Coal sets policy and oversees coal/lignite development through organizations including CIL and its subsidiaries. CMPDI provides technical services: exploration, mine planning, coal quality assessment, environmental work, geomatics and information systems. A useful reporting platform therefore cannot be limited to production totals.

| Work area | Examples of evidence | What a reporting assistant must preserve |
| --- | --- | --- |
| Exploration and geology | Borehole logs, seam descriptions, drilling summaries, laboratory findings | Location, depth interval, seam, unit, geological classification, study date and source page |
| Mining operations | Production, dispatch, targets, stock, overburden movement | Mine/subsidiary, time period, unit, actual versus target, source revision |
| Coal quality | Sampling and laboratory reports | Grade, sampling basis, units and test date; do not equate unlike quality measurements |
| Environment | Monitoring reports, EIA/EMP, reclamation studies | Parameter, site, date, units and the cited applicable limit; do not invent compliance decisions |
| Administrative inquiries | Part-wise questions, approved tables, historical reports | Question wording, reporting cutoff, source citations, reviewer approval and unresolved conflicts |

Production means coal extracted; dispatch means coal sent out. A difference between them is not automatically a loss or misconduct: stock movement, timing and reporting boundaries may explain it. A financial-year total and a monthly figure cannot be compared as equivalent periods. A geological resource estimate is not automatically an economically recoverable reserve. These distinctions require domain review, not just fluent AI text.

Proposed pilot workflow, to validate with subsidiary users:

```mermaid
flowchart LR
  Request[Inquiry and reporting cutoff] --> Sources[Authorized documents]
  Sources --> Extract[OCR and structured extraction]
  Extract --> Check[Units periods duplicates and conflicts]
  Check --> Review[Reviewer resolves evidence]
  Review --> Draft[Cited report or part-wise answer]
  Draft --> Approve[Authorized approval]
  Approve --> Deliver[Export and retain source revision]
```

## Product Decisions

- Preserve original evidence. Every important number needs document, page/sheet/cell, reporting period and unit; an OCR guess must remain reviewable.
- Separate discovery from decisions. Word frequency helps navigation; AI topics help exploration; neither proves correctness or operational risk.
- Keep a human approval gate for official responses. An answer should state unavailable evidence rather than infer missing official figures.
- Do not combine revised and superseded figures silently. Retain the source revision and explicitly choose the accepted record.
- Treat uploaded text as untrusted evidence, never as instructions to the model or authorization to access other documents.
- Integrate with existing workflows rather than claim to replace them. CMPDI publicly lists mine data management and NIC eOffice services; this does not establish an accessible API or integration permission.
- Validate English/Hindi and scan quality separately. Unicode token support is not proof of bilingual OCR or topic-model quality.

## Demonstration and Pilot

Use synthetic fixtures for repeatable software checks and authorized real documents for quality claims. Keep them clearly labeled and separate. Proposed first pilot: one reporting team, a limited document collection, one periodic report and one high-priority inquiry format. Domain owners must set targets.

| Demonstration | Expected behavior |
| --- | --- |
| Spreadsheet containing zero and missing values | Zero remains zero; missing does not become zero |
| Monthly production against an annual target | Incompatible periods flagged, not a misleading variance |
| Two reports with conflicting production figures | Show both sources and require review |
| Scanned geological page | Compare extraction with source, retaining units and depth context |
| Environmental question with no cited limit | Report available evidence; do not invent compliance |
| Parliamentary-style question with parts (a), (b), (c) | Answer each part with citations or explicit unavailable evidence |
| Empty corpus or provider failure | No invented topics, completed reports or success percentages |
| Revoked reviewer assignment | No further topic/word access to the revoked document |

Training should cover upload, correction, source checking, report review, approval and error recovery. Record operator task-completion time and correction burden. Conduct a feedback session after the pilot and rerun held-out evaluation after model/parser changes.

## Benchmark Calculator

Run from the project root: `node scripts/evaluate-benchmark.cjs <measurements.json>`.

Input structure below is **synthetic arithmetic illustration only**, not a project result:

```json
{
  "time": { "manualSeconds": 100, "assistedSeconds": 40 },
  "extraction": { "correct": 8, "required": 10 },
  "reportFacts": { "supportedCorrect": 3, "checkable": 4 },
  "reportCompleteness": { "includedRequired": 4, "required": 8 },
  "automation": { "automated": 6, "eligible": 10 }
}
```

The calculator rejects invalid counts, retains negative time savings, omits unmeasured metrics and returns `null` for a zero denominator. It calculates submitted measurements, not their validity. Collect reference answers independently, include failed runs, retain source manifests/model/commit details and follow the [measurement protocol](REQUIREMENTS.md#benefit-measurement-protocol).

## Submission Template

The editable PPTX and a reliably inspectable complete image set are not available in this workspace review. The six-slide structure below is a proposed content draft, not a verified transcription of the supplied template or official submission rules. Confirm exact headings, required pointers, slide limit, export format and whether an instructions slide must be removed against the original template before submission.

Preserve the official headings, logos, layout and required fields when transferring content. Do not submit this Markdown guide as the final artifact. Team details and the original template are needed to finalize the deck.

### 1. Title: Provisional Content

- MineIntel AI
- Evidence-linked geological and mining reporting
- SIH26023 | Ministry of Coal / Coal India Limited
- Team name and ID: pending team-provided details

### 2. Solution: Provisional Content

- Problem: scattered scans, spreadsheets and archives slow reliable reporting.
- Approach: extract evidence, resolve inconsistencies, draft cited answers and reports.
- Three outputs: reviewed reports, word cloud/topic discovery, AI query-response.
- Differentiator to demonstrate: field-level evidence and human review, not unsupported chatbot answers.
- Visual: original source beside extracted field and review decision. Use real prototype screenshots, clearly labeling synthetic examples.

### 3. Technical Approach

- Technologies: React/Vite interface, Node.js/Express API, MongoDB, document parsers/OCR, configurable LLM service.
- Process diagram: Upload -> Extract -> Validate -> Review -> Report / Topics / Q&A -> Approve.
- Word cloud: deterministic text frequencies; topics: AI-assisted discovery.
- Verification: isolated tests, parser/model integration, temporary-database authorization tests and desktop/mobile browser tests.
- Hardware: browser client and server environment; GPU needs depend on the eventual model hosting choice, not a current prerequisite claim.

### 4. Feasibility and Viability

- Prototype: ingestion/review/report workflows plus an interactive word cloud.
- Risks: poor scans, inconsistent units/periods, unsupported AI claims, access leakage, API cost and storage durability.
- Mitigations: source-linked review, explicit missing-evidence states, authorization tests, bounded AI use and durable storage before rollout.
- Adoption: scoped subsidiary pilot -> training -> feedback -> measured expansion.
- Cost case: measure OCR/AI cost per accepted report and reviewer time; no unsupported cost-saving estimate.

### 5. Impact and Benefits

- Users: geological/mining teams, reviewers and administrative officers.
- Expected benefit: less repetitive compilation and faster evidence retrieval.
- Governance: traceable figures and explicit review accountability.
- Measurement: time reduction %, extraction accuracy %, factual accuracy/completeness %, automation %.
- Status: benefit percentages await representative-domain evaluation; do not insert invented values.
- Environmental benefit is indirect: better access to monitoring evidence, not a demonstrated emissions reduction.

### 6. Research and References

- [Official SIH statement listing](https://sih.gov.in/sih2026PS), search SIH26023: identity and required outcomes.
- [Ministry of Coal](https://coal.nic.in/): ministry responsibilities and existing National Coal Portal link.
- [CMPDI services](https://www.cmpdi.co.in/en/services): mining, environmental, ICT and geomatics scope.
- [CMPDI exploration services offered](https://www.cmpdi.co.in/en/node/5648): drilling, hydrogeology, reserve assessment, coal quality and geological modeling.
- [Project verification protocol](REQUIREMENTS.md): internal evaluation design, not independent research validation.

Research caveat: public CMPDI overview and exploration introduction pages contain different historical cumulative figures. No such totals are used in the pitch. Access to the coal inventory page was blocked during research, and attempted Ministry annual-report/statistics URLs returned 404; no claims rely on them.

## Release Gates Still Open

The frequency cloud and topic-list permissions are tested. Topic analysis checks document access; global topic analytics are restricted to administrators. AI discovery now segments up to 96,000 characters and rejects larger documents instead of silently truncating; segment failure does not yield a successful partial discovery response. This does not certify AI grounding, geological schema coverage, OCR quality, topic quality, production security, durable storage, load capacity or CIL integration. Those require further engineering and representative stakeholder evaluation before calling the solution operationally ready.

The current word-cloud endpoint reads accessible extracted texts per request. It is suitable for testing a limited pilot, not evidence of archive-scale performance; incremental persisted frequencies and load tests are follow-up work. AI discovery persistence is not transactional, and repeated analysis can affect legacy trend counters. Do not present those counters as validated longitudinal statistics.