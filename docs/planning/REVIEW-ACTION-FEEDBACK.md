# Increment 11: review action feedback

Follows merged PR #11. Improves approve, reject, and bulk-approve interactions without changing their server contracts.

## Behavior

A synchronous page-level guard permits only one review mutation at a time. Pending feedback is shown while row actions, selection controls, document switching, and extraction are disabled. A failed request shows an alert stating the action was not confirmed; it does not imply the server made no changes. Bulk selection is retained after failure.

After mutation success, the client fetches authoritative records rather than assigning approved/rejected statuses locally. A refresh failure is reported separately from a mutation failure, preserving the previous records with an explicit stale-status warning. Reload records performs only a read, not another mutation. Successful bulk completion and refresh clear the selection; disappeared record IDs are pruned when records change. Scope checks prevent outdated completions from overwriting a newer view.

No automatic retry is introduced. Reviewers are instructed to check current state before retrying uncertain requests. Read-only evidence remains available while a review action is pending.

## Verification

Local Windows/Chromium results: 12 browser tests passed (5 new), 15 client presentation tests passed, production build passed with the existing large-bundle warning. New tests cover approve/reject failures, retained bulk selection, disabled pending controls, refresh failure followed by read-only recovery, and authoritative bulk success. Existing browser CI discovers the new tests automatically. No dependencies or API contracts changed.

## Limits

Synthetic intercepted APIs do not establish real persistence, partial bulk-write guarantees, authorization, concurrency control, or server-side idempotency. Requests still have no dedicated timeout/cancel recovery; a stalled request can keep the pending controls locked until navigation/reload. Reloading records explicitly resets table selection because the loading view remounts the table. A broader pending-request recovery policy should be designed with server-side request identity before automatic mutation retries are considered.
