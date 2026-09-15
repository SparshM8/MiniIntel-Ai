// Shared persistence mapping keeps optional parser evidence through ingestion.
function toDocumentPageRecord(documentId, page) {
  const record = {
    documentId, pageNumber: page.pageNumber,
    content: page.content, wordCount: page.wordCount
  };
  if (page.sourceKind) record.sourceKind = page.sourceKind;
  if (page.spreadsheet) record.spreadsheet = page.spreadsheet;
  return record;
}
module.exports = { toDocumentPageRecord };
