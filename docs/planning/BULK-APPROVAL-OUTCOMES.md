# Increment 14: bulk validation and explicit outcomes


Depends on the previous test/review-mongodb-persistence contribution (d6e3b0c). At branch creation, upstream main was still 64498ef; merge the persistence contribution first. This branch deliberately includes that parent rather than claiming it was merged.

## API behavior

Bulk approval accepts a nonempty array of at most 1000 entries, each a 24-character hexadecimal string. The entire payload is validated before a database write. Invalid/mixed/oversized payloads return 400. IDs are normalized to lowercase and deduplicated before updateMany; duplicateCount counts redundant input entries. The cap applies before deduplication.

Valid requests retain HTTP 200 and a message, now 'Bulk approval request completed', with additive fields:

- requestedCount: unique valid IDs submitted.
- duplicateCount: redundant input entries.
- matchedCount: documents matched by the database update.
- modifiedCount: documents changed by that operation, including timestamp-only changes; NOT newly approved count.
- unmatchedCount: requestedCount minus matchedCount.

Missing IDs are not individually returned. A valid all-missing request returns zero matched/modified and a nonzero unmatchedCount, not a blanket approval claim. The operation remains nontransactional; no atomic batch or exactly-once guarantee is introduced.

## Client

After refreshing authoritative records, bulk feedback displays matched/modified/unmatched counts. Complete valid counts permit selection clearing. Unmatched, absent, or inconsistent counts produce a warning and retain surviving selected IDs; IDs absent from refreshed records are still pruned by the existing table behavior. Legacy server responses remain usable but no longer imply complete bulk success. Single-record review feedback is unchanged.

## Verification

Local: 176 server unit tests, 5 parser/model integration tests, 9 real MongoDB persistence tests, 24 client unit tests, and 16 Chromium browser tests passed. Production build passed with the existing large-chunk warning. Coverage includes normalization, request-size boundaries, invalid objects and mixed payloads, no mutation on validation failure, accurate database counts, unrelated records, all-missing IDs, and client partial/legacy outcomes.

No new dependencies relative to the persistence parent. This tightens accepted bulk input and adds response fields; callers submitting more than 1000 IDs must split explicitly. It does not establish document authorization, audit identity, concurrency control, or transactional recovery. HTTP middleware/authorization coverage remains the recommended next increment.
