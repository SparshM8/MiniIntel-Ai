const test = require('node:test');
const assert = require('node:assert/strict');
const { validateBulkReviewIds, MAX_BULK_REVIEW_IDS } = require('../utils/bulkReviewIds');
const id = 'abcdef0123456789abcdef01';

test('normalizes duplicate IDs without mutating input', () => {
  const input = [id, id.toUpperCase()];
  assert.deepEqual(validateBulkReviewIds(input), { ids: [id], duplicateCount: 1 });
  assert.equal(input[1], id.toUpperCase());
});
for (const [name, input] of [
  ['missing', undefined], ['null', null], ['empty', []], ['scalar', id],
  ['number', [123]], ['object', [{ $ne: null }]], ['mixed', [id, 'invalid']],
  ['whitespace', [` ${id}`]], ['short', ['abcdef']], ['sparse', new Array(1)],
  ['oversized', Array(MAX_BULK_REVIEW_IDS + 1).fill(id)]
]) {
  test(`rejects ${name} input`, () => assert.equal(typeof validateBulkReviewIds(input).error, 'string'));
}
test('accepts the documented size boundary before deduplication', () => {
  assert.equal(validateBulkReviewIds(Array(MAX_BULK_REVIEW_IDS).fill(id)).duplicateCount, MAX_BULK_REVIEW_IDS - 1);
});
