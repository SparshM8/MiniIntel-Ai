const { parseReportedNumber } = require('./parseReportedNumber');

function recordSource(record) {
  const reference = record.cellReference;
  const spreadsheet = ['spreadsheet_sheet', 'csv_sheet'].includes(reference?.kind);
  const source = {
    recordId: record._id,
    documentId: record.documentId?._id || record.documentId,
    documentName: record.documentId?.originalName || record.documentId?.filename || null,
    pageNumber: spreadsheet ? null : (Number.isInteger(record.pageNumber) && record.pageNumber > 0 ? record.pageNumber : null)
  };
  if (spreadsheet) {
    const original = parseReportedNumber(reference.matchedValue);
    const current = parseReportedNumber(record.value);
    const matched = reference.status === 'value_matched' && Number.isFinite(original) &&
      Number.isFinite(current) && current === original;
    source.cellReference = {
      kind: reference.kind, sheetName: reference.sheetName,
      status: matched ? 'value_matched' : 'unverified',
      reason: reference.status === 'value_matched' && !matched ? 'record_value_changed' : reference.reason
    };
    if (matched) source.cellReference.cellAddress = reference.cellAddress;
  }
  return source;
}
module.exports = { recordSource };
