const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

function processingTimeout() {
  const value = process.env.PROCESSING_TIMEOUT_MS;
  const timeout = value === undefined ? DEFAULT_TIMEOUT_MS : Number(value);
  if (!Number.isSafeInteger(timeout) || timeout < 1000 || timeout > 60 * 60 * 1000) {
    throw new Error('PROCESSING_TIMEOUT_MS must be an integer between 1000 and 3600000');
  }
  return timeout;
}

function runTask(worker, { timeoutMs, onProgress = async () => {} }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let result;
    let receivedResult = false;
    let failure;
    const finish = async error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        await worker.terminate();
      } catch (terminationError) {
        error = error || terminationError;
      }
      if (error) reject(error); else resolve(result);
    };
    const timer = setTimeout(() => {
      void finish(new Error(`Document processing exceeded ${timeoutMs}ms deadline`));
    }, timeoutMs);
    worker.on('message', async message => {
      if (settled) return;
      if (message.type === 'progress') {
        try {
          await onProgress(message.step, message.progress);
          if (!settled) worker.postMessage({ type: 'ack', id: message.id });
        } catch (error) {
          void finish(error);
        }
      } else if (message.type === 'result') {
        result = message.result;
        receivedResult = true;
        void finish();
      } else if (message.type === 'failure') {
        void finish(new Error(message.error));
      }
    });
    worker.once('error', error => { failure = error; });
    worker.once('exit', code => {
      void finish(failure || (code !== 0 || !receivedResult ? new Error('Processing task exited without a result') : undefined));
    });
  });
}

async function processInThread(documentId, onProgress) {
  const timeoutMs = processingTimeout();
  const document = await require('../models/Document').findById(documentId).lean();
  if (!document) throw new Error('Document not found');
  const worker = new Worker(__filename, { workerData: {
    document: { _id: String(document._id), filename: document.filename, fileType: document.fileType }
  } });
  return runTask(worker, { timeoutMs, onProgress });
}

if (!isMainThread && workerData?.document) {
  let sequence = 0;
  const updateProgress = (step, progress) => new Promise(resolve => {
    const id = ++sequence;
    const acknowledge = message => {
      if (message.type !== 'ack' || message.id !== id) return;
      parentPort.off('message', acknowledge);
      resolve();
    };
    parentPort.on('message', acknowledge);
    parentPort.postMessage({ type: 'progress', id, step, progress });
  });
  Promise.resolve().then(() => require('./processingService').processDocumentFromRecord(workerData.document, updateProgress))
    .then(result => parentPort.postMessage({ type: 'result', result }))
    .catch(error => parentPort.postMessage({ type: 'failure', error: error.message }));
}

module.exports = { processingTimeout, runTask, processInThread };