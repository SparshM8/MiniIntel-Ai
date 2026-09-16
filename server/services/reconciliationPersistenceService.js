const crypto = require('node:crypto');
const mongoose = require('mongoose');
const Document = require('../models/Document');
const ReconciliationRecord = require('../models/ReconciliationRecord');
const { reconcile } = require('./reconciliationService');

const REVIEW_STATES = Object.freeze({ accept: 'accepted', reject: 'rejected', request_correction: 'correction_requested' });
function serviceError(code, status, message) { const error = new Error(message); error.code = code; error.status = status; return error; }
function actorId(actor) { return actor?._id?.toString?.() || actor?.id?.toString?.() || ''; }
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function payloadHash(documentId, reconciliationCase, output) {
  return crypto.createHash('sha256').update(stable({ documentId: documentId.toString(), reconciliationCase, output })).digest('hex');
}
async function authorizeDocument(documentId, actor, DocumentModel = Document) {
  const id = actorId(actor);
  if (!id) throw serviceError('AUTH_REQUIRED', 401, 'Authenticated actor is required.');
  if (!mongoose.isValidObjectId(documentId)) throw serviceError('INVALID_DOCUMENT_ID', 400, 'Document ID is invalid.');
  const document = await DocumentModel.findById(documentId).select('_id userId').lean();
  if (!document) throw serviceError('DOCUMENT_NOT_FOUND', 404, 'Document was not found.');
  if (actor.role !== 'admin' && document.userId?.toString() !== id) throw serviceError('DOCUMENT_FORBIDDEN', 403, 'Document access is forbidden.');
  return document;
}
async function createReconciliation({ documentId, reconciliationCase, actor }, dependencies = {}) {
  const DocumentModel = dependencies.DocumentModel || Document;
  const RecordModel = dependencies.RecordModel || ReconciliationRecord;
  await authorizeDocument(documentId, actor, DocumentModel);
  const output = reconcile(reconciliationCase);
  if (output.reasonCode === 'INVALID_CONTRACT') {
    const error = serviceError('INVALID_RECONCILIATION_CASE', 400, 'Reconciliation case does not satisfy the evidence contract.');
    error.issues = output.issues;
    throw error;
  }
  const hash = payloadHash(documentId, reconciliationCase, output);
  const record = { documentId, caseId: reconciliationCase?.caseId, contractVersion: reconciliationCase?.contractVersion,
    engineVersion: output.engineVersion, outcome: output.outcome, reasonCode: output.reasonCode,
    caseSnapshot: reconciliationCase, operands: output.operands, payloadHash: hash, createdBy: actorId(actor) };
  try {
    const created = await RecordModel.create(record);
    return { record: created, created: true };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const existing = await RecordModel.findOne({ documentId, caseId: record.caseId, payloadHash: hash });
    if (!existing) throw error;
    return { record: existing, created: false };
  }
}
async function appendDecision({ recordId, requestId, decision, reason, expectedVersion, actor }, dependencies = {}) {
  const RecordModel = dependencies.RecordModel || ReconciliationRecord;
  const id = actorId(actor);
  if (!id) throw serviceError('AUTH_REQUIRED', 401, 'Authenticated actor is required.');
  if (!['reviewer', 'admin'].includes(actor.role)) throw serviceError('FORBIDDEN_ROLE', 403, 'Reviewer role is required.');
  if (!mongoose.isValidObjectId(recordId)) throw serviceError('INVALID_RECORD_ID', 400, 'Record ID is invalid.');
  if (!requestId?.trim() || !REVIEW_STATES[decision] || !reason?.trim() || !Number.isInteger(expectedVersion) || expectedVersion < 0) {
    throw serviceError('INVALID_DECISION', 400, 'Decision, reason, requestId and expectedVersion are required.');
  }
  const existing = await RecordModel.findById(recordId).select('documentId decisions reviewState reviewVersion').lean();
  if (!existing) throw serviceError('RECORD_NOT_FOUND', 404, 'Reconciliation record was not found.');
  await authorizeDocument(existing.documentId, actor, dependencies.DocumentModel || Document);
  const normalizedReason = reason.trim();
  const duplicate = existing.decisions.find(item => item.requestId === requestId);
  if (duplicate) {
    if (duplicate.decision !== decision || duplicate.reason !== normalizedReason) {
      throw serviceError('IDEMPOTENCY_CONFLICT', 409, 'requestId was already used for a different decision.');
    }
    return { record: await RecordModel.findById(recordId), created: false };
  }
  const updated = await RecordModel.findOneAndUpdate({ _id: recordId, reviewVersion: expectedVersion, 'decisions.requestId': { $ne: requestId } }, {
    $set: { reviewState: REVIEW_STATES[decision] }, $inc: { reviewVersion: 1 },
    $push: { decisions: { requestId, decision, reason: normalizedReason, actor: id,
      previousState: existing.reviewState, newState: REVIEW_STATES[decision] } }
  }, { new: true, runValidators: true });
  if (!updated) {
    const current = await RecordModel.findById(recordId);
    const concurrentDuplicate = current?.decisions.find(item => item.requestId === requestId);
    if (concurrentDuplicate?.decision === decision && concurrentDuplicate.reason === normalizedReason) {
      return { record: current, created: false };
    }
    throw serviceError('STALE_REVIEW_VERSION', 409, 'Review state changed; reload before deciding.');
  }
  return { record: updated, created: true };
}

module.exports = { REVIEW_STATES, stable, payloadHash, authorizeDocument, createReconciliation, appendDecision };
