# Three-role review access

Date: 18 September 2026

## Scope

Retain `user`, `reviewer`, and `admin`. Remove the duplicate `official` role;
institutional reviewers use `reviewer`, with department metadata where appropriate.
This increment does not introduce organization isolation or a separate final-approval stage.
The 16 September assessment remains a historical baseline, not a current permission matrix.

## Reconciliation permissions

- Owners can create and read reconciliations for their own documents.
- Reviewers can read and decide on their own or explicitly assigned documents.
- Assignment alone does not permit creating reconciliations or managing a foreign document.
- Unassigned reviewers and ordinary users cannot review foreign documents.
- Admins retain global access and exclusive control of document reviewer assignments.
- Only active reviewers can be assigned through the assignment endpoint.
- The reconciliation workspace allows reviewers/admins; the old admin URL redirects.
- Revocation removes delegated access on subsequent requests. This does not claim
  atomic revocation of a decision request already in flight.

These rules describe the document/reconciliation paths, not a completed authorization
audit of every legacy API. Username-based admin authority remains unchanged.

## Admin assignment workflow

Admins can open **Assign reviewers** on dashboard document cards. Each opening
fetches current assignments and the admin user list. Active reviewers can be
searched and selected, up to 100 per document. Unavailable or deleted assignees
remain visible as removal-only entries; they are never silently dropped.
Clear selection followed by Save explicitly removes all delegated reviewers.

The dialog confirms the document ID and returned assignment set before showing
success. Failed or malformed loads block saving. An unconfirmed save requires
a fresh reload because the server may already have applied the write. The UI
prevents duplicate submission while a request is pending; it does not retry writes.

Assignments still replace the entire list. Concurrent admins are not protected
by version checks: the last successful write wins. Admin role checks on the server
remain authoritative; hiding frontend controls is not an authorization boundary.

## Existing-account deployment gate

Removing a Mongoose enum value does **not** migrate stored MongoDB accounts.
Before deploying, an authorized operator must inventory accounts with `role: official`
in the intended environment without exporting credentials or private account data.
For each account, approve an explicit mapping to `reviewer` or `user` using the
existing admin role-update workflow and its audit logging. Do not auto-promote accounts.
Check account status and document assignments, verify no `official` accounts remain,
and require affected users to sign in again to refresh cached frontend role state.
Retain existing document IDs, assignment IDs, and historical decision/audit actors.

No production database inventory or migration has been performed by this change.
Legacy accounts are tested to receive no delegated reconciliation access or decision
authority while they still carry the removed role; this is not a global login ban.

## Regression coverage

- Integration: removed enum rejection, assigned-only reads, management denial,
  and removed-role decision rejection before database access.
- Isolated MongoDB/HTTP: assigned reads, create denial, revoked reads/decisions,
  legacy persisted-role denial, and unchanged review version/history after denial.
- Existing tests retain idempotent decision and stale-version coverage.
- Assignment HTTP tests cover admin-only writes, active-reviewer eligibility,
  strict string ObjectIds, case-insensitive deduplication, replacement/clearing,
  audit records, denied-write immutability, delegated reads and management denial.
- Client contract and mocked Chromium tests cover selection/search, removal,
  fresh reopening, failed loads, uncertain saves, duplicate submissions, stale
  responses, the selection limit, and keyboard/mobile behavior.

Tests use synthetic records in temporary MongoDB databases with teardown hooks.
Passing these tests does not establish real-report accuracy or production capacity.