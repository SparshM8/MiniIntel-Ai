const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { MongoMemoryReplSet } = require('mongodb-memory-server-core');
const Document = require('../../models/Document');
const DocumentPage = require('../../models/DocumentPage');
const ProcessingJob = require('../../models/ProcessingJob');
const { claimJob, renewLease, publishResult, saveQueuedDocument, requeueDocument, failJob,
  expireExhaustedJob } = require('../../services/processingQueue');
let database;

before(async () => {
  database = await MongoMemoryReplSet.create({ binary: { version: '7.0.14', checkMD5: true },
    replSet: { count: 1, ip: '127.0.0.1', storageEngine: 'wiredTiger' } });
  await mongoose.connect(database.getUri());
  await Promise.all([Document.init(), DocumentPage.init(), ProcessingJob.init()]);
});

after(async () => {
  await mongoose.disconnect();
  if (database) await database.stop();
});

test('extraction preserves old evidence on provider, empty-output and publication failures', async () => {
  const Record = require('../../models/ExtractedRecord');
  const llm = require('../../services/llmService');
  const { extractFromDocument } = require('../../services/extractionService');
  const originalCall = llm.callLLM;
  const originalSave = Record.prototype.save;
  const document = await Document.create({ filename: 'extraction.csv', originalName: 'extraction.csv',
    mimeType: 'text/csv', fileSize: 7, fileType: 'csv', status: 'completed' });
  await DocumentPage.create([
    { documentId: document._id, pageNumber: 1, content: 'Production 0 tonnes' },
    { documentId: document._id, pageNumber: 2, content: 'Dispatch 12 tonnes' }
  ]);
  const previous = await Record.create({ documentId: document._id, parameter: 'Previous production', value: '9', status: 'approved' });
  const assertPreserved = async () => {
    const records = await Record.find({ documentId: document._id });
    assert.equal(records.length, 1);
    assert.equal(records[0].id, previous.id);
    assert.equal(records[0].status, 'approved');
    assert.equal((await Document.findById(document._id)).status, 'completed');
  };
  const validResponse = { records: [{ parameter: 'Coal Production', value: 0, unit: 'tonnes', confidenceScore: 0 }] };
  try {
    let calls = 0;
    llm.callLLM = async () => {
      if (++calls === 2) throw new Error('Provider unavailable');
      return validResponse;
    };
    await assert.rejects(extractFromDocument(document._id), /Provider unavailable/);
    await assertPreserved();
    llm.callLLM = async () => ({ records: [] });
    await assert.rejects(extractFromDocument(document._id), /could not find any measurable/);
    await assertPreserved();
    llm.callLLM = async () => validResponse;
    let writes = 0;
    Record.prototype.save = async function (options) {
      if (++writes === 2) throw new Error('Publication failed');
      return originalSave.call(this, options);
    };
    await assert.rejects(extractFromDocument(document._id), /Publication failed/);
    await assertPreserved();
    Record.prototype.save = originalSave;
    const replacement = await extractFromDocument(document._id);
    assert.equal(replacement.length, 2);
    assert.equal(await Record.countDocuments({ documentId: document._id }), 2);
    assert.equal(await Record.findById(previous._id), null);
    assert.equal(replacement[0].value, '0');
    assert.equal(replacement[0].confidenceScore, 0);
    assert.equal((await Document.findById(document._id)).status, 'extracted');
  } finally {
    llm.callLLM = originalCall;
    Record.prototype.save = originalSave;
  }
});

test('only one worker claims a job; expired workers cannot renew or publish', async () => {
  const document = await Document.create({ filename: 'queue.csv', originalName: 'queue.csv',
    mimeType: 'text/csv', fileSize: 7, fileType: 'csv' });
  await ProcessingJob.create({ documentId: document._id });
  const claims = await Promise.all(Array.from({ length: 8 }, () => claimJob()));
  const claimed = claims.filter(Boolean);
  assert.equal(claimed.length, 1);
  assert.equal(await renewLease(claimed[0]), true);
  await ProcessingJob.updateOne({ _id: claimed[0]._id }, { $set: { leaseUntil: new Date(0) } });
  const recovered = await claimJob();
  assert.equal(recovered.attempts, 2);
  assert.notEqual(recovered.leaseToken, claimed[0].leaseToken);
  assert.equal(await renewLease(claimed[0]), false);
  const result = { category: 'Production', text: 'mine,42', pages: [] };
  await assert.rejects(publishResult(claimed[0], result), /lease lost/);
  assert.equal((await Document.findById(document._id)).status, 'pending');
  await publishResult(recovered, result);
  assert.equal((await Document.findById(document._id)).extractedText, 'mine,42');
  assert.equal((await ProcessingJob.findById(recovered._id)).status, 'completed');
  assert.equal(await claimJob(), null);
});

test('failure preserves existing pages and explicit retry resets attempts without duplicate jobs', async () => {
  const document = new Document({ filename: 'retry.csv', originalName: 'retry.csv',
    mimeType: 'text/csv', fileSize: 7, fileType: 'csv', extractedText: 'previous text' });
  await saveQueuedDocument(document);
  await DocumentPage.create({ documentId: document._id, pageNumber: 1, content: 'previous text' });
  const job = await claimJob();
  await assert.rejects(requeueDocument(document._id), /already queued/);
  await failJob(job, new Error('Provider unavailable'));
  assert.equal((await Document.findById(document._id)).status, 'failed');
  assert.equal((await DocumentPage.findOne({ documentId: document._id })).content, 'previous text');
  await requeueDocument(document._id);
  assert.equal(await ProcessingJob.countDocuments({ documentId: document._id }), 1);
  const retry = await claimJob();
  assert.equal(retry.attempts, 1);
  await ProcessingJob.updateOne({ _id: retry._id }, { $set: { attempts: 3, leaseUntil: new Date(0) } });
  assert.equal(await claimJob(), null);
  await expireExhaustedJob();
  assert.equal((await ProcessingJob.findById(retry._id)).status, 'failed');
});

test('invalid pages roll back publication and retain previous document text and job ownership', async () => {
  const document = new Document({ filename: 'rollback.csv', originalName: 'rollback.csv',
    mimeType: 'text/csv', fileSize: 7, fileType: 'csv', extractedText: 'previous text' });
  await saveQueuedDocument(document);
  const job = await claimJob();
  await assert.rejects(publishResult(job, { category: 'Production', text: 'new text', pages: [{}] }));
  assert.equal((await Document.findById(document._id)).extractedText, 'previous text');
  assert.equal((await ProcessingJob.findById(job._id)).status, 'processing');
  await failJob(job, new Error('Invalid output'));
});

test('worker resumes a persisted queue and contains parser failures without destroying old output', async () => {
  const { runOnce } = require('../../services/processingWorker');
  const document = new Document({ filename: 'worker.csv', originalName: 'worker.csv',
    mimeType: 'text/csv', fileSize: 7, fileType: 'csv' });
  await saveQueuedDocument(document);
  let enriched = 0;
  assert.equal(await runOnce({
    process: async (documentId, progress) => {
      assert.equal(String(documentId), document.id);
      await progress('Classifying document', 80);
      return { category: 'Production', text: 'mine,42', pages: [
        { documentId, pageNumber: 1, content: 'mine,42' }
      ] };
    }, enrich: async () => { enriched += 1; }
  }), true);
  assert.equal(enriched, 1);
  assert.equal((await Document.findById(document._id)).status, 'completed');
  await requeueDocument(document._id);
  await runOnce({ process: async () => { throw new Error('Missing source file'); },
    enrich: async () => { enriched += 1; } });
  assert.equal(enriched, 1);
  assert.equal((await Document.findById(document._id)).status, 'failed');
  assert.equal((await DocumentPage.findOne({ documentId: document._id })).content, 'mine,42');
  assert.equal(await runOnce(), false);
});

test('real heartbeat renews a pending parser lease and prevents competing claims', { timeout: 65000 }, async () => {
  const document = new Document({ filename: 'heartbeat.csv', originalName: 'heartbeat.csv',
    mimeType: 'text/csv', fileSize: 7, fileType: 'csv' });
  await saveQueuedDocument(document);
  await require('../../services/processingWorker').runOnce({
    process: async () => {
      const claimed = await ProcessingJob.findOne({ documentId: document._id }).lean();
      const changes = ProcessingJob.watch([{ $match: {
        'documentKey._id': claimed._id, operationType: 'update',
        'updateDescription.updatedFields.leaseUntil': { $exists: true }
      } }], { fullDocument: 'updateLookup' });
      let deadline;
      try {
        const renewed = await new Promise((resolve, reject) => {
          deadline = setTimeout(() => reject(new Error('Heartbeat was not observed')), 55000);
          changes.once('change', resolve);
          changes.once('error', reject);
        });
        assert.equal(renewed.fullDocument.leaseToken, claimed.leaseToken);
        assert.ok(renewed.fullDocument.leaseUntil.getTime() > claimed.leaseUntil.getTime() + 30000);
        assert.equal(await claimJob(), null);
      } finally {
        clearTimeout(deadline);
        await changes.close();
      }
      return { category: 'Production', text: 'heartbeat completed', pages: [] };
    }, enrich: async () => {}
  });
  const completed = await ProcessingJob.findOne({ documentId: document._id });
  assert.equal(completed.status, 'completed', completed.error);
});

test('worker cannot publish stale output after another worker takes over its lease', async () => {
  const document = new Document({ filename: 'takeover.csv', originalName: 'takeover.csv',
    mimeType: 'text/csv', fileSize: 7, fileType: 'csv' });
  await saveQueuedDocument(document);
  let enriched = false;
  await require('../../services/processingWorker').runOnce({
    process: async () => {
      await ProcessingJob.updateOne({ documentId: document._id }, { $set: { leaseUntil: new Date(0) } });
      const winner = await claimJob();
      await publishResult(winner, { category: 'Production', text: 'winning output', pages: [] });
      return { category: 'Production', text: 'stale output', pages: [] };
    }, enrich: async () => { enriched = true; }
  });
  assert.equal(enriched, false);
  assert.equal((await Document.findById(document._id)).extractedText, 'winning output');
  assert.equal((await ProcessingJob.findOne({ documentId: document._id })).status, 'completed');
});

test('timed-out parser preserves output and the same worker handles the next queued job', async () => {
  const { Worker } = require('node:worker_threads');
  const { runTask } = require('../../services/processingTask');
  const { runOnce } = require('../../services/processingWorker');
  const document = new Document({ filename: 'hung.csv', originalName: 'hung.csv',
    mimeType: 'text/csv', fileSize: 7, fileType: 'csv', extractedText: 'previous text' });
  await saveQueuedDocument(document);
  await DocumentPage.create({ documentId: document._id, pageNumber: 1, content: 'previous text' });
  let thread;
  let enriched = false;
  await runOnce({ process: async () => {
    thread = new Worker('while (true) {}', { eval: true });
    return runTask(thread, { timeoutMs: 100 });
  }, enrich: async () => { enriched = true; } });
  assert.equal(thread.threadId, -1);
  assert.equal(enriched, false);
  const failed = await ProcessingJob.findOne({ documentId: document._id });
  assert.equal(failed.status, 'failed');
  assert.match(failed.error, /deadline/);
  assert.equal(failed.leaseUntil, undefined);
  assert.equal((await Document.findById(document._id)).extractedText, 'previous text');
  assert.equal((await DocumentPage.findOne({ documentId: document._id })).content, 'previous text');
  await requeueDocument(document._id);
  await runOnce({ process: async () => ({ category: 'Production', text: 'recovered', pages: [] }),
    enrich: async () => {} });
  assert.equal((await Document.findById(document._id)).extractedText, 'recovered');
});

test('default isolated processing propagates a missing source failure to the queue', async () => {
  const document = new Document({ filename: `missing-${new mongoose.Types.ObjectId()}.csv`, originalName: 'missing.csv',
    mimeType: 'text/csv', fileSize: 7, fileType: 'csv' });
  await saveQueuedDocument(document);
  await require('../../services/processingWorker').runOnce({ enrich: async () => {} });
  const failed = await ProcessingJob.findOne({ documentId: document._id });
  assert.equal(failed.status, 'failed');
  assert.match(failed.error, /ENOENT/);
});

test('fresh worker recovers after the claiming process exits unexpectedly', async () => {
  const document = new Document({ filename: 'crash.csv', originalName: 'crash.csv',
    mimeType: 'text/csv', fileSize: 7, fileType: 'csv' });
  await saveQueuedDocument(document);
  const child = spawn(process.execPath, ['-e', `
    const mongoose = require('mongoose');
    (async () => {
      await mongoose.connect(process.env.QUEUE_TEST_URI);
      const job = await require('./services/processingQueue').claimJob();
      if (!job) process.exit(2);
      process.exit(17);
    })().catch(() => process.exit(3));
  `], { cwd: path.resolve(__dirname, '../..'), env: { ...process.env, QUEUE_TEST_URI: database.getUri() }, stdio: 'ignore' });
  const [code] = await once(child, 'exit');
  assert.equal(code, 17);
  const crashed = await ProcessingJob.findOne({ documentId: document._id });
  assert.equal(crashed.status, 'processing');
  assert.equal(await claimJob(), null);
  await ProcessingJob.updateOne({ _id: crashed._id }, { $set: { leaseUntil: new Date(0) } });
  await require('../../services/processingWorker').runOnce({
    process: async () => ({ category: 'Production', text: 'recovered', pages: [] }), enrich: async () => {}
  });
  assert.equal((await ProcessingJob.findById(crashed._id)).attempts, 2);
  assert.equal((await Document.findById(document._id)).extractedText, 'recovered');
});

test('v1 and legacy uploads persist queued work, reject active reprocessing, and retry failures', async () => {
  const jwt = require('jsonwebtoken');
  const User = require('../../models/User');
  const secret = require('node:crypto').randomUUID();
  const originalSecret = process.env.JWT_SECRET;
  const originalDirectory = process.env.UPLOAD_DIR;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mineintel-queue-'));
  process.env.JWT_SECRET = secret;
  process.env.UPLOAD_DIR = directory;
  let server;
  try {
    const owner = await User.create({ username: 'queue-owner', password: 'unused', role: 'user' });
    const app = require('express')();
    app.use('/api/v1/documents', require('../../routes/api/v1/documents'));
    app.use('/api/documents', require('../../routes/documents'));
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const headers = { Authorization: `Bearer ${jwt.sign({ id: owner.id }, secret)}` };
    for (const route of ['/api/v1/documents/upload', '/api/documents/upload', '/api/documents/upload-batch']) {
      const form = new FormData();
      form.append(route.endsWith('batch') ? 'files' : 'file',
        new Blob([`mine,${route}`], { type: 'text/csv' }), 'queued.csv');
      const response = await fetch(base + route, { method: 'POST', headers, body: form });
      assert.equal(response.status, 201);
      const body = await response.json();
      const uploaded = body.data || body.results?.[0].document || body;
      const documentId = uploaded._id;
      const queued = await ProcessingJob.findOne({ documentId });
      assert.equal(queued.status, 'queued');
      assert.equal(queued.attempts, 0);
      const busy = await fetch(`${base}/api/v1/documents/${documentId}/reprocess`, { method: 'POST', headers });
      assert.equal(busy.status, 409);
      const job = await claimJob();
      await failJob(job, new Error('Test parser failure'));
      const retry = await fetch(`${base}/api/documents/${documentId}/retry`, { method: 'POST', headers });
      assert.equal(retry.status, 200);
      assert.equal(await ProcessingJob.countDocuments({ documentId }), 1);
      await failJob(await claimJob(), new Error('Test cleanup'));
    }
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (originalSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originalSecret;
    if (originalDirectory === undefined) delete process.env.UPLOAD_DIR; else process.env.UPLOAD_DIR = originalDirectory;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});