const mongoose = require('mongoose');

const cellSchema = new mongoose.Schema({
  address: { type: String, required: true },
  cellType: String,
  rawValue: mongoose.Schema.Types.Mixed,
  formattedText: String,
  numberFormat: String,
  formula: String,
  valueOrigin: { type: String, enum: ['literal', 'cached_formula_result', 'missing_formula_cache'] }
}, { _id: false });

const spreadsheetSchema = new mongoose.Schema({
  sheetName: { type: String, required: true },
  cells: [cellSchema],
  mergedRanges: [{ _id: false, startRow: Number, startColumn: Number, endRow: Number, endColumn: Number }],
  omittedCells: Number,
  omittedMergedRanges: Number,
  truncated: Boolean
}, { _id: false });

const documentPageSchema = new mongoose.Schema({
  documentId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Document', 
    required: true, 
    index: true 
  },
  pageNumber: { type: Number, required: true },
  sourceKind: { type: String, enum: ['spreadsheet_sheet', 'csv_sheet'] },
  spreadsheet: { type: spreadsheetSchema, default: undefined },
  content: { type: String, default: '' },
  wordCount: { type: Number, default: 0 }
});

module.exports = mongoose.model('DocumentPage', documentPageSchema);
