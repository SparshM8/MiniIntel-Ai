const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server-core');
const User = require('../../models/User');
const Document = require('../../models/Document');
const Topic = require('../../models/Topic');

const secret = randomUUID();
const originalSecret = process.env.JWT_SECRET;
const originalAdmin = process.env.ADMIN_USERNAME;
let database, server, base, owner, outsider, reviewer, admin, document;

before(async () => {
  process.env.JWT_SECRET = secret;
  process.env.ADMIN_USERNAME = 'topics-admin';
  database = await MongoMemoryServer.create({ binary: { version: '7.0.14', checkMD5: true },
    instance: { ip: '127.0.0.1', dbName: `topics_${randomUUID().replaceAll('-', '')}` } });
  await mongoose.connect(database.getUri());
  [owner, outsider, reviewer, admin] = await User.insertMany([
    { username: 'topics-owner', password: 'unused', role: 'user' },
    { username: 'topics-outsider', password: 'unused', role: 'user' },
    { username: 'topics-reviewer', password: 'unused', role: 'reviewer' },
    { username: 'topics-admin', password: 'unused', role: 'admin' }
  ]);
  document = await Document.create({ filename: 'owned.csv', originalName: 'owned.csv', mimeType: 'text/csv',
    fileSize: 1, fileType: 'csv', userId: owner._id, reviewerIds: [reviewer._id], extractedText: 'coal coal safety' });
  const hidden = await Document.create({ filename: 'private.csv', originalName: 'private.csv', mimeType: 'text/csv',
    fileSize: 1, fileType: 'csv', userId: outsider._id, extractedText: 'privategeology' });
  await Topic.create([
    { name: 'Coal', documents: [document._id, document._id, hidden._id] },
    { name: 'Private geology', documents: [hidden._id] }
  ]);
  const app = express();
  app.use(express.json());
  app.use('/api/v1/topics', require('../../routes/api/v1/topics'));
  app.use('/api/topics', require('../../routes/topics'));
  app.use('/api/v1/intelligence', require('../../routes/api/v1/intelligence'));
  app.use('/api/intelligence', require('../../routes/intelligence'));
  app.use('/api/auth', require('../../routes/auth'));
  app.use('/api/v1/auth', require('../../routes/api/v1/auth'));
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  base = `http://127.0.0.1:${server.address().port}/api/v1/topics`;
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

async function request(user) {
  const headers = user ? { Authorization: `Bearer ${jwt.sign({ id: user.id }, secret, { expiresIn: '5m' })}` } : {};
  const response = await fetch(base, { headers, signal: AbortSignal.timeout(10000) });
  return { status: response.status, body: await response.json() };
}

test('topic counts and word cloud enforce owner/reviewer/admin scope and assignment revocation', async () => {
  assert.equal((await request()).status, 401);
  const legacy = await fetch(base.replace('/api/v1/', '/api/'));
  assert.equal(legacy.status, 401);
  for (const user of [owner, reviewer]) {
    const result = await request(user);
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.meta, { topicCount: 1, analyzedDocuments: 1, processedDocuments: 1 });
    assert.equal(result.body.data[0].documentCount, 1);
    assert.equal(result.body.data[0].name, 'Coal');
    assert.ok(!JSON.stringify(result.body).includes('privategeology'));
    assert.ok(!JSON.stringify(result.body).includes('Private geology'));
    assert.equal(result.body.wordCloud.find(word => word.text === 'coal').count, 2);
  }
  const privileged = await request(admin);
  assert.equal(privileged.body.meta.processedDocuments, 2);
  assert.equal(privileged.body.data.find(topic => topic.name === 'Coal').documentCount, 2);
  assert.ok(privileged.body.wordCloud.some(word => word.text === 'privategeology'));
  await Document.updateOne({ _id: document._id }, { $set: { reviewerIds: [] } });
  const revoked = await request(reviewer);
  assert.deepEqual(revoked.body.data, []);
  assert.deepEqual(revoked.body.wordCloud, []);
  assert.equal(revoked.body.meta.processedDocuments, 0);
});

test('global analytics reject normal users and analysis rejects foreign or invalid documents', async () => {
  const headers = { Authorization: `Bearer ${jwt.sign({ id: outsider.id }, secret, { expiresIn: '5m' })}`, 'Content-Type': 'application/json' };
  for (const endpoint of ['trends', 'clusters', 'entities', 'emerging', 'changes']) {
    assert.equal((await fetch(`${base}/${endpoint}`, { headers })).status, 403);
  }
  for (const endpoint of ['analyze', 'extract']) {
    assert.equal((await fetch(`${base}/${endpoint}`, { method: 'POST', headers, body: JSON.stringify({ documentId: document.id }) })).status, 404);
    assert.equal((await fetch(`${base}/${endpoint}`, { method: 'POST', headers, body: JSON.stringify({ documentId: 'invalid' }) })).status, 400);
  }
});

test('intelligence aliases cannot bypass document and global analytics authorization', async () => {
  await Document.updateOne({ _id: document._id }, { $set: {
    reviewerIds: [reviewer._id], entities: [{ name: 'Owner Mine', type: 'Mine', mentions: 1 }]
  } });
  for (const prefix of ['/api/intelligence', '/api/v1/intelligence']) {
    const root = new URL(prefix, base).href;
    const headers = { Authorization: `Bearer ${jwt.sign({ id: outsider.id }, secret)}` };
    for (const endpoint of [`entities/${document.id}`, `similarity/${document.id}`]) {
      assert.equal((await fetch(`${root}/${endpoint}`, { headers })).status, 404, `${prefix}/${endpoint}`);
    }
    assert.equal((await fetch(`${root}/entities/invalid`, { headers })).status, 400);
    assert.equal((await fetch(`${root}/topics/trends`, { headers })).status, 403);
    for (const user of [owner, reviewer, admin]) {
      const response = await fetch(`${root}/entities/${document.id}`, {
        headers: { Authorization: `Bearer ${jwt.sign({ id: user.id }, secret)}` }
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).entities[0].name, 'Owner Mine');
    }
  }
});

test('legacy and v1 authentication preserve reviewers and deny disabled accounts and fallback tokens', async () => {
  const password = randomUUID();
  const account = await User.create({ username: 'auth-regression-reviewer', password, role: 'reviewer' });
  for (const prefix of ['/api/auth', '/api/v1/auth']) {
    const root = new URL(prefix, base).href;
    const response = await fetch(`${root}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: account.username, password }) });
    assert.equal(response.status, 200);
    assert.equal((await User.findById(account._id)).role, 'reviewer');
  }
  await User.updateOne({ _id: account._id }, { $set: { status: 'suspended' } });
  for (const prefix of ['/api/auth', '/api/v1/auth']) {
    const root = new URL(prefix, base).href;
    assert.equal((await fetch(`${root}/me`, { headers: { Authorization: `Bearer ${jwt.sign({ id: account.id }, secret)}` } })).status, 403);
    assert.equal((await fetch(`${root}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: account.username, password }) })).status, 403);
  }
  delete process.env.JWT_SECRET;
  try {
    assert.equal((await fetch(base, { headers: { Authorization: `Bearer ${jwt.sign({ id: owner.id }, 'fallback_secret')}` } })).status, 401);
    assert.throws(() => require('../../config/jwt').getJwtSecret(), /must be configured/);
  } finally { process.env.JWT_SECRET = secret; }
});

test('topic reanalysis is idempotent, removes stale links and preserves zero weight; diff includes units', async () => {
  const llm = require('../../services/llmService');
  const intelligence = require('../../services/intelligenceService');
  const Record = require('../../models/ExtractedRecord');
  const original = llm.callLLM;
  try {
    const source = await Document.create({ filename: 'trend.csv', originalName: 'trend.csv', mimeType: 'text/csv',
      fileSize: 1, fileType: 'csv', userId: owner._id, extractedText: 'production' });
    const comparison = await Document.create({ filename: 'comparison.csv', originalName: 'comparison.csv', mimeType: 'text/csv',
      fileSize: 1, fileType: 'csv', userId: owner._id, extractedText: 'production' });
    await Record.create([
      { documentId: source._id, parameter: 'Coal Production', value: '10', unit: 'tonnes', period: '2025' },
      { documentId: comparison._id, parameter: 'Coal Production', value: '10', unit: 'million tonnes', period: '2025' }
    ]);
    llm.callLLM = async () => ({ topics: [{ name: 'Idempotent Topic', keywords: ['coal'], weight: 0 }] });
    await intelligence.discoverTopics(source._id);
    await intelligence.discoverTopics(source._id);
    const topic = await Topic.findOne({ name: 'Idempotent Topic' });
    assert.equal(topic.documents.length, 1);
    assert.equal(topic.weight, 0);
    assert.equal(topic.trendData[0].count, 1);
    assert.equal(topic.trendData[0].avgWeight, 0);
    assert.equal((await intelligence.detectChanges(source._id, comparison._id)).totalChanges, 1);
    llm.callLLM = async () => ({ topics: [{ name: 'Replacement Topic', keywords: ['safety'], weight: 0.5 }] });
    await intelligence.discoverTopics(source._id);
    assert.equal(await Topic.countDocuments({ documents: source._id }), 1);
    assert.equal((await Topic.findById(topic._id)).trendData.length, 0);
  } finally { llm.callLLM = original; }
});

test('cached RAG evidence follows current owner/reviewer scope and fails closed without a user', async () => {
  const rag = require('../../services/ragService');
  const llm = require('../../services/llmService');
  const Chunk = require('../../models/DocumentChunk');
  const original = llm.generateEmbedding;
  try {
    llm.generateEmbedding = async () => [1, 0];
    await Document.updateOne({ _id: document._id }, { $set: { reviewerIds: [reviewer._id] } });
    await Chunk.create({ documentId: document._id, pageNumber: 1, chunkIndex: 0, content: 'Owner Mine coal', embedding: [1, 0] });
    const ownerEvidence = await rag.searchSimilar('coal', 5, { user: owner });
    assert.ok(ownerEvidence.length > 0);
    assert.equal((await rag.searchSimilar('coal', 5, { user: outsider })).length, 0);
    assert.ok((await rag.searchSimilar('coal', 5, { user: reviewer })).length > 0);
    await Document.updateOne({ _id: document._id }, { $set: { reviewerIds: [] } });
    assert.equal((await rag.searchSimilar('coal', 5, { user: reviewer })).length, 0);
    assert.equal((await rag.searchSimilar('coal', 5)).length, 0);
  } finally { llm.generateEmbedding = original; }
});

test('report generation retrieves scoped evidence and exports honest metrics', async () => {
  const reports = require('../../services/reportService');
  const llm = require('../../services/llmService');
  const rag = require('../../services/ragService');
  const originalSearch = rag.searchSimilar;
  const originalCall = llm.callLLM;
  const originalEmbedding = llm.generateEmbedding;
  const originalKey = process.env.LLM_API_KEY;
  try {
    process.env.LLM_API_KEY = 'mock-key-for-testing';
    llm.generateEmbedding = async () => [1, 0];
    llm.callLLM = async () => '# Evidence Report\n\nOwner Mine coal was present in the retrieved document. No production quantities were independently verified.';
    const report = await reports.generateReport({ title: 'Evidence Report', documentId: document.id }, 'production', owner._id);
    assert.equal(report.content.markdown, await llm.callLLM());
    assert.doesNotMatch(report.content.markdown, /4\.2 MT|verified operational logs/);
    assert.ok(report.content.sources.length > 0);
    assert.equal(report.metricBasis, 'retrieval-similarity-v1');
    const exported = await reports.exportReport(report.id, 'md');
    assert.match(exported.data, /Retrieval similarity/);
    assert.match(exported.data, /Accuracy not evaluated/);
    assert.doesNotMatch(exported.data, /Evidence Coverage|Confidence Score/);
    for (const score of [0, undefined, 2]) {
      rag.searchSimilar = async () => [{ documentId: document, pageNumber: 1,
        content: 'Owner Mine coal', similarityScore: score }];
      const scored = await reports.generateReport({ title: 'Score Report', documentId: document.id }, 'production', owner._id);
      assert.equal(scored.content.sources[0].similarity, score === 0 ? 0 : null);
      const markdown = await reports.exportReport(scored.id, 'md');
      assert.match(markdown.data, score === 0 ? /Retrieval similarity: 0%/ : /Retrieval similarity: N\/A/);
    }
  } finally {
    rag.searchSimilar = originalSearch;
    llm.callLLM = originalCall;
    llm.generateEmbedding = originalEmbedding;
    if (originalKey === undefined) delete process.env.LLM_API_KEY; else process.env.LLM_API_KEY = originalKey;
  }
});

test('bounded concurrent topic reads preserve authorization and complete without server errors', async context => {
  const timings = [];
  const started = performance.now();
  await Promise.all(Array.from({ length: 40 }, async (_, index) => {
    const begin = performance.now();
    const result = await request(index % 2 ? owner : outsider);
    timings.push(performance.now() - begin);
    assert.equal(result.status, 200);
    assert.ok(!JSON.stringify(result.body).includes(index % 2 ? 'privategeology' : 'Owner Mine'));
  }));
  timings.sort((first, second) => first - second);
  context.diagnostic(`Local 40-request burst: elapsed=${Math.round(performance.now() - started)}ms p95=${Math.round(timings[Math.ceil(timings.length * 0.95) - 1])}ms. Tiny ephemeral corpus; not production capacity.`);
});