const mongoose = require('mongoose');
const { deriveFactMetadata } = require('../utils/factMetadata');

const ReportingPeriodSchema = new mongoose.Schema({
  originalLabel: String,
  status: { type: String, enum: ['resolved', 'unresolved'], required: true },
  reason: String,
  kind: { type: String, enum: ['financial_year', 'calendar_year', 'month'] },
  key: String,
  startDate: String,
  endDate: String
}, { _id: false });

const FactMetadataSchema = new mongoose.Schema({
  version: { type: Number, enum: [1], required: true },
  metricIdentity: { type: String, enum: ['coal_production', 'coal_dispatch', 'unknown'] },
  figureType: { type: String, enum: ['actual', 'target', 'unknown'] },
  reportingPeriod: ReportingPeriodSchema
}, { _id: false });

const ExtractedRecordSchema = new mongoose.Schema({
  documentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
    required: true
  },
  pageNumber: {
    type: Number
  },
  parameter: {
    type: String,
    required: true
  },
  value: {
    type: String
  },
  unit: {
    type: String
  },
    period: {
    type: String
  },
  factMetadata: { type: FactMetadataSchema, default: undefined },
  publicationStatus: {
    type: String,
    enum: ['unknown', 'provisional', 'revised', 'final']
  },
  sourceVersion: { type: String },
  extractionMethod: {
    type: String,
    enum: ['unknown', 'llm_from_document_text', 'spreadsheet', 'manual']
  },
  mineName: {
    type: String
  },
  subsidiary: {
    type: String
  },
  confidenceScore: {
    type: Number,
    min: 0,
    max: 1
  },
  sourceText: {
    type: String
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  originalValue: {
    type: String
  },
  editHistory: [{
    field: String,
    oldValue: String,
    newValue: String,
    editedAt: {
      type: Date,
      default: Date.now
    }
  }],
  linkedEvidence: [{
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document' },
    pageNumber: { type: Number },
    snippet: { type: String },
    similarity: { type: Number }
  }],
  reviewedAt: {
    type: Date
  },
  reviewedBy: {
    type: String // Alternatively, an ObjectId for a User schema
  }
}, { timestamps: true });

// Derive metadata for new facts or edited labels, not merely when old records are read.
ExtractedRecordSchema.pre('validate', function () {
  if (this.isNew || this.isModified('parameter') || this.isModified('period') || this.isModified('factMetadata')) {
    this.factMetadata = deriveFactMetadata(this.parameter, this.period);
  }
});

module.exports = mongoose.model('ExtractedRecord', ExtractedRecordSchema);
