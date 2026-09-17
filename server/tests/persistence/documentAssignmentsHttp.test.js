const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server-core');
const User = require('../../models/User');
const Document = require('../../models/Document');
const DocumentPage = require('../../models/DocumentPage');
const DocumentChunk = require('../../models/DocumentChunk');
const ProcessingJob = require('../../models/ProcessingJob');
const ExtractedRecord = require('../../models/ExtractedRecord');
const AuditLog = require('../../models/AuditLog');

const secret = randomUUID();
const environment = {
  JWT_SECRET: secret,
  ADMIN_USERNAME: `assignment-admin-${randomUUID()}`,
  NODE_ENV: 'test',
  OPENAI_API_KEY: 'isolated-test-not-a-provider-key'
};
const originalEnvironment = new Map(Object.keys(environment).map(key => [key, process.env[key]]));
const originalModules = new Map();
const models = [User, Document, DocumentPage, DocumentChunk, ProcessingJob, ExtractedRecord, AuditLog];
let database, server, base, owner, admin, reviewer, secondReviewer, unassigned, suspended, inactive, legacy;
let ingestionCalls = 0;

before(async () => {
  Object.assign(process.env, environment);
  const processingPath = require.resolve('../../services/processingService');
  originalModules.set(processingPath, require.cache[processingPath]);
  require.cache[processingPath] = {
    id: processingPath,
    filename: processingPath,
    loaded: true,
    exports: {
      processDocument() {
        ingestionCalls += 1;
        throw new Error('Ingestion must never run in assignment HTTP tests');
      }
    }
  };
  database = await MongoMemoryServer.create({
    binary: { version: '7.0.14', checkMD5: true },
    instance: { ip: '127.0.0.1', dbName: `assignments_http_${randomUUID().replaceAll('-', '')}` }
  });
  await mongoose.connect(database.getUri());
  [owner, admin, reviewer, secondReviewer, unassigned, suspended, inactive] = await User.insertMany([
    { username: 'assignment-owner', password: 'unused', role: 'user' },
    { username: environment.ADMIN_USERNAME, password: 'unused', role: 'admin' },
    { _id: new mongoose.Types.ObjectId('abcdefabcdefabcdefabcdef'), username: 'assigned-reviewer', password: 'unused', role: 'reviewer' },
    { username: 'second-reviewer', password: 'unused', role: 'reviewer' },
    { username: 'unassigned-reviewer', password: 'unused', role: 'reviewer' },
    { username: 'suspended-reviewer', password: 'unused', role: 'reviewer', status: 'suspended' },
    { username: 'inactive-reviewer', password: 'unused', role: 'reviewer', status: 'inactive' }
  ]);
  const legacyId = new mongoose.Types.ObjectId();
  await User.collection.insertOne({ _id: legacyId, username: 'legacy-official', password: 'unused', role: 'official', status: 'active' });
  legacy = { id: legacyId.toString(), _id: legacyId };
  const app = express();
  app.use(express.json());
  const documentsPath = require.resolve('../../routes/api/v1/documents');
  originalModules.set(documentsPath, require.cache[documentsPath]);
  app.use('/api/v1/documents', require(documentsPath));
  app.use(require('../../middleware/errorHandler'));
  server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.once('error', reject);
  });
  base = `http://127.0.0.1:${server.address().port}/api/v1/documents`;
});

after(async () => {
  try {
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  } finally {
    try {
      await mongoose.disconnect();
    } finally {
      try {
        if (database) await database.stop();
      } finally {
        for (const [modulePath, original] of originalModules) {
          if (original === undefined) delete require.cache[modulePath];
          else require.cache[modulePath] = original;
        }
        for (const [key, original] of originalEnvironment) {
          if (original === undefined) delete process.env[key];
          else process.env[key] = original;
        }
      }
    }
  }
  assert.equal(ingestionCalls, 0, 'No request may invoke the ingestion pipeline');
});

async function fixture(reviewerIds = [], user = owner) {
  const filename = `assignment-${randomUUID()}.csv`;
  return Document.create({ filename, originalName: filename, mimeType: 'text/csv', fileSize: 1,
    fileType: 'csv', userId: user._id, reviewerIds });
}

async function request(path, method = 'GET', body, user = admin) {
  const headers = { 'Content-Type': 'application/json' };
  if (user) headers.Authorization = `Bearer ${jwt.sign({ id: user.id }, secret, { expiresIn: '5m' })}`;
  const response = await fetch(`${base}${path}`, { method, headers,
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  return { status: response.status, body: await response.json() };
}

async function snapshot() {
  return Promise.all(models.map(async model => ({
    collection: model.collection.name,
    documents: JSON.stringify(await model.collection.find({}).sort({ _id: 1 }).toArray())
  })));
}

async function deniedWithoutWrites(path, method, body, user, status, code) {
  const previous = await snapshot();
  const response = await request(path, method, body, user);
  assert.deepEqual(await snapshot(), previous, 'Denied requests must not change persisted data or audit logs');
  assert.equal(response.status, status, JSON.stringify(response.body));
  assert.equal(response.body.success, false);
  if (code !== undefined) assert.equal(response.body.error, code);
}

async function assign(document, reviewerIds, expectedIds) {
  const query = { resourceId: document._id, action: 'ASSIGN_DOCUMENT_REVIEWERS' };
  const previousCount = await AuditLog.countDocuments(query);
  const response = await request(`/${document.id}/reviewers`, 'PUT', { reviewerIds });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.success, true);
  assert.deepEqual(response.body.data, { documentId: document.id, reviewerIds: expectedIds });
  const stored = await Document.findById(document.id).lean();
  assert.deepEqual(stored.reviewerIds.map(String), expectedIds);
  assert.equal(stored.userId.toString(), owner.id);
  const deadline = Date.now() + 5000;
  let logs;
  do {
    logs = await AuditLog.find(query).sort({ _id: 1 }).lean();
    if (logs.length >= previousCount + 1) break;
    await new Promise(resolve => setImmediate(resolve));
  } while (Date.now() < deadline);
  assert.equal(logs.length, previousCount + 1, 'Each successful assignment must persist one audit record');
  const audit = logs[logs.length - 1];
  assert.equal(audit.user.toString(), admin.id);
  assert.equal(audit.resource, 'Document');
  assert.equal(audit.status, 'SUCCESS');
  assert.deepEqual(audit.details, { reviewerIds: expectedIds });
}

test('anonymous, owner, and reviewer cannot change assignments or audit logs', async () => {
  const document = await fixture([secondReviewer._id]);
  for (const [actor, status, code] of [
    [null, 401, 'NO_TOKEN'], [owner, 403, 'FORBIDDEN_ROLE'],
    [reviewer, 403, 'FORBIDDEN_ROLE'], [secondReviewer, 403, 'FORBIDDEN_ROLE']
  ]) {
    await deniedWithoutWrites(`/${document.id}/reviewers`, 'PUT', { reviewerIds: [reviewer.id] }, actor, status, code);
  }
});

test('admin assigns active reviewers, replaces assignments, normalizes exact duplicates, and clears with audit', async () => {
  const document = await fixture();
  await assign(document, [reviewer.id, reviewer.id, secondReviewer.id], [reviewer.id, secondReviewer.id]);
  await assign(document, [secondReviewer.id], [secondReviewer.id]);
  await assign(document, [], []);
});

test('admin normalizes mixed-case duplicate ObjectIds before validating candidates', async () => {
  const document = await fixture();
  await assign(document, [reviewer.id, reviewer.id.toUpperCase()], [reviewer.id]);
});

for (const [name, payload] of [
  ['missing request body', () => undefined],
  ['missing reviewerIds', () => ({})],
  ['wrong property name', () => ({ ids: [reviewer.id] })],
  ['null reviewerIds', () => ({ reviewerIds: null })],
  ['string reviewerIds', () => ({ reviewerIds: reviewer.id })],
  ['object reviewerIds', () => ({ reviewerIds: { id: reviewer.id } })],
  ['malformed ID mixed with a valid reviewer', () => ({ reviewerIds: [reviewer.id, 'not-an-id'] })],
  ['empty ID', () => ({ reviewerIds: [''] })],
  ['null ID', () => ({ reviewerIds: [reviewer.id, null] })],
  ['numeric ID', () => ({ reviewerIds: [reviewer.id, 42] })],
  ['object ID', () => ({ reviewerIds: [reviewer.id, { id: reviewer.id }] })],
  ['more than 100 entries before deduplication', () => ({ reviewerIds: Array(101).fill(reviewer.id) })]
]) {
  test(`admin rejects ${name} without writes`, async () => {
    const document = await fixture([secondReviewer._id]);
    await deniedWithoutWrites(`/${document.id}/reviewers`, 'PUT', payload(), admin, 400);
  });
}

test('admin accepts the 100-entry boundary and persists one normalized assignment', async () => {
  const document = await fixture();
  await assign(document, Array(100).fill(reviewer.id), [reviewer.id]);
});

for (const [name, candidateId] of [
  ['ordinary user', () => owner.id],
  ['administrator', () => admin.id],
  ['suspended reviewer', () => suspended.id],
  ['inactive reviewer', () => inactive.id],
  ['legacy official', () => legacy.id],
  ['nonexistent user', () => new mongoose.Types.ObjectId().toString()]
]) {
  test(`admin rejects an active reviewer mixed with ${name} without partial writes`, async () => {
    const document = await fixture([secondReviewer._id]);
    await deniedWithoutWrites(`/${document.id}/reviewers`, 'PUT',
      { reviewerIds: [reviewer.id, candidateId()] }, admin, 400, 'INVALID_REVIEWERS');
  });
}

test('invalid and missing document IDs are rejected without writes', async () => {
  await fixture([secondReviewer._id]);
  await deniedWithoutWrites('/not-an-id/reviewers', 'PUT', { reviewerIds: [reviewer.id] }, admin, 400, 'INVALID_ID');
  await deniedWithoutWrites(`/${new mongoose.Types.ObjectId()}/reviewers`, 'PUT',
    { reviewerIds: [reviewer.id] }, admin, 404, 'DOCUMENT_NOT_FOUND');
});

test('suspended, inactive, and legacy official actors cannot change assignments', async () => {
  const document = await fixture([secondReviewer._id]);
  for (const [actor, code] of [[suspended, 'ACCOUNT_INACTIVE'], [inactive, 'ACCOUNT_INACTIVE'], [legacy, 'FORBIDDEN_ROLE']]) {
    await deniedWithoutWrites(`/${document.id}/reviewers`, 'PUT', { reviewerIds: [] }, actor, 403, code);
  }
});

test('assignment grants list, detail, and status access; clearing revokes all delegated access', async () => {
  const document = await fixture();
  const foreign = await fixture();
  const own = await fixture([], reviewer);
  const page = await DocumentPage.create({ documentId: document._id, pageNumber: 1, content: 'Synthetic review evidence' });
  const job = await ProcessingJob.create({ documentId: document._id, status: 'completed', progress: 100 });

  for (const actor of [null, reviewer, unassigned]) {
    for (const suffix of ['', '/status']) {
      await deniedWithoutWrites(`/${document.id}${suffix}`, 'GET', undefined, actor,
        actor ? 403 : 401, actor ? 'FORBIDDEN' : 'NO_TOKEN');
    }
  }
  await deniedWithoutWrites('/', 'GET', undefined, null, 401, 'NO_TOKEN');
  await assign(document, [reviewer.id], [reviewer.id]);

  const previous = await snapshot();
  const listed = await request('/?limit=100', 'GET', undefined, reviewer);
  assert.equal(listed.status, 200);
  const listedIds = listed.body.data.map(entry => entry._id);
  assert.ok(listedIds.includes(document.id), 'Assigned foreign documents must be listed');
  assert.ok(listedIds.includes(own.id), 'Owned documents must remain listed');
  assert.ok(!listedIds.includes(foreign.id), 'Unassigned foreign documents must not be listed');
  assert.equal(listed.body.meta.total, listedIds.length);

  for (const actor of [reviewer, owner, admin]) {
    const detail = await request(`/${document.id}`, 'GET', undefined, actor);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.document._id, document.id);
    assert.deepEqual(detail.body.data.document.reviewerIds, [reviewer.id]);
    assert.equal(detail.body.data.pages.length, 1);
    assert.equal(detail.body.data.pages[0]._id, page.id);
    assert.equal(detail.body.data.pages[0].content, page.content);
    const status = await request(`/${document.id}/status`, 'GET', undefined, actor);
    assert.equal(status.status, 200);
    assert.equal(status.body.data._id, job.id);
    assert.equal(status.body.data.documentId, document.id);
    assert.equal(status.body.data.status, 'completed');
    assert.equal(status.body.data.progress, 100);
  }
  const unassignedList = await request(`/?search=${encodeURIComponent(document.originalName)}`, 'GET', undefined, unassigned);
  assert.equal(unassignedList.status, 200);
  assert.deepEqual(unassignedList.body.data, []);
  assert.equal(unassignedList.body.meta.total, 0);
  for (const suffix of ['', '/status']) {
    await deniedWithoutWrites(`/${document.id}${suffix}`, 'GET', undefined, unassigned, 403, 'FORBIDDEN');
  }
  assert.deepEqual(await snapshot(), previous, 'Reading assigned documents must not mutate persisted data');

  await assign(document, [], []);
  const revokedList = await request(`/?search=${encodeURIComponent(document.originalName)}`, 'GET', undefined, reviewer);
  assert.equal(revokedList.status, 200);
  assert.deepEqual(revokedList.body.data, []);
  assert.equal(revokedList.body.meta.total, 0);
  for (const suffix of ['', '/status']) {
    await deniedWithoutWrites(`/${document.id}${suffix}`, 'GET', undefined, reviewer, 403, 'FORBIDDEN');
  }
});

test('assigned reviewers cannot delete documents or cascade-delete their persisted evidence', async () => {
  const document = await fixture();
  await Promise.all([
    DocumentPage.create({ documentId: document._id, pageNumber: 1, content: 'Evidence must survive' }),
    DocumentChunk.create({ documentId: document._id, pageNumber: 1, chunkIndex: 0, content: 'Indexed evidence must survive' }),
    ProcessingJob.create({ documentId: document._id, status: 'completed', progress: 100 }),
    ExtractedRecord.create({ documentId: document._id, parameter: 'Coal Production', value: '7', originalValue: '7', unit: 't' })
  ]);
  await assign(document, [reviewer.id], [reviewer.id]);
  for (const actor of [null, reviewer, unassigned]) {
    await deniedWithoutWrites(`/${document.id}`, 'DELETE', undefined, actor,
      actor ? 403 : 401, actor ? 'FORBIDDEN' : 'NO_TOKEN');
  }
});