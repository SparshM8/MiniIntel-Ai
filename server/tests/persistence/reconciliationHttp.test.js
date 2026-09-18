const { test, before, after } = require('node:test');

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server-core');
const User = require('../../models/User');
const Document = require('../../models/Document');
const ReconciliationRecord = require('../../models/ReconciliationRecord');
const scenarios = require('../fixtures/reconciliationCases');

const secret = randomUUID();
const originalSecret = process.env.JWT_SECRET;
const originalAdmin = process.env.ADMIN_USERNAME;
let database, server, base, owner, other, reviewer, document;

before(async () => {
  process.env.JWT_SECRET = secret;
  process.env.ADMIN_USERNAME = `queue-admin-${randomUUID()}`;
  database = await MongoMemoryServer.create({ binary: { version: '7.0.14', checkMD5: true },
    instance: { ip: '127.0.0.1', dbName: `reconciliation_http_${randomUUID().replaceAll('-', '')}` } });
  await mongoose.connect(database.getUri());
  [owner, other, reviewer] = await User.insertMany([
    { username: 'reconciliation-owner', password: 'unused', role: 'user' },
    { username: 'reconciliation-other', password: 'unused', role: 'user' },
    { username: 'reconciliation-reviewer', password: 'unused', role: 'reviewer' }
  ]);
  document = await Document.create({ filename: 'evidence.csv', originalName: 'evidence.csv', mimeType: 'text/csv',
    fileSize: 1, fileType: 'csv', userId: owner._id });
  const app = express();
  app.use(express.json());
  app.use('/api/v1/reconciliations', require('../../routes/api/v1/reconciliations'));
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  base = `http://127.0.0.1:${server.address().port}/api/v1/reconciliations`;
});

after(async () => {
  try {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await mongoose.disconnect();
  } finally {
    if (database) await database.stop();
    if (originalSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originalSecret;
    if (originalAdmin === undefined) delete process.env.ADMIN_USERNAME; else process.env.ADMIN_USERNAME = originalAdmin;
  }
});

async function request(path, method = 'GET', body, user = owner) {
  const headers = { 'Content-Type': 'application/json' };
  if (user) headers.Authorization = `Bearer ${jwt.sign({ id: user.id }, secret, { expiresIn: '5m' })}`;
  const response = await fetch(`${base}${path}`, { method, headers,
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  return { status: response.status, body: await response.json() };
}

let recordId;
test('review queue scopes counts and pages to accessible documents and reflects revocation', async () => {
  const queueDocument = await Document.create({ filename: 'queue.csv', originalName: 'queue.csv', mimeType: 'text/csv',
    fileSize: 1, fileType: 'csv', userId: owner._id, reviewerIds: [reviewer._id] });
  const hiddenDocument = await Document.create({ filename: 'hidden.csv', originalName: 'hidden.csv', mimeType: 'text/csv',
    fileSize: 1, fileType: 'csv', userId: other._id });
  for (const caseId of ['queue.[1]', 'queue.[2]', 'queue.[3]']) {
    assert.equal((await request(`/documents/${queueDocument.id}`, 'POST', { ...scenarios[0], caseId })).status, 201);
  }
  assert.equal((await request(`/documents/${hiddenDocument.id}`, 'POST', { ...scenarios[0], caseId: 'queue.hidden' }, other)).status, 201);
  const path = '/queue?limit=2';
  assert.equal((await request(path, 'GET', undefined, null)).status, 401);
  assert.equal((await request(path)).status, 403);
  const first = await request(path, 'GET', undefined, reviewer);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.deepEqual(first.body.meta, { total: 3, page: 1, limit: 2, pages: 2 });
  assert.equal(first.body.data.length, 2);
  assert.ok(first.body.data.every(record => record.documentId === queueDocument.id));
  const second = await request(`${path}&page=2`, 'GET', undefined, reviewer);
  assert.equal(second.body.data.length, 1);
  assert.ok(!first.body.data.some(record => record._id === second.body.data[0]._id));
  const literal = await request('/queue?caseId=queue.%5B1%5D', 'GET', undefined, reviewer);
  assert.equal(literal.body.meta.total, 1);
  assert.equal(literal.body.data[0].caseId, 'queue.[1]');
  const reviewed = await request(`/${literal.body.data[0]._id}/decisions`, 'POST', {
    requestId: randomUUID(), decision: 'accept', reason: 'Queue evidence verified', expectedVersion: 0
  }, reviewer);
  assert.equal(reviewed.status, 200);
  const filtered = await request(`/queue?reviewState=accepted&outcome=${scenarios[0].expectedOutcome || literal.body.data[0].outcome}&documentId=${queueDocument.id}`, 'GET', undefined, reviewer);
  assert.equal(filtered.status, 200);
  assert.equal(filtered.body.meta.total, 1);
  assert.equal(filtered.body.data[0]._id, literal.body.data[0]._id);
  const foreign = await request(`/queue?documentId=${hiddenDocument.id}`, 'GET', undefined, reviewer);
  assert.equal(foreign.body.meta.total, 0);
  assert.deepEqual(foreign.body.data, []);
  const outside = await request(`${path}&page=3`, 'GET', undefined, reviewer);
  assert.deepEqual(outside.body.data, []);
  assert.equal(outside.body.meta.total, 3);
  await Document.updateOne({ _id: queueDocument._id }, { $set: { reviewerIds: [] } });
  const revoked = await request(path, 'GET', undefined, reviewer);
  assert.deepEqual(revoked.body.data, []);
  assert.equal(revoked.body.meta.total, 0);
  await ReconciliationRecord.deleteMany({ documentId: { $in: [queueDocument._id, hiddenDocument._id] } });
  await Document.deleteMany({ _id: { $in: [queueDocument._id, hiddenDocument._id] } });
});

test('queue rejects malformed filters without treating them as unrestricted requests', async () => {
  for (const query of ['page=0', 'page=-1', 'page=1.2', 'page=1000001', 'limit=101', 'limit=0',
    'page=1&page=2', 'reviewState=unknown', 'outcome=unknown', 'documentId=bad', 'caseId=',
    `caseId=${'a'.repeat(201)}`, 'caseId[$ne]=', 'unknown=1']) {
    const result = await request(`/queue?${query}`, 'GET', undefined, reviewer);
    assert.equal(result.status, 400, query);
    assert.equal(result.body.error, 'INVALID_QUEUE_FILTER');
  }
});

test('queue includes reviewer-owned documents and admin sees every existing document', async () => {
  const admin = await User.create({ username: process.env.ADMIN_USERNAME, password: 'unused', role: 'admin' });
  const owned = await Document.create({ filename: 'owned.csv', originalName: 'owned.csv', mimeType: 'text/csv',
    fileSize: 1, fileType: 'csv', userId: reviewer._id });
  const created = await request(`/documents/${owned.id}`, 'POST', { ...scenarios[0], caseId: 'reviewer-owned' }, reviewer);
  assert.equal(created.status, 201);
  for (const actor of [reviewer, admin]) {
    const result = await request('/queue?caseId=reviewer-owned', 'GET', undefined, actor);
    assert.equal(result.status, 200);
    assert.equal(result.body.meta.total, 1);
    assert.equal(result.body.data[0].documentName, 'owned.csv');
    assert.equal(result.body.data[0].caseSnapshot, undefined);
    assert.equal(result.body.data[0].decisions, undefined);
  }
  await Document.deleteOne({ _id: owned._id });
  assert.equal((await request('/queue?caseId=reviewer-owned', 'GET', undefined, admin)).body.meta.total, 0);
  await ReconciliationRecord.deleteMany({ documentId: owned._id });
  await User.deleteOne({ _id: admin._id });
});

test('anonymous and foreign actors cannot access document reconciliations', async () => {
  assert.equal((await request(`/documents/${document.id}`, 'GET', undefined, null)).status, 401);
  assert.equal((await request(`/documents/${document.id}`, 'POST', scenarios[0], other)).status, 403);
  assert.equal(await ReconciliationRecord.countDocuments(), 0);
});

test('owner creates idempotently, lists, and reads a reconciliation', async () => {
  const created = await request(`/documents/${document.id}`, 'POST', scenarios[0]);
  assert.equal(created.status, 201);
  recordId = created.body.data._id;
  const replay = await request(`/documents/${document.id}`, 'POST', scenarios[0]);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.data._id, recordId);
  assert.equal(await ReconciliationRecord.countDocuments(), 1);
  const listed = await request(`/documents/${document.id}`);
  assert.equal(listed.status, 200);
  assert.equal(listed.body.data.length, 1);
  assert.equal((await request(`/${recordId}`)).status, 200);
  assert.equal((await request(`/${recordId}`, 'GET', undefined, other)).status, 403);
});

test('review decisions enforce role, idempotency, and optimistic versions', async () => {
  const decision = { requestId: randomUUID(), decision: 'accept', reason: 'Evidence verified', expectedVersion: 0 };
    assert.equal((await request(`/${recordId}/decisions`, 'POST', decision, owner)).status, 403);
  const unassigned = await request(`/${recordId}/decisions`, 'POST', decision, reviewer);
  assert.equal(unassigned.status, 403, 'unassigned reviewers cannot review foreign documents');
  document.reviewerIds = [reviewer._id];
  await document.save();
  const assignedAccepted = await request(`/${recordId}/decisions`, 'POST', decision, reviewer);
  assert.equal(assignedAccepted.status, 200);
  assert.equal(assignedAccepted.body.data.reviewVersion, 1);
  assert.equal((await request(`/${recordId}/decisions`, 'POST', decision, reviewer)).status, 200);
  assert.equal((await request(`/${recordId}/decisions`, 'POST', { ...decision, reason: 'Changed' }, reviewer)).status, 409);
  const stale = { requestId: randomUUID(), decision: 'reject', reason: 'Stale review', expectedVersion: 0 };
  assert.equal((await request(`/${recordId}/decisions`, 'POST', stale, reviewer)).status, 409);
});

test('assigned reviewer can read but not create, and revoked access denies reads and decisions', async () => {
  const assignedDocument = await Document.create({ filename: 'assigned.csv', originalName: 'assigned.csv',
    mimeType: 'text/csv', fileSize: 1, fileType: 'csv', userId: owner._id, reviewerIds: [reviewer._id] });
  const created = await request(`/documents/${assignedDocument.id}`, 'POST', scenarios[0]);
  assert.equal(created.status, 201);
  const id = created.body.data._id;
  assert.equal((await request(`/documents/${assignedDocument.id}`, 'GET', undefined, reviewer)).status, 200);
  assert.equal((await request(`/${id}`, 'GET', undefined, reviewer)).status, 200);
  assert.equal((await request(`/documents/${assignedDocument.id}`, 'POST', scenarios[0], reviewer)).status, 403);

  await Document.updateOne({ _id: assignedDocument._id }, { $set: { reviewerIds: [] } });
  assert.equal((await request(`/documents/${assignedDocument.id}`, 'GET', undefined, reviewer)).status, 403);
  assert.equal((await request(`/${id}`, 'GET', undefined, reviewer)).status, 403);
  assert.equal((await request(`/${id}/decisions`, 'POST', { requestId: randomUUID(), decision: 'accept',
    reason: 'Assignment revoked', expectedVersion: 0 }, reviewer)).status, 403);
  const stored = await ReconciliationRecord.findById(id).lean();
  assert.equal(stored.reviewVersion, 0);
  assert.equal(stored.decisions.length, 0);
});

test('persisted legacy official role gains no delegated read or decision access', async () => {
  // Raw insertion reproduces an account created before the schema removed this role.
  const legacyId = new mongoose.Types.ObjectId();
  await User.collection.insertOne({ _id: legacyId, username: 'legacy-official', password: 'unused',
    role: 'official', status: 'active' });
  const legacy = { id: legacyId.toString() };
  const assignedDocument = await Document.create({ filename: 'legacy.csv', originalName: 'legacy.csv',
    mimeType: 'text/csv', fileSize: 1, fileType: 'csv', userId: owner._id, reviewerIds: [legacyId] });
  const created = await request(`/documents/${assignedDocument.id}`, 'POST', scenarios[0]);
  assert.equal(created.status, 201);
  const id = created.body.data._id;
  assert.equal((await request(`/documents/${assignedDocument.id}`, 'GET', undefined, legacy)).status, 403);
  assert.equal((await request(`/${id}`, 'GET', undefined, legacy)).status, 403);
  assert.equal((await request(`/${id}/decisions`, 'POST', { requestId: randomUUID(), decision: 'accept',
    reason: 'Legacy role must not approve', expectedVersion: 0 }, legacy)).status, 403);
  const stored = await ReconciliationRecord.findById(id).lean();
  assert.equal(stored.reviewVersion, 0);
  assert.equal(stored.decisions.length, 0);
});
