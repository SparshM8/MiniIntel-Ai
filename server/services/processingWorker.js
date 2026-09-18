const mongoose = require('mongoose');
const Document = require('../models/Document');
const ProcessingJob = require('../models/ProcessingJob');
const { LEASE_MS, ownership, claimJob, renewLease, publishResult, failJob, expireExhaustedJob } = require('./processingQueue');

async function updateProgress(job, currentStep, progress) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const updated = await ProcessingJob.updateOne(ownership(job), {
        $set: { currentStep, progress }
      }, { session });
      if (!updated.matchedCount) throw new Error('Processing lease lost');
      const document = await Document.updateOne({ _id: job.documentId }, {
        $set: { status: 'processing', error: '' }
      }, { session });
      if (!document.matchedCount) throw new Error('Document no longer exists');
    });
  } finally {
    await session.endSession();
  }
}

async function runOnce({ process = (...args) => require('./processingTask').processInThread(...args),
  enrich = async documentId => {
    const intelligence = require('./intelligenceService');
    const results = await Promise.allSettled([
      intelligence.extractEntities(documentId), intelligence.discoverTopics(documentId)
    ]);
    for (const result of results) {
      if (result.status === 'rejected') console.warn('Post-processing enrichment failed:', result.reason.message);
    }
  }
} = {}) {
  await expireExhaustedJob();
  const job = await claimJob();
  if (!job) return false;
  let leaseLost = false;
  let renewing = false;
  const heartbeat = setInterval(async () => {
    if (renewing || leaseLost) return;
    renewing = true;
    try {
      if (!await renewLease(job)) leaseLost = true;
    } catch {
      leaseLost = true;
    } finally {
      renewing = false;
    }
  }, LEASE_MS / 3);
  let completed = false;
  try {
    await updateProgress(job, 'Reading file', 0);
    const result = await process(job.documentId, async (step, progress) => {
      if (leaseLost) throw new Error('Processing lease lost');
      await updateProgress(job, step, progress);
    });
    if (leaseLost) throw new Error('Processing lease lost');
    await publishResult(job, result);
    completed = true;
  } catch (error) {
    await failJob(job, error);
  } finally {
    clearInterval(heartbeat);
  }
  if (completed) {
    try { await enrich(job.documentId); }
    catch (error) { console.warn('Post-processing enrichment failed:', error.message); }
  }
  return true;
}

module.exports = { runOnce };