const test = require('node:test');

const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const ReconciliationRecord = require('../../models/ReconciliationRecord');

function validRecord() {
  return new ReconciliationRecord({ documentId: new mongoose.Types.ObjectId(), caseId: 'case-1',
    contractVersion: '1.0.0', engineVersion: '1.0.0', outcome: 'matched', reasonCode: 'EXACT_MATCH',
    caseSnapshot: { facts: [{ value: 0 }] }, payloadHash: 'a'.repeat(64), createdBy: new mongoose.Types.ObjectId() });
}

test('reconciliation model validates an immutable evidence snapshot without a database', () => {
  const record = validRecord();
  assert.equal(record.validateSync(), undefined);
  assert.equal(record.reviewState, 'pending');
  assert.equal(record.reviewVersion, 0);
  assert.deepEqual(record.decisions, []);
});

test('reconciliation model rejects unsupported outcomes', () => {
  const record = validRecord();
  record.outcome = 'guessed';
  assert.equal(record.validateSync().errors.outcome.kind, 'enum');
});

test('review decisions require actor, reason and closed decision vocabulary', () => {
  const record = validRecord();
  record.decisions.push({ requestId: 'request-1', decision: 'override', reason: '', previousState: 'pending', newState: 'accepted' });
  const errors = record.validateSync().errors;
  assert.ok(errors['decisions.0.actor']);
  assert.ok(errors['decisions.0.reason']);
  assert.equal(errors['decisions.0.decision'].kind, 'enum');
});
