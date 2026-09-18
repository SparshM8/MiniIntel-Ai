# Deployment and Security

## Current Hosting Configuration

[vercel.json](../vercel.json) builds the Express entry point with `@vercel/node` and the client with `@vercel/static-build`. API requests route to the backend and the frontend uses SPA routing. This describes repository configuration, not the health or authorization status of a live deployment.

Set server secrets in the hosting platform's environment configuration. Set `VITE_API_URL` at client build time only when the API is on another origin; the default `/api/v1` suits a same-origin deployment. Never expose server secrets through `VITE_*` variables.

For a conventional Node host, install locked server dependencies, run `npm start --prefix server`, build the client with `npm run build --prefix client`, and serve `client/dist` with SPA fallback through a web server. Proxy `/api` to the backend and configure TLS. Vite's development server is not a production server.

## Storage and Processing

Set `UPLOAD_DIR` to an absolute path on a provisioned persistent volume. Without it, local uploads reside under `server/uploads`; when `VERCEL` is set, upload paths use `/tmp/uploads`. Temporary function storage is not durable or shared across instances. MongoDB records can outlive their source files. A fresh-process file-recovery regression validates directory configuration, not hosting durability or backup restoration.

Use authenticated `/api/v1/documents/:id/download` for source downloads. Unauthenticated `/uploads` static serving has been removed. Even authenticated download cannot recover a file lost from temporary storage.

Before a durable deployment, provision and validate persistent storage, lifecycle/retention policies and file recovery. Multi-instance deployments need shared storage or an object-storage integration. Processing remains fire-and-forget without durable worker leases or restart recovery. Evaluate OCR, embedding and report-generation duration against hosting execution limits; deploying Express as a function does not establish resilient background processing.

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