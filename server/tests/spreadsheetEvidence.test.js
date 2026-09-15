const test = require('node:test');

const assert = require('node:assert/strict');
const { collectSpreadsheetEvidence: collect, MAX_CELLS, MAX_EVIDENCE_BYTES } = require('../utils/spreadsheetEvidence');
const { extractExcelText, extractCsvText } = require('../services/excelService');
const { toDocumentPageRecord } = require('../utils/documentPageRecord');

const fixture = () => ({
  A1: { t: 's', v: 'Production' }, B2: { t: 'n', v: 0, w: '0.00', z: '0.00' },
  C2: { t: 'n', v: 42, f: 'SUM(B2:B3)' }, D2: { t: 'n', f: 'SUM(A2:A3)' },
  E2: { t: 'b', v: false }, F2: { t: 'z' }, G2: { t: 'e', v: 7, w: '#DIV/0!' },
  '!ref': 'A1:G2', '!merges': [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }]
});
test('preserves addresses, raw zero, formatting, booleans, and error types', () => {
  const evidence = collect('Production', fixture());
  assert.equal(evidence.sheetName, 'Production');
  assert.equal(evidence.cells.find(c => c.address === 'B2').rawValue, 0);
  assert.equal(evidence.cells.find(c => c.address === 'B2').formattedText, '0.00');
  assert.equal(evidence.cells.find(c => c.address === 'E2').rawValue, false);
  assert.equal(evidence.cells.find(c => c.address === 'G2').cellType, 'e');
  assert.ok(!evidence.cells.some(c => c.address === 'F2'));
});
test('distinguishes cached formula results from missing caches without evaluation', () => {
  const cells = collect('Sheet1', fixture()).cells;
  assert.equal(cells.find(c => c.address === 'C2').valueOrigin, 'cached_formula_result');
  assert.equal(cells.find(c => c.address === 'D2').rawValue, null);
  assert.equal(cells.find(c => c.address === 'D2').valueOrigin, 'missing_formula_cache');
});
test('preserves merged ranges without propagating anchor values', () => {
  const result = collect('Sheet1', fixture());
  assert.deepEqual(result.mergedRanges, [{ startRow: 1, startColumn: 1, endRow: 1, endColumn: 3 }]);
  assert.ok(!result.cells.some(c => c.address === 'B1'));
});
test('handles sparse dimensions without synthesizing blank cells', () => {
  const result = collect('Sparse', { '!ref': 'A1:XFD1048576', XFD1048576: { t: 's', v: 'end' } });
  assert.equal(result.cells.length, 1);
});
test('does not mutate worksheet input', () => {
  const sheet = fixture();
  const before = JSON.stringify(sheet);
  collect('Sheet1', sheet);
  assert.equal(JSON.stringify(sheet), before);
});
test('cell limit exposes omitted evidence', () => {
  const sheet = {};
  for (let i = 1; i <= MAX_CELLS + 1; i++) sheet[`A${i}`] = { t: 'n', v: i };
  const result = collect('Large', sheet);
  assert.equal(result.cells.length, MAX_CELLS);
  assert.equal(result.omittedCells, 1);
  assert.equal(result.truncated, true);
});
test('byte limit omits oversized cells rather than silently truncating values', () => {
  const result = collect('Large', { A1: { t: 's', v: 'x'.repeat(MAX_EVIDENCE_BYTES + 1) } });
  assert.equal(result.cells.length, 0);
  assert.equal(result.omittedCells, 1);
});
function adapter(workbook, render) {
  return { readFile: () => workbook, utils: { sheet_to_csv: render } };
}
test('multi-sheet service preserves legacy text and typed sheet evidence', async () => {
  const sheet = fixture();
  const workbook = { SheetNames: ['Empty', 'Production'], Sheets: { Empty: {}, Production: sheet } };
  const result = await extractExcelText('synthetic.xlsx', adapter(workbook, s => s === sheet ? 'Production,42' : ''));
  assert.equal(result.pages.length, 1);
  assert.equal(result.pages[0].pageNumber, 2);
  assert.equal(result.pages[0].sourceKind, 'spreadsheet_sheet');
  assert.equal(result.pages[0].content, 'Sheet: Production\n\nProduction,42');
  assert.equal(result.pages[0].spreadsheet.cells.length, 6);
});
test('formula-only sheets are retained even if rendered text is empty', async () => {
  const workbook = { SheetNames: ['Formulas'], Sheets: { Formulas: { A1: { t: 'n', f: '1+1' } } } };
  const result = await extractExcelText('formula.xlsx', adapter(workbook, () => ''));
  assert.equal(result.pages.length, 1);
  assert.equal(result.pages[0].spreadsheet.cells[0].rawValue, null);
});
test('CSV reader requests raw text to retain leading zeros', async () => {
  const xlsx = adapter({ SheetNames: ['Sheet1'], Sheets: { Sheet1: { A1: { t: 's', v: '0012' } } } }, () => '0012');
  const originalRead = xlsx.readFile;
  xlsx.readFile = (_path, options) => { assert.equal(options.raw, true); return originalRead(); };
  const result = await extractCsvText('synthetic.csv', xlsx);
  assert.equal(result.pages[0].spreadsheet.cells[0].rawValue, '0012');
  assert.equal(result.pages[0].sourceKind, 'csv_sheet');
});
test('persistence mapping preserves evidence and document reference', () => {
  const spreadsheet = collect('Production', fixture());
  const result = toDocumentPageRecord('doc-1', { pageNumber: 1, content: 'text', wordCount: 1, sourceKind: 'spreadsheet_sheet', spreadsheet });
  assert.equal(result.documentId, 'doc-1');
  assert.equal(result.spreadsheet, spreadsheet);
  assert.equal(result.sourceKind, 'spreadsheet_sheet');
});
test('non-spreadsheet page mapping remains unchanged', () => {
  assert.deepEqual(toDocumentPageRecord('doc-1', { pageNumber: 2, content: 'PDF', wordCount: 1 }),
    { documentId: 'doc-1', pageNumber: 2, content: 'PDF', wordCount: 1 });
});
