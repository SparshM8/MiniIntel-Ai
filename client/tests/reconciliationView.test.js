import test from 'node:test';
import assert from 'node:assert/strict';
import { outcomeLabel, reviewStateLabel, isVersionConflict } from '../src/utils/reconciliationView.js';

test('reconciliation labels use readable closed-vocabulary values', () => {
  assert.equal(outcomeLabel('insufficient_evidence'), 'Insufficient evidence');
  assert.equal(outcomeLabel('conflict'), 'Conflict');
  assert.equal(reviewStateLabel('correction_requested'), 'Correction requested');
  assert.equal(reviewStateLabel('pending'), 'Pending review');
  assert.equal(outcomeLabel('unexpected'), 'Unknown');
});

test('only stale review version responses trigger automatic reload handling', () => {
  assert.equal(isVersionConflict({ response: { status: 409, data: { error: 'STALE_REVIEW_VERSION' } } }), true);
  assert.equal(isVersionConflict({ response: { status: 409, data: { error: { code: 'STALE_REVIEW_VERSION' } } } }), true);
  assert.equal(isVersionConflict({ response: { status: 409, data: { error: 'IDEMPOTENCY_CONFLICT' } } }), false);
  assert.equal(isVersionConflict({ response: { status: 500 } }), false);
});
