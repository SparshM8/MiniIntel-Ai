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
