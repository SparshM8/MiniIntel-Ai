# Reconciliation persistence and audit boundary

## Purpose

Phase 3 stores deterministic reconciliation evidence and reviewer decisions without changing source facts. The persistence service is the only supported write boundary; callers provide a case and authenticated actor, never a trusted engine result or actor ID.

## Immutable record

Each record preserves the document ID, case and contract version, engine version, outcome, reason code, complete case snapshot, normalized operands, creator, creation time, and a canonical SHA-256 payload hash. A unique document/case/hash index makes identical retries idempotent while allowing changed evidence to create a new record.

The service recomputes reconciliation output server-side. Invalid evidence contracts are rejected before persistence. Source facts and prior reconciliation records are never updated when evidence changes.

## Authorization

- An authenticated actor is mandatory.
- Owners may read/create reconciliations for their documents. Reviewers may additionally read and decide on explicitly assigned documents; assignment does not grant creation rights.
- Admins may operate across document owners.
- Reviewer decisions require the `reviewer` or `admin` role.
- Actor identity is derived from authenticated context, not request data.

## Append-only decisions

Decisions are `accept`, `reject`, or `request_correction`. Every event requires a reason and idempotency request ID, and records actor, timestamp, previous state, and new state. Existing events are not edited or removed.

`expectedVersion` provides optimistic concurrency. A stale decision receives a conflict instead of overwriting a newer transition. Retrying the same request ID and content is idempotent; reusing it with different content is rejected.

## Current scope

Authenticated HTTP routes expose document-specific creation/listing, record detail and reviewer decisions. The reviewer workspace uses `GET /api/v1/reconciliations/queue` for a permission-scoped cross-document queue. Existing document-specific list responses remain unchanged.

## Review queue

- Only reviewers and admins can use the queue. Reviewers see owned and explicitly assigned documents; admins see records for all existing documents. Orphaned records are excluded.
- Optional filters: `documentId`, `reviewState` (`pending`, `accepted`, `rejected`, `correction_requested`), `outcome` (`matched`, `converted`, `conflict`, `incompatible`, `insufficient_evidence`), and exact, case-sensitive `caseId` (trimmed, at most 200 characters).
- `page` defaults to 1 (maximum 1,000,000), `limit` to 20 (maximum 100). Positive decimal integers only; unknown, repeated or malformed parameters return `400 INVALID_QUEUE_FILTER`.
- A single aggregation applies document authorization before pagination and counts. Stable ordering is newest `createdAt`, then descending `_id`. The response contains a `data` array and `meta`/`pagination` with `total`, `page`, `limit`, `pages`. Empty results have zero pages. Out-of-range pages return an empty array with the authorized total.
- Queue rows retain operands and version needed for decisions, plus `documentName`. They omit the full case snapshot and decision history; the existing detail endpoint retains those fields.
- The UI defaults to pending reviews across accessible documents. Changing filters/pages clears selection and draft reason; older responses cannot overwrite current results. Saving or receiving a stale-version conflict reloads the queue without automatically retrying a write.
- Pagination is a live view, not a cross-request snapshot. Concurrent inserts/decisions may shift page boundaries. Revoked access disappears on the next request and existing decision authorization still applies. Production-scale latency and index tuning remain unbenchmarked; the query has a 10-second execution limit.

Tests use temporary loopback MongoDB for authorization, filters, counts, pagination and revocation, and synthetic browser responses for UI workflows. Both suites run in CI, including browser screenshots/failure traces. No production migration, new search index, report approval/export completion, or tenant policy is included in this increment.
