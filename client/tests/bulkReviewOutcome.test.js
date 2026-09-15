import test from 'node:test';


import assert from 'node:assert/strict';
import { bulkReviewOutcome } from '../src/utils/bulkReviewOutcome.js';

test('complete counts do not confuse modifications with status transitions', () => {
  const result = bulkReviewOutcome({ requestedCount: 2, matchedCount: 2, modifiedCount: 0, unmatchedCount: 0 });
  assert.equal(result.complete, true);
  assert.match(result.text, /0 records modified/);
});
test('v1 response envelope exposes authoritative counts', () => {
  assert.equal(bulkReviewOutcome({ success: true, data: {
    requestedCount: 1, matchedCount: 1, modifiedCount: 1, unmatchedCount: 0
  } }).complete, true);
});
test('partial counts cannot signal complete success', () => {
  const result = bulkReviewOutcome({ requestedCount: 2, matchedCount: 1, modifiedCount: 1, unmatchedCount: 1 });
  assert.equal(result.complete, false);
  assert.match(result.text, /1 unmatched/);
});
for (const result of [undefined, {}, { requestedCount: 1, matchedCount: 2, modifiedCount: 2, unmatchedCount: 0 }]) {
  test(`missing or inconsistent counts are uncertain: ${JSON.stringify(result)}`, () => {
    assert.equal(bulkReviewOutcome(result).complete, false);
    assert.match(bulkReviewOutcome(result).text, /unavailable/);
  });
}
