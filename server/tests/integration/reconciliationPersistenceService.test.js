const test = require('node:test');


const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const scenarios = require('../fixtures/reconciliationCases');
const User = require('../../models/User');
const { stable, payloadHash, authorizeDocument, createReconciliation, appendDecision } = require('../../services/reconciliationPersistenceService');

const objectId = () => new mongoose.Types.ObjectId();
async function expectCode(promise, code, status) {
  await assert.rejects(promise, error => error.code === code && error.status === status);
}

test('stable serialization and payload hashes ignore object key insertion order', () => {
  assert.equal(stable({ b: 2, a: { d: 4, c: 3 } }), stable({ a: { c: 3, d: 4 }, b: 2 }));
  const documentId = objectId();
  assert.equal(payloadHash(documentId, { b: 2, a: 1 }, { outcome: 'matched' }),
    payloadHash(documentId, { a: 1, b: 2 }, { outcome: 'matched' }));
});

test('document authorization rejects missing actors and malformed IDs before lookup', async () => {
  const DocumentModel = { findById() { throw new Error('must not query'); } };
  await expectCode(authorizeDocument(objectId(), null, DocumentModel), 'AUTH_REQUIRED', 401);
  await expectCode(authorizeDocument('bad', { _id: objectId(), role: 'admin' }, DocumentModel), 'INVALID_DOCUMENT_ID', 400);
});

test('only an assigned reviewer receives delegated document access', async () => {
  const ownerId = objectId();
  const assignedId = objectId();
  const documentId = objectId();
  const DocumentModel = { findById: () => ({ select: () => ({ lean: async () => ({
    _id: documentId, userId: ownerId, reviewerIds: [assignedId]
  }) }) }) };
  assert.equal((await authorizeDocument(documentId, { _id: assignedId, role: 'reviewer' }, DocumentModel))._id, documentId);
  await expectCode(authorizeDocument(documentId, { _id: assignedId, role: 'reviewer' }, DocumentModel, 'manage'), 'DOCUMENT_FORBIDDEN', 403);
  await expectCode(authorizeDocument(documentId, { _id: assignedId, role: 'user' }, DocumentModel), 'DOCUMENT_FORBIDDEN', 403);
  await expectCode(authorizeDocument(documentId, { _id: assignedId, role: 'official' }, DocumentModel), 'DOCUMENT_FORBIDDEN', 403);
  await expectCode(authorizeDocument(documentId, { _id: objectId(), role: 'reviewer' }, DocumentModel), 'DOCUMENT_FORBIDDEN', 403);
});

test('user model rejects the removed official role', () => {
  const error = new User({ username: 'removed-role', password: 'unused', role: 'official' }).validateSync();
  assert.equal(error.errors.role.kind, 'enum');
});

test('removed official role cannot submit decisions before database access', async () => {
  const RecordModel = { findById() { throw new Error('must not query'); } };
  await expectCode(appendDecision({ recordId: objectId(), requestId: 'removed-role-decision',
    decision: 'accept', reason: 'Not authorized', expectedVersion: 0,
    actor: { _id: objectId(), role: 'official' } }, { RecordModel }), 'FORBIDDEN_ROLE', 403);
});

test('create rejects invalid evidence contracts before persistence', async () => {
  const owner = { _id: objectId(), role: 'user' };
  const documentId = objectId();
  const DocumentModel = { findById: () => ({ select: () => ({ lean: async () => ({ _id: documentId, userId: owner._id }) }) }) };
  const RecordModel = { create() { throw new Error('must not persist'); } };
  const invalid = structuredClone(scenarios[0]);
  invalid.facts[0].value = null;
  await expectCode(createReconciliation({ documentId, reconciliationCase: invalid, actor: owner }, { DocumentModel, RecordModel }),
    'INVALID_RECONCILIATION_CASE', 400);
});

test('decision validation rejects malformed IDs and payloads before database access', async () => {
  const reviewer = { _id: objectId(), role: 'reviewer' };
  await expectCode(appendDecision({ recordId: 'bad', actor: reviewer }), 'INVALID_RECORD_ID', 400);
  await expectCode(appendDecision({ recordId: objectId(), requestId: '', decision: 'accept', reason: '', expectedVersion: -1, actor: reviewer }),
    'INVALID_DECISION', 400);
});
