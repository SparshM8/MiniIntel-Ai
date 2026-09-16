const mongoose = require('mongoose');


const operandSchema = new mongoose.Schema({
  factId: { type: String, required: true },
  sourceRevisionId: { type: String, required: true },
  originalValue: { type: Number, required: true },
  originalUnit: { type: String, required: true },
  normalizedValue: { type: Number, required: true },
  normalizedUnit: { type: String, required: true },
  conversionFactor: { type: Number, required: true }
}, { _id: false });

const decisionSchema = new mongoose.Schema({
  requestId: { type: String, required: true },
  decision: { type: String, enum: ['accept', 'reject', 'request_correction'], required: true },
  reason: { type: String, required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  previousState: { type: String, required: true },
  newState: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, immutable: true }
}, { _id: true });

const reconciliationRecordSchema = new mongoose.Schema({
  documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true, immutable: true },
  caseId: { type: String, required: true, immutable: true },
  contractVersion: { type: String, required: true, immutable: true },
  engineVersion: { type: String, required: true, immutable: true },
  outcome: { type: String, enum: ['matched', 'converted', 'conflict', 'incompatible', 'insufficient_evidence'], required: true, immutable: true },
  reasonCode: { type: String, required: true, immutable: true },
  caseSnapshot: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
  operands: { type: [operandSchema], default: undefined, immutable: true },
  payloadHash: { type: String, required: true, immutable: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  reviewState: { type: String, enum: ['pending', 'accepted', 'rejected', 'correction_requested'], default: 'pending' },
  reviewVersion: { type: Number, default: 0, min: 0 },
  decisions: { type: [decisionSchema], default: [] },
  createdAt: { type: Date, default: Date.now, immutable: true }
}, { minimize: false });

reconciliationRecordSchema.index({ documentId: 1, caseId: 1, payloadHash: 1 }, { unique: true });
reconciliationRecordSchema.index({ documentId: 1, createdAt: -1 });
reconciliationRecordSchema.index({ 'decisions.requestId': 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('ReconciliationRecord', reconciliationRecordSchema);
