const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const ProcessingJob = require('../models/ProcessingJob');
const Document = require('../models/Document');
const DocumentPage = require('../models/DocumentPage');

const LEASE_MS = 120000;
const MAX_ATTEMPTS = 3;

function ownership(job, now = new Date()) {
  return { _id: job._id, status: 'processing', leaseToken: job.leaseToken, leaseUntil: { $gt: now } };
}

async function claimJob() {
  const now = new Date();
  return ProcessingJob.findOneAndUpdate({
    $and: [
      { $or: [{ status: 'queued' }, { status: 'processing', leaseUntil: { $lte: now } },
        { status: 'processing', leaseUntil: { $exists: false } }] },
      { $or: [{ attempts: { $lt: MAX_ATTEMPTS } }, { attempts: { $exists: false } }] }
    ]
  }, {
    $set: { status: 'processing', leaseToken: randomUUID(), leaseUntil: new Date(now.getTime() + LEASE_MS),
      startedAt: now, progress: 0, error: '', currentStep: 'Reading file', steps: [] },
    $inc: { attempts: 1 }, $unset: { completedAt: 1 }
  }, { new: true, sort: { _id: 1 } }).lean();
}

async function renewLease(job) {
  const result = await ProcessingJob.updateOne(ownership(job), {
    $set: { leaseUntil: new Date(Date.now() + LEASE_MS) }
  });
  return result.matchedCount === 1;
}

async function publishResult(job, result) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const claimed = await ProcessingJob.updateOne(ownership(job), {
        $set: { status: 'completed', progress: 100, completedAt: new Date(), currentStep: 'Completed', error: '' },
        $unset: { leaseToken: 1, leaseUntil: 1 }
      }, { session });
      if (claimed.matchedCount !== 1) throw new Error('Processing lease lost');
      const updated = await Document.updateOne({ _id: job.documentId }, { $set: {
        status: 'completed', category: result.category, totalPages: result.pages.length,
        extractedText: result.text, processedAt: new Date(), error: ''
      } }, { session });
      if (updated.matchedCount !== 1) throw new Error('Document no longer exists');
      await DocumentPage.deleteMany({ documentId: job.documentId }, { session });
      if (result.pages.length) await DocumentPage.insertMany(result.pages, { session });
    });
  } finally {
    await session.endSession();
  }
}

async function saveQueuedDocument(document) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await document.save({ session });
      await ProcessingJob.create([{ documentId: document._id, status: 'queued' }], { session });
    });
  } finally {
    await session.endSession();
  }
}

async function requeueDocument(documentId) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const job = await ProcessingJob.findOne({ documentId }).session(session);
      if (job && ['queued', 'processing'].includes(job.status)) {
        const error = new Error('Document already queued or processing');
        error.statusCode = 409;
        throw error;
      }
      await ProcessingJob.updateOne({ documentId }, {
        $set: { status: 'queued', progress: 0, currentStep: '', steps: [], attempts: 0, error: '' },
        $unset: { leaseToken: 1, leaseUntil: 1, completedAt: 1, startedAt: 1 }
      }, { session, upsert: true });
      const updated = await Document.updateOne({ _id: documentId }, { $set: { status: 'pending', error: '' } }, { session });
      if (!updated.matchedCount) throw new Error('Document no longer exists');
    });
  } finally {
    await session.endSession();
  }
}

async function failJob(job, error, expired = false) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const filter = expired
        ? { _id: job._id, status: 'processing', leaseToken: job.leaseToken, leaseUntil: { $lte: new Date() }, attempts: { $gte: MAX_ATTEMPTS } }
        : ownership(job);
      const updated = await ProcessingJob.updateOne(filter, {
        $set: { status: 'failed', error: String(error.message).slice(0, 1000), completedAt: new Date() },
        $unset: { leaseToken: 1, leaseUntil: 1 }
      }, { session });
      if (!updated.matchedCount) return;
      await Document.updateOne({ _id: job.documentId }, {
        $set: { status: 'failed', error: String(error.message).slice(0, 1000) }
      }, { session });
    });
  } finally {
    await session.endSession();
  }
}

async function expireExhaustedJob() {
  const job = await ProcessingJob.findOne({ status: 'processing', leaseUntil: { $lte: new Date() },
    attempts: { $gte: MAX_ATTEMPTS } }).lean();
  if (job) await failJob(job, new Error('Processing recovery limit reached; explicit retry required'), true);
}

module.exports = { LEASE_MS, MAX_ATTEMPTS, ownership, claimJob, renewLease, publishResult,
  saveQueuedDocument, requeueDocument, failJob, expireExhaustedJob };