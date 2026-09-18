const mongoose = require('mongoose');

const processingJobSchema = new mongoose.Schema({
  documentId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Document', 
    required: true
  },
  status: { 
    type: String, 
    enum: ['queued', 'processing', 'completed', 'failed'], 
    default: 'queued' 
  },
  progress: { type: Number, default: 0, min: 0, max: 100 },
  currentStep: { type: String, default: '' },
  steps: [{ 
    name: String, 
    status: { 
      type: String, 
      enum: ['pending', 'processing', 'completed', 'failed'], 
      default: 'pending' 
    } 
  }],
  startedAt: Date,
  completedAt: Date,
  leaseToken: String,
  leaseUntil: Date,
  attempts: { type: Number, default: 0, min: 0 },
  error: { type: String, default: '' }
});

processingJobSchema.index({ documentId: 1 }, { unique: true, name: 'processing_document_unique' });
processingJobSchema.index({ status: 1, leaseUntil: 1 });

module.exports = mongoose.model('ProcessingJob', processingJobSchema);
