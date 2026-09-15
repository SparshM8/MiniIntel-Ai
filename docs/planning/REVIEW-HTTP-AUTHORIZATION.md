# Review HTTP authorization follow-up


Based on upstream merge 3b345fa. Real HTTP tests revealed that the versioned bulk route was separate from the previously tested controller: it filtered malformed IDs, lacked document ownership checks, and returned a different outcome shape. The legacy extraction router also mounted controller methods without authentication.

## Changes

- Legacy extraction URLs now delegate to the authenticated v1 router rather than exposing controller-only review operations.
- v1 bulk approval uses the existing strict ID validator and checks every matched record's document before any write. A forbidden document rejects the complete request. The update filter includes only checked record/document pairs.
- v1 bulk responses include requested/duplicate/matched/modified/unmatched counts in the standard success envelope. The client outcome formatter supports that envelope as well as prior flat responses.
- Twelve HTTP tests exercise both URL prefixes with real Express routes, JWT middleware, users, and temporary MongoDB. They cover anonymous access, foreign-document denial, mixed-owner batches with no writes, strict IDs, outcome counts, owner edits, admin review, suspended users, invalid tokens, and expired tokens. Tests reproduced failures before the implementation change.

## Compatibility and boundaries

Legacy callers must now supply a valid bearer token and consume the v1 success envelope ({ success, data, message }); legacy GET returns the extraction summary with records rather than a bare array. This intentional security change is not payload-backward-compatible. Clients should use /api/v1/extraction.

The existing v1 policy remains: authenticated document owners may review their records; designated admins may access other documents; documents without userId remain accessible to authenticated users. This contribution does NOT establish reviewer-only access or change ownerless-document policy. Other API namespaces, fallback JWT-secret policy, admin identity policy, and full server-startup composition are not audited here.

Authorization checks precede writes, but are not a transaction with document ownership changes. No cross-document transaction, exactly-once operation, or concurrency guarantee is claimed. The pair filter prevents newly appearing IDs or reassigned record-document pairs from being unintentionally included, not changes to a document's owner between reads and writes.

## Local verification

Windows Node 20.20.2 and Node 24.21.0 each passed 176 server unit, 25 client unit, 5 integration, and 21 persistence/HTTP tests. Chromium: 16 passed. Production build passed with the existing large-chunk warning. Tests launch only loopback Express/MongoDB using generated test credentials and synthetic records; no production database URI or server startup is loaded. Fork CI must pass before a PR is opened; PR checks must pass before merge.
