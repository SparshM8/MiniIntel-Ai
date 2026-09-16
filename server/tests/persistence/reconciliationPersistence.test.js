const { test, before, after } = require('node:test');

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server-core');
const Document = require('../../models/Document');
const ReconciliationRecord = require('../../models/ReconciliationRecord');
const scenarios = require('../fixtures/reconciliationCases');
const { createReconciliation, appendDecision } = require('../../services/reconciliationPersistenceService');

let database;
before(async () => {
  database = await MongoMemoryServer.create({ binary: { version: '7.0.14', checkMD5: true },
    instance: { ip: '127.0.0.1', dbName: `reconciliation_${randomUUID().replaceAll('-', '')}` } });
  await mongoose.connect(database.getUri(), { serverSelectionTimeoutMS: 10000 });
  await ReconciliationRecord.syncIndexes();
});
after(async () => { try { await mongoose.disconnect(); } finally { if (database) await database.stop(); } });

const actor = role => ({ _id: new mongoose.Types.ObjectId(), role });
async function documentFor(userId) {
  return Document.create({ filename: 'synthetic.pdf', originalName: 'synthetic.pdf', mimeType: 'application/pdf',
    fileSize: 1, fileType: 'pdf', userId });
}
function acceptance(id) { return structuredClone(scenarios.find(item => item.caseId === id)); }
async function expectCode(promise, code) { await assert.rejects(promise, error => error.code === code); }

test('creates an immutable deterministic record and retries idempotently', async () => {
  const owner = actor('user');
  const document = await documentFor(owner._id);
  const input = acceptance('compatible-unit-conversion');
  const first = await createReconciliation({ documentId: document.id, reconciliationCase: input, actor: owner });
  const second = await createReconciliation({ documentId: document.id, reconciliationCase: input, actor: owner });
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(first.record.id, second.record.id);
  const stored = await ReconciliationRecord.findById(first.record.id).lean();
  assert.equal(stored.outcome, 'converted');
  assert.equal(stored.caseSnapshot.facts[0].value, 200000);
  assert.deepEqual(stored.operands.map(item => item.normalizedValue), [200, 200]);
  assert.match(stored.payloadHash, /^[a-f0-9]{64}$/);
});

test('immutable evidence fields cannot be changed through document saves', async () => {
  const owner = actor('user');
  const document = await documentFor(owner._id);
  const { record } = await createReconciliation({ documentId: document.id, reconciliationCase: acceptance('same-value-same-unit'), actor: owner });
  record.outcome = 'conflict';
  record.reasonCode = 'VALUE_MISMATCH';
  record.caseSnapshot = { tampered: true };
  await record.save();
  const stored = await ReconciliationRecord.findById(record.id).lean();
  assert.equal(stored.outcome, 'matched');
  assert.equal(stored.reasonCode, 'EXACT_MATCH');
  assert.equal(stored.caseSnapshot.caseId, 'same-value-same-unit');
});

test('same case ID with changed evidence creates a distinct immutable record', async () => {
  const owner = actor('user');
  const document = await documentFor(owner._id);
  const original = acceptance('conflicting-final-values');
  const changed = acceptance('conflicting-final-values');
  changed.facts[1].value = 216;
  const first = await createReconciliation({ documentId: document.id, reconciliationCase: original, actor: owner });
  const second = await createReconciliation({ documentId: document.id, reconciliationCase: changed, actor: owner });
  assert.notEqual(first.record.id, second.record.id);
  assert.notEqual(first.record.payloadHash, second.record.payloadHash);
});

test('document ownership is enforced while admin access is explicit', async () => {
  const owner = actor('user');
  const outsider = actor('reviewer');
  const admin = actor('admin');
  const document = await documentFor(owner._id);
  await expectCode(createReconciliation({ documentId: document.id, reconciliationCase: acceptance('same-value-same-unit'), actor: outsider }), 'DOCUMENT_FORBIDDEN');
  assert.equal((await createReconciliation({ documentId: document.id, reconciliationCase: acceptance('same-value-same-unit'), actor: admin })).created, true);
});

test('review decisions append with actor, state transition and optimistic version', async () => {
  const reviewer = actor('reviewer');
  const document = await documentFor(reviewer._id);
  const { record } = await createReconciliation({ documentId: document.id, reconciliationCase: acceptance('conflicting-final-values'), actor: reviewer });
  const first = await appendDecision({ recordId: record.id, requestId: 'decision-1', decision: 'request_correction',
    reason: 'Source values disagree.', expectedVersion: 0, actor: reviewer });
  assert.equal(first.record.reviewVersion, 1);
  assert.equal(first.record.decisions[0].previousState, 'pending');
  assert.equal(first.record.decisions[0].newState, 'correction_requested');
  const second = await appendDecision({ recordId: record.id, requestId: 'decision-2', decision: 'reject',
    reason: 'Correction was not supplied.', expectedVersion: 1, actor: reviewer });
  assert.equal(second.record.reviewVersion, 2);
  assert.deepEqual(second.record.decisions.map(item => item.decision), ['request_correction', 'reject']);
});

test('same decision request retries safely but cannot be reused with different content', async () => {
  const reviewer = actor('reviewer');
  const document = await documentFor(reviewer._id);
  const { record } = await createReconciliation({ documentId: document.id, reconciliationCase: acceptance('same-value-same-unit'), actor: reviewer });
  const request = { recordId: record.id, requestId: 'decision-idempotent', decision: 'accept', reason: 'Evidence agrees.', expectedVersion: 0, actor: reviewer };
  assert.equal((await appendDecision(request)).created, true);
  assert.equal((await appendDecision(request)).created, false);
  await expectCode(appendDecision({ ...request, decision: 'reject' }), 'IDEMPOTENCY_CONFLICT');
  assert.equal((await ReconciliationRecord.findById(record.id)).decisions.length, 1);
});

test('simultaneous identical decision requests create one audit event', async () => {
  const reviewer = actor('reviewer');
  const document = await documentFor(reviewer._id);
  const { record } = await createReconciliation({ documentId: document.id, reconciliationCase: acceptance('same-value-same-unit'), actor: reviewer });
  const request = { recordId: record.id, requestId: 'simultaneous', decision: 'accept', reason: 'Verified once.', expectedVersion: 0, actor: reviewer };
  const results = await Promise.all([appendDecision(request), appendDecision(request)]);
  assert.deepEqual(results.map(item => item.created).sort(), [false, true]);
  assert.equal((await ReconciliationRecord.findById(record.id)).decisions.length, 1);
});

test('stale concurrent decisions cannot overwrite the accepted transition', async () => {
  const reviewer = actor('reviewer');
  const document = await documentFor(reviewer._id);
  const { record } = await createReconciliation({ documentId: document.id, reconciliationCase: acceptance('same-value-same-unit'), actor: reviewer });
  await appendDecision({ recordId: record.id, requestId: 'winner', decision: 'accept', reason: 'Verified.', expectedVersion: 0, actor: reviewer });
  await expectCode(appendDecision({ recordId: record.id, requestId: 'stale', decision: 'reject', reason: 'Stale.', expectedVersion: 0, actor: reviewer }), 'STALE_REVIEW_VERSION');
  const stored = await ReconciliationRecord.findById(record.id).lean();
  assert.equal(stored.reviewState, 'accepted');
  assert.equal(stored.decisions.length, 1);
});

test('ordinary users cannot append reviewer decisions', async () => {
  const user = actor('user');
  await expectCode(appendDecision({ recordId: new mongoose.Types.ObjectId(), requestId: 'x', decision: 'accept', reason: 'No.', expectedVersion: 0, actor: user }), 'FORBIDDEN_ROLE');
});
