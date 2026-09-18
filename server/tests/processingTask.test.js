const test = require('node:test');
const assert = require('node:assert/strict');
const { Worker } = require('node:worker_threads');
const { runTask, processingTimeout } = require('../services/processingTask');

test('deadline terminates a CPU-blocked task rather than leaving it running', async () => {
  const worker = new Worker('while (true) {}', { eval: true });
  await assert.rejects(runTask(worker, { timeoutMs: 100 }), /deadline/);
  assert.equal(worker.threadId, -1);
});

test('task acknowledges persisted progress and terminates after returning its result', async () => {
  const worker = new Worker(`
    const { parentPort } = require('node:worker_threads');
    parentPort.once('message', message => {
      if (message.type === 'ack') parentPort.postMessage({ type: 'result', result: 'parsed' });
    });
    parentPort.postMessage({ type: 'progress', id: 1, step: 'Reading', progress: 20 });
  `, { eval: true });
  const updates = [];
  const result = await runTask(worker, { timeoutMs: 5000,
    onProgress: async (step, progress) => updates.push([step, progress]) });
  assert.equal(result, 'parsed');
  assert.deepEqual(updates, [['Reading', 20]]);
  assert.equal(worker.threadId, -1);
});

test('progress rejection terminates the task and rejects its output', async () => {
  const worker = new Worker(`
    const { parentPort } = require('node:worker_threads');
    parentPort.on('message', () => {});
    parentPort.postMessage({ type: 'progress', id: 1 });
  `, { eval: true });
  await assert.rejects(runTask(worker, { timeoutMs: 5000,
    onProgress: async () => { throw new Error('Processing lease lost'); } }), /lease lost/);
  assert.equal(worker.threadId, -1);
});

test('task errors and exits without a result reject promptly', async () => {
  for (const code of ['throw new Error("parser crashed")', 'process.exit(0)']) {
    const worker = new Worker(code, { eval: true });
    await assert.rejects(runTask(worker, { timeoutMs: 5000 }), /parser crashed|without a result/);
    assert.equal(worker.threadId, -1);
  }
});

test('processing timeout is bounded and invalid configuration fails closed', () => {
  const previous = process.env.PROCESSING_TIMEOUT_MS;
  try {
    delete process.env.PROCESSING_TIMEOUT_MS;
    assert.equal(processingTimeout(), 900000);
    process.env.PROCESSING_TIMEOUT_MS = '60000';
    assert.equal(processingTimeout(), 60000);
    for (const value of ['', 'abc', '-1', '0', '1.5', '3600001']) {
      process.env.PROCESSING_TIMEOUT_MS = value;
      assert.throws(processingTimeout, /PROCESSING_TIMEOUT_MS/);
    }
  } finally {
    if (previous === undefined) delete process.env.PROCESSING_TIMEOUT_MS;
    else process.env.PROCESSING_TIMEOUT_MS = previous;
  }
});

test('production task transfers real CSV pages and ordered progress without database writes', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mineintel-thread-'));
  try {
    fs.writeFileSync(path.join(directory, 'production.csv'), 'mine,tonnes\nMine A,42');
    const worker = new Worker(`
      const { workerData } = require('node:worker_threads');
      require(workerData.llmPath).classifyDocument = async () => 'Production';
      require(workerData.taskPath);
    `, { eval: true, env: { ...process.env, UPLOAD_DIR: directory }, workerData: {
      llmPath: require.resolve('../services/llmService'), taskPath: require.resolve('../services/processingTask'),
      document: { _id: '507f1f77bcf86cd799439011', filename: 'production.csv', fileType: 'csv' }
    } });
    const progress = [];
    const result = await runTask(worker, { timeoutMs: 10000,
      onProgress: async (step, value) => progress.push(value) });
    assert.equal(result.category, 'Production');
    assert.match(result.text, /Mine A/);
    assert.equal(result.pages[0].documentId, '507f1f77bcf86cd799439011');
    assert.equal(result.pages[0].pageNumber, 1);
    assert.deepEqual(progress, [20, 60, 80, 95]);
    assert.equal(worker.threadId, -1);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});