# Increment 12: bounded review requests and uncertain-outcome recovery

Follows merged PR #12. Adds a shared 30-second client deadline to record reads, both record-update signatures, approve/reject, and bulk approve in extractionApi. Long-running extraction/reprocess endpoints are intentionally unchanged and need a job-based lifecycle rather than this short review deadline.

## Semantics

The wrapper races a request against a timer, passes an AbortSignal to Axios, clears timers after settlement, and rejects with REVIEW_TIMEOUT on deadline. The abort stops the client transport where supported; it does not cancel or roll back a server write. A late request completion cannot resolve the already rejected client promise. No mutation is automatically retried.

Existing error/finally paths now release pending review/editor controls after a deadline and preserve draft or selection as before. Approval recovery uses the existing read-only Reload records action.

After an unsuccessful save, the editor also offers Check current server record. This fetches the document's current records, finds the same record ID, and displays a value/unit/status snapshot without replacing the draft or sending a write. The snapshot explicitly warns that an earlier request could still complete later. Reads have the same deadline, so a stalled verification request releases its controls as well. Manual retry remains available; this contribution does not guarantee exactly-once writes.

## Verification

Local results: 19 client unit tests (4 new), 14 Chromium browser tests (2 new), and production build passed. Unit tests cover default duration, success cleanup, unchanged errors, abort, no retry, and late-result isolation. Browser tests use Playwright's virtual clock with actual production deadline code and intercepted stalled requests; they verify save/approval controls recover and read-only checks do not repeat mutations.

No dependency, backend endpoint, or database schema changes. Existing client CI automatically includes these tests. The production build retains the existing large-chunk warning; remote CI is not claimed as verified.

## Limits

Browser timers can be delayed in suspended/background tabs; the deadline is not a real-time service guarantee. Network abort is not server cancellation. A snapshot cannot resolve an in-flight write's final outcome. Real database persistence, request IDs/idempotency keys, concurrent-edit protection, provider extraction timeouts, and cross-browser/accessibility audits remain separate work. Document-list loading and unrelated API modules are not given deadlines by this contribution.
