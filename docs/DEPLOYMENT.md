# Deployment and Security

## Current Hosting Configuration

[vercel.json](../vercel.json) builds the Express entry point with `@vercel/node` and the client with `@vercel/static-build`. API requests route to the backend and the frontend uses SPA routing. This describes repository configuration, not the health or authorization status of a live deployment.

Set server secrets in the hosting platform's environment configuration. Set `VITE_API_URL` at client build time only when the API is on another origin; the default `/api/v1` suits a same-origin deployment. Never expose server secrets through `VITE_*` variables.

For a conventional Node host, install locked server dependencies, run `npm start --prefix server`, build the client with `npm run build --prefix client`, and serve `client/dist` with SPA fallback through a web server. Proxy `/api` to the backend and configure TLS. Vite's development server is not a production server.

## Storage and Processing

Set `UPLOAD_DIR` to an absolute path on a provisioned persistent volume. Without it, local uploads reside under `server/uploads`; when `VERCEL` is set, upload paths use `/tmp/uploads`. Temporary function storage is not durable or shared across instances. MongoDB records can outlive their source files. A fresh-process file-recovery regression validates directory configuration, not hosting durability or backup restoration.

Use authenticated `/api/v1/documents/:id/download` for source downloads. Unauthenticated `/uploads` static serving has been removed. Even authenticated download cannot recover a file lost from temporary storage.

Uploads now commit document metadata and a queued job in one MongoDB transaction. Run `npm run worker --prefix server` as a separately supervised, long-running Node process; the web server only enqueues work. Both processes must use the same MongoDB database and persistent source-file storage. MongoDB must support transactions (replica set or Atlas/sharded cluster); standalone MongoDB uploads are no longer supported.

The worker claims one document at a time using an atomic lease, renews a two-minute lease every 40 seconds, and recovers expired claims on subsequent polls. Three claims are allowed before an exhausted job becomes failed; normal parser/provider failures become failed immediately and require explicit retry. Active jobs reject reprocessing with 409. Job state, document state and replacement pages publish in a fenced transaction, so expired workers cannot overwrite newer results. Previous pages survive failed reprocessing. Keep worker clocks synchronized; leases use host time. SIGINT/SIGTERM stops new claims and drains current work; forced termination leaves the lease to expire.

Parsing, OCR and classification execute in a terminable worker thread with a default 15-minute deadline. Set `PROCESSING_TIMEOUT_MS` to an integer from 1000 to 3600000; invalid values reject worker startup. The parent retains database connections, progress writes and fenced publication. On timeout it waits for thread termination, marks the job failed and preserves previous output; explicit retry is required. This deadline does not cover the initial database lookup, publication or best-effort enrichment. Keep a process supervisor: native-code stalls, database outages and external provider work already accepted remotely are not guaranteed to be cancelled by thread termination. Tune the deadline using representative documents; the default is an operational bound, not a measured OCR SLA.

PDF OCR requires the installed native `canvas` dependency and uses an explicit PDF.js canvas factory, rendering one page at a time. OCR uses English language data. For offline provisioning, set `OCR_LANG_PATH` to a directory containing `eng.traineddata.gz`; set `OCR_CACHE_PATH` to an existing writable cache directory. Without local language data, the initial Tesseract download requires outbound network access. Verify native canvas installation and language-data access on the target host. The clean English PNG/scanned-PDF smoke test does not establish multilingual or representative mining-document accuracy.

Before rollout, stop/drain older ingestion processes, back up the database, and review existing processing jobs. Startup creates a named unique document-job index and fails on duplicates; it does not remove or merge legacy records. Resolve duplicates through a separately reviewed migration. Legacy processing jobs without lease metadata can be reclaimed only after old workers are stopped. Verify both web and worker releases together before accepting uploads. Do not automatically run destructive index synchronization.

Provision and validate persistent storage, lifecycle/retention policies and file recovery. Multi-instance deployments need shared storage or an object-storage integration. The worker rejects a Vercel function environment; the current `/tmp/uploads` Vercel fallback cannot feed a separate durable worker. Move ingestion to a persistent host/shared volume or implement shared object storage before deploying this workflow there. Entity/topic enrichment after ingestion remains best-effort, is not lease-fenced, and is not restart-recovered; concurrent reanalysis still requires coordination. Embedding/report jobs are also outside this queue. Local recovery tests do not establish deployed storage durability or production throughput.

Structured extraction also requires transactions: it prepares all pages before replacing records and document status atomically. Failed or empty extraction preserves previous records. Successful re-extraction still replaces prior review records; coordinate it with reviewers and concurrent reanalysis. This transaction is not a durable extraction queue or a version guard against concurrent review.

## Security Gates Before Public Use

1. Set a strong private `JWT_SECRET` and unique administrator credentials. Startup rejects missing, blank and known fallback secrets; token verification is restricted to HS256. Secret entropy and rotation remain operator responsibilities.
2. Configure [CORS](../server/config/cors.js) through `CLIENT_URL`. Production excludes development localhost defaults and denies unknown browser origins; originless clients remain allowed. CORS is not authentication.
3. Audit both v1 and legacy routes for authorization and access to uploaded documents. UI visibility is not access control.
4. Review browser token storage, upload validation, dependency advisories, rate limits and logging of sensitive content.
5. Grant the database account only necessary privileges. Define backups, retention and restore procedures for both MongoDB and source files; verify restoration in a separate environment.
6. Confirm permission to send mining-document contents to the configured external AI provider. Use non-sensitive authorized samples for SIH demonstrations.

These are known release gates, not claims that the implementation already meets them. Do not treat this guide as a completed security audit.

The dependency remediation run reports zero known npm audit advisories for server and client. Node 24 is required. Office parser 8 uses the AST extraction API; SheetJS 0.20.3 comes from its official CDN tarball because the npm registry release is stale. Lockfile integrity pins the downloaded artifact. A scoped `pdf-img-convert` override selects canvas 3.2.3 or newer instead of its vulnerable legacy install chain. Real PPTX parsing and PDF-to-PNG pixel tests cover these compatibility changes; native canvas must install on the target host. Audit results are time-sensitive and are not a security certification.

Topic reanalysis replaces per-document contributions and removes stale document links. Legacy topic aggregates cannot recover historical per-document weights: reanalyze contributing documents before relying on rebuilt trends. Multi-topic writes are not transactional, and concurrent initial topic creation can still duplicate names. Optimistic concurrency does not make the whole analysis atomic.

## Release Checklist

- Record the commit and target environment; verify intended changes and dependency lockfiles.
- Run applicable checks in [TESTING.md](TESTING.md) and inspect CI for that commit.
- Verify environment variables privately using [SETUP.md](SETUP.md); do not log secrets.
- Check `/api/v1/health` for database readiness, then independently check AI, upload/download and export flows.
- Exercise user, assigned reviewer and admin access with dedicated accounts in an approved environment.
- Test report conflicts and failure recovery. Deploy all report writers together so version checks are consistent.
- Validate document persistence across restarts or function invocations before promising durable storage.
- Preserve the previous deployable commit and coordinate rollback with any database changes. Code rollback does not undo data writes; avoid unreviewed destructive database fixes.