# Testing and Verification

Run commands from the repository root. On Windows PowerShell use `npm.cmd` and `npx.cmd` in place of `npm` and `npx` if execution policy blocks their PowerShell wrappers.

## Repeatable Checks

Install the locked dependencies with `npm ci --prefix server --no-audit --no-fund` and `npm ci --prefix client --ignore-scripts --no-audit --no-fund`. Server parser tests require native canvas installation; disabling server lifecycle scripts requires a separate `npm rebuild canvas --prefix server` before those tests.

| Check | Command | Dependencies and scope |
| --- | --- | --- |
| Backend unit tests | `npm test --prefix server` | Isolated unit tests; no live database or AI credentials |
| Frontend unit tests | `npm test --prefix client` | Evidence presentation, reviewer assignments and request handling |
| Parser/model integration | `npm run test:integration --prefix server` | Installed parsers and Mongoose; no live database |
| Database persistence | `npm run test:persistence --prefix server` | Temporary MongoDB through mongodb-memory-server-core; first run may download MongoDB |
| Browser regression | `npm run test:browser --prefix client` | Install Chromium first with `npx playwright install chromium` from `client/` |
| Production frontend build | `npm run build --prefix client` | Vite compilation; does not prove backend or live AI availability |

The browser configuration starts its own Vite instance on port 4179. Keep this port free. Review the individual test fixtures before treating browser coverage as live end-to-end coverage. Build artifacts and browser results are ignored by Git.

The [CI workflow](../.github/workflows/unit-tests.yml) runs all jobs on Node 24: unit, parser integration and client build on Ubuntu; persistence and browser checks on Windows. Parser integration installs native canvas lifecycle dependencies and exercises real PPTX extraction and PDF-to-PNG pixels. Other jobs disable lifecycle scripts. Local test results and remote CI status are separate evidence.

## Live Verification Safety

### Durable Ingestion Verification

The durable-ingestion change passed 209 backend unit, 142 persistence/HTTP and 21 integration tests (372 backend checks) locally on Windows with Node 24.14.1. Frontend suites were not rerun for this backend-only change. These results supersede only the backend counts in the historical release run below, not its frontend/deployment evidence.

Run `node --test server/tests/persistence/processingQueue.test.js` for eleven focused tests on a disposable MongoDB 7.0.14 replica set: atomic extraction replacement, competing claims, expired-worker fencing, transactional rollback, preserved output on failure, bounded recovery/retry, worker execution, task timeout, actual v1/legacy multipart requests, real heartbeat renewal and takeover during processing. The crash test exits a claiming child process without releasing its lease, then advances the persisted lease expiry before recovery; it does not wait through the full two-minute lease interval. The heartbeat test observes the actual 40-second renewal through a change stream while a controlled parser remains pending, then checks that another worker cannot claim the job. Parser integration also exercises real CSV preparation with stubbed classification, missing-file failure, PPTX parsing and native PDF rendering.

Follow-up PDF reliability verification passed all 22 integration tests. It reproduced and fixed a PDF.js API/worker-version conflict when text extraction precedes OCR image rendering. Text extraction now runs in an isolated worker thread. Blank/scanned PDFs no longer count internal page markers as readable text and correctly request OCR. Regressions check native rendered pixels, parallel two-page digital extraction after renderer initialization, preserved page numbers and missing-file rejection. PDF.js emitted standard-font-data warnings on generated digital fixtures; the asserted text was preserved. This follow-up did not rerun the backend unit or persistence suites.

The subsequent task-deadline change passed 215 backend unit, 144 persistence/HTTP and 22 integration tests (381 backend checks). Six tests in `server/tests/processingTask.test.js` cover termination of a CPU-blocked JavaScript thread, progress acknowledgments, rejected progress, crashes, bounded timeout configuration and real CSV result transfer with stubbed classification. Queue regressions verify timeout failure preserves old pages and permits explicit retry, plus missing-file failure through the production thread entrypoint. No owner database or live AI credentials were used. Frontend suites were not rerun.

Final local verification of the heartbeat, OCR and route-loading changes passed 215 backend unit, 146 persistence/HTTP, 23 integration, 34 frontend unit and 65 release browser tests (483 total), with no failures or skips. Integration ran with `RUN_OCR_SMOKE=1`; normal runs skip the opt-in OCR test. It recognizes three expected English strings, including production/dispatch numbers, in both a clean PNG and an image-only PDF through the production processing thread, with classification stubbed. This exposed a raster-image canvas incompatibility: PDF OCR now uses an explicit native canvas factory for both PDF.js internal images and page output. Pages render sequentially. Initial English language-data download requires network access unless locally provisioned; the test uses a disposable cache.

The production frontend build passes without the previous 500 KB chunk warning. Route-based lazy loading reduced the entry JavaScript from 1557.35 KB (436.53 KB gzip) to 286.60 KB (93.52 KB gzip). Other chunks are deferred, not eliminated; these figures are not measured load latency or total application size. The explicit 65-test release browser suite passed with default snapshot checks and one worker; four unrelated preview draft tests are excluded. Production preview also loaded the landing and login routes, with no login horizontal overflow at 390 px and 1440 px.

PR #33 was confirmed merged, with all five GitHub Actions checks successful. Its Vercel status failed at an authorization URL. Those remote checks apply to the earlier PR commit, not these uncommitted local changes; the owner must resolve Vercel access and verify the actual deployment architecture.

Not established by these tests: representative OCR accuracy (including handwriting, Hindi and tables), heartbeat timing under long real OCR workloads, termination of stalled native code or remotely accepted provider work, multi-host clock skew, deployed shared storage recovery, enrichment recovery, or production throughput. Do not run the worker against a configured shared database merely to reproduce these tests. Rollout prerequisites and limitations are in [DEPLOYMENT.md](DEPLOYMENT.md).

The subsequent report/extraction integrity fixes passed all 147 persistence tests, bringing the verified batch total to 484 with the other suites above. The former mock credential no longer selects fabricated report quantities. Report sources preserve zero similarity and export missing/invalid scores as N/A. Extraction prepares and validates all pages before a transactional replacement of records and document status. Tests preserve approved records on second-page provider failure, empty output and failure after the first transactional insert, then verify successful replacement and zero confidence. Concurrent re-extraction/review coordination is not established by these tests.

### Local Verification: 2026-09-18

On Windows with Node 24.14.1, the release-scope regression run passed 209 backend unit, 136 persistence/HTTP, 20 integration, 34 frontend unit and 65 browser tests (464 total). Four unrelated workspace-preview draft tests are excluded from release scope. A parallel browser run encountered one Chromium transport JSON error; the affected 16-test evidence slice and the complete 65-test release suite subsequently passed with one worker. The production client build passed with the existing large-bundle warning. Server and client npm audits reported zero known advisories. These are local results, not remote CI or deployed acceptance evidence.

The persistence suite exercises scoped report generation with real Mongo/RAG and stubbed AI, Markdown metric labels, current reviewer permission revocation, authentication failures, sequential topic reanalysis and a 40-request concurrent topic-read burst. The final burst recorded p95 150 ms; earlier runs varied up to 371 ms. This tiny ephemeral corpus does not establish production capacity, OCR throughput or provider latency.

Run `node scripts/evaluate-public-document.cjs` for a network-dependent parser smoke check against the official Ministry of Coal PDF linked from its public listing. The script pins SHA-256 `c21a65df57bfca30d3bfd460877a277e9df7fd4ff4f549af941726312d7e3ed4` and checks Urtan, Dhirauli and Madhya Pradesh against the listing title, not parser-generated ground truth. The recorded run processed 131535 bytes and two pages in 69 ms, preserving all three strings. Hindi extraction, scanned OCR, numerical field accuracy, generated reports and representative-corpus accuracy are not evaluated. Source changes fail the hash check and require deliberate fixture review.

The [scratch directory](../scratch/) contains manual diagnostics and live verification scripts. They are not the default isolated test suite. Read each script before execution: some create accounts, upload documents, change review states, call paid AI services, or write to a configured database.

- Use an explicitly approved disposable test database and dedicated test accounts.
- Check the script's actual URL, credential source, write operations and cleanup behavior. Do not assume all scripts read the same environment variables.
- Never run against production or a shared SIH demonstration database by default.
- `node scratch/run_full_api_verification.js` writes a local API test report that is ignored by Git. That report describes one execution, not current project readiness.
- Record the commit, date, environment, commands, outcomes and untested areas when collecting evaluation evidence. Do not commit credentials, tokens or private documents.

## SIH Demonstration Acceptance

Use authorized, non-sensitive mining documents and record expected values before the demonstration.

1. Upload a supported document and confirm processing completion or an actionable failure.
2. Compare extracted values with their original page or spreadsheet evidence; distinguish missing values from zero.
3. Exercise user, assigned reviewer and admin access, including denied operations.
4. Review a discrepancy, verify persistence after reload, and exercise a stale-decision conflict with explicit reload.
5. Ask a document-grounded question and inspect its cited evidence; record unsupported answers as failures.
6. Generate, submit and review a report, then inspect the exported result manually.

Isolated tests do not establish real-corpus OCR accuracy, AI answer quality, complete export correctness, load capacity, regulatory compliance or production security. Validate these separately before making SIH presentation claims. Use the [PS 26023 mapping and benefit measurement protocol](REQUIREMENTS.md) to evaluate all three requested outputs and quantify results against the supplied statement.