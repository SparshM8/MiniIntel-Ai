# Existing UI: Dashboard and Command Center improvement pass

Target: feature PR into upstream **main**, not DEV. Retain existing application, sidebar, theme and routes. The abandoned standalone workspace design is not part of this implementation.

## Changes
- Dashboard counts explicitly cover current returned/filtered documents.
- Remove invented growth/success rates, Mine Alpha anomaly and data-integrity claims.
- Clear guidance to upload and review; processed does not mean approved.
- Loading/unavailable/empty states separated; reload after failed document reads.
- Latest document request wins; malformed list payloads are errors, not empty successes.
- Accessible filter names and less cramped layout.
- Command Center reads the actual nested overview contract, preserves zero and rejects invalid counts.
- Replace misleading validation-score card with failed-document count. Backend score calculation is unchanged and still requires separate audit.
- Task response no longer defaults to completed successfully; duplicate submissions blocked. HTTP success is not approval or verified completion.

## Validation
Windows Node 20 and 24: 25 client unit tests and 26 browser tests (Dashboard, Command Center, existing evidence-review suite) pass. Production build passed under Node 20. Existing large-bundle warning remains. No server implementation changed; this pass does not establish live authorization, AI accuracy or complete accessibility.

Browser screenshots are captured to ignored client/test-results. These are not approved visual baselines. Tests use synthetic API fixtures and block external requests.

## Local team review
`client/scripts/dashboard-review.mjs` launches the actual app in isolated headed Chromium with synthetic API interception and an explicit banner. Both Dashboard and Command Center open. No alternate UI entry, production auth bypass, backend or database is used. Writes are blocked, so upload/task execution cannot succeed in this review context. Interception is browser-context local: ordinary tabs are not protected by the harness.

Close that browser to stop its Vite server, or stop the printed Node PID. No automatic commit/push is part of the review harness.

## Remaining boundaries
Server validation/confidence floors and other pages' unsupported claims need separate fixes. Task deadlines/structured status and a full access audit remain outside this UI pass. Review changes before integrating. Presentation documents and abandoned preview files are separate uncommitted work and must not be accidentally included in the main-targeted PR.
