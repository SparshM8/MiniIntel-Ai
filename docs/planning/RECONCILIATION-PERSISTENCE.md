# Reconciliation persistence and audit boundary

## Purpose

Phase 3 stores deterministic reconciliation evidence and reviewer decisions without changing source facts. The persistence service is the only supported write boundary; callers provide a case and authenticated actor, never a trusted engine result or actor ID.

## Immutable record

Each record preserves the document ID, case and contract version, engine version, outcome, reason code, complete case snapshot, normalized operands, creator, creation time, and a canonical SHA-256 payload hash. A unique document/case/hash index makes identical retries idempotent while allowing changed evidence to create a new record.

The service recomputes reconciliation output server-side. Invalid evidence contracts are rejected before persistence. Source facts and prior reconciliation records are never updated when evidence changes.

## Authorization

- An authenticated actor is mandatory.
- Non-admin actors may access only documents whose `userId` matches their authenticated ID.
- Admins may operate across document owners.
- Reviewer decisions require the `reviewer` or `admin` role.
- Actor identity is derived from authenticated context, not request data.

## Append-only decisions

Decisions are `accept`, `reject`, or `request_correction`. Every event requires a reason and idempotency request ID, and records actor, timestamp, previous state, and new state. Existing events are not edited or removed.

`expectedVersion` provides optimistic concurrency. A stale decision receives a conflict instead of overwriting a newer transition. Retrying the same request ID and content is idempotent; reusing it with different content is rejected.

## Current scope

Phase 3 provides Mongoose models and a tested service boundary. It does not expose public HTTP routes, alter existing review APIs, migrate production data, integrate UI, or approve/export reports. HTTP exposure should be a separate change after endpoint-level authorization and request-size controls are reviewed.
