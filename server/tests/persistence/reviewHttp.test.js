const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server-core');
const User = require('../../models/User');
const Document = require('../../models/Document');
const Record = require('../../models/ExtractedRecord');
const secret = randomUUID();
const originalSecret = process.env.JWT_SECRET;
const originalAdmin = process.env.ADMIN_USERNAME;
let database, server, base, owner, other, admin, suspended;

before(async () => {
  process.env.JWT_SECRET = secret;
  process.env.ADMIN_USERNAME = 'synthetic-admin';
  database = await MongoMemoryServer.create({ binary: { version: '7.0.14', checkMD5: true },
    instance: { ip: '127.0.0.1', dbName: `http_${randomUUID().replaceAll('-', '')}` } });
  await mongoose.connect(database.getUri());
  [owner, other, admin, suspended] = await User.insertMany([
    { username: 'owner', password: 'unused', role: 'reviewer' },
    { username: 'other', password: 'unused', role: 'user' },
    { username: 'synthetic-admin', password: 'unused', role: 'admin' },
    { username: 'suspended', password: 'unused', status: 'suspended' }
  ]);
  const app = express();
  app.use(express.json());
  app.use('/api/v1/extraction', require('../../routes/api/v1/extraction'));
  app.use('/api/extraction', require('../../routes/extraction'));
  app.use(require('../../middleware/errorHandler'));
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  base = `http://127.0.0.1:${server.address().port}`;
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
async function fact(user = owner) {
  const document = await Document.create({ filename: 'synthetic.csv', originalName: 'synthetic.csv',
    mimeType: 'text/csv', fileSize: 1, fileType: 'csv', ...(user ? { userId: user._id } : {}) });
  return Record.create({ documentId: document._id, parameter: 'Coal Production', value: '0', originalValue: '0', unit: 't' });
}
async function request(prefix, path, method = 'GET', body, user = owner, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token || user) headers.Authorization = `Bearer ${token || jwt.sign({ id: user.id }, secret, { expiresIn: '5m' })}`;
  const response = await fetch(`${base}${prefix}${path}`, { method, headers,
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  return { status: response.status, body: await response.json() };
}
for (const prefix of ['/api/v1/extraction', '/api/extraction']) {
  test(`${prefix}: anonymous reads and mutations are denied without writes`, async () => {
    const record = await fact();
    for (const [path, method, body] of [
      [`/${record.documentId}`, 'GET'], [`/records/${record.id}`, 'PUT', { value: '99' }],
      [`/records/${record.id}/approve`, 'POST'], [`/records/${record.id}/reject`, 'POST'],
      ['/records/bulk-approve', 'POST', { ids: [record.id] }], [`/${record.documentId}/extract`, 'POST']
    ]) assert.equal((await request(prefix, path, method, body, null)).status, 401);
    const stored = await Record.findById(record.id);
    assert.equal(stored.value, '0'); assert.equal(stored.status, 'pending');
  });
  test(`${prefix}: foreign document reads and single writes are forbidden`, async () => {
    const record = await fact();
    for (const [path, method, body] of [
      [`/${record.documentId}`, 'GET'], [`/records/${record.id}`, 'PUT', { value: '99' }],
      [`/records/${record.id}/approve`, 'POST'], [`/records/${record.id}/reject`, 'POST']
    ]) assert.equal((await request(prefix, path, method, body, other)).status, 403);
    assert.equal((await Record.findById(record.id)).status, 'pending');
    assert.equal((await Record.findById(record.id)).value, '0');
  });
  test(`${prefix}: mixed-owner bulk denies the whole request before writes`, async () => {
    const own = await fact(); const foreign = await fact(other);
    assert.equal((await request(prefix, '/records/bulk-approve', 'POST', { ids: [own.id, foreign.id] })).status, 403);
    assert.equal((await Record.findById(own.id)).status, 'pending');
    assert.equal((await Record.findById(foreign.id)).status, 'pending');
  });
  test(`${prefix}: owner bulk returns counts and persists reviewer identity`, async () => {
    const record = await fact();
    const result = await request(prefix, '/records/bulk-approve', 'POST', {
      ids: [record.id, record.id.toUpperCase(), new mongoose.Types.ObjectId().toString()]
    });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.data, { requestedCount: 2, duplicateCount: 1, matchedCount: 1, modifiedCount: 1, unmatchedCount: 1 });
    assert.equal((await Record.findById(record.id)).reviewedBy, owner.username);
  });
  test(`${prefix}: invalid mixed IDs never partially approve`, async () => {
    const record = await fact();
    assert.equal((await request(prefix, '/records/bulk-approve', 'POST', { ids: [record.id, 'bad'] })).status, 400);
    assert.equal((await Record.findById(record.id)).status, 'pending');
  });
  test(`${prefix}: owner edits, admin reviews foreign documents, bad sessions fail`, async () => {
    const record = await fact();
    assert.equal((await request(prefix, `/records/${record.id}`, 'PUT', { value: '7' })).status, 200);
    assert.equal((await Record.findById(record.id)).editHistory.length, 1);
    assert.equal((await request(prefix, `/records/${record.id}/approve`, 'POST', undefined, admin)).status, 200);
    assert.equal((await Record.findById(record.id)).reviewedBy, admin.username);
    assert.equal((await request(prefix, `/records/${record.id}/reject`, 'POST', undefined, suspended)).status, 403);
    assert.equal((await request(prefix, `/${record.documentId}`, 'GET', undefined, null, 'invalid')).status, 401);
    const expired = jwt.sign({ id: owner.id }, secret, { expiresIn: -1 });
    assert.equal((await request(prefix, `/${record.documentId}`, 'GET', undefined, null, expired)).status, 401);
  });
}
