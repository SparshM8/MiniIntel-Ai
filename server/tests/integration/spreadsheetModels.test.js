const test = require('node:test');

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const xlsx = require('xlsx');
const mongoose = require('mongoose');
const DocumentPage = require('../../models/DocumentPage');
const ExtractedRecord = require('../../models/ExtractedRecord');
const { extractExcelText, extractCsvText } = require('../../services/excelService');
const { toDocumentPageRecord } = require('../../utils/documentPageRecord');
const { buildCellReference } = require('../../utils/cellReference');
const { recordSource } = require('../../utils/recordSource');

async function workbookFixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mineintel-fixture-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const workbook = xlsx.utils.book_new();
  const sheet = xlsx.utils.aoa_to_sheet([
    ['Coal Production', null, null], ['Actual', 0, 100], ['Identifier', '0012', false]
  ]);
  sheet.B2.z = '0.00';
  sheet.D2 = { t: 'n', f: 'B2+C2', v: 100 };
  sheet.E2 = { t: 'n', f: 'B2+C2' };
  sheet['!ref'] = 'A1:E3';
  sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
  xlsx.utils.book_append_sheet(workbook, {}, 'Empty');
  xlsx.utils.book_append_sheet(workbook, sheet, 'Production');
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([['Other', 9]]), 'Other');
  const filename = path.join(directory, 'synthetic.xlsx');
  xlsx.writeFile(workbook, filename);
  return { directory, filename };
}

test('real XLSX round trip preserves typed values, formatting, formulas, and merges', async (t) => {
  const { filename } = await workbookFixture(t);
  const { pages } = await extractExcelText(filename);
  assert.deepEqual(pages.map(p => p.spreadsheet.sheetName), ['Production', 'Other']);
  assert.equal(pages[0].pageNumber, 2);
  const cells = pages[0].spreadsheet.cells;
  assert.equal(cells.find(c => c.address === 'B2').rawValue, 0);
  assert.equal(cells.find(c => c.address === 'B2').formattedText, '0.00');
  assert.equal(cells.find(c => c.address === 'B3').rawValue, '0012');
  assert.equal(cells.find(c => c.address === 'C3').rawValue, false);
  assert.equal(cells.find(c => c.address === 'D2').formula, 'B2+C2');
  assert.equal(cells.find(c => c.address === 'D2').valueOrigin, 'cached_formula_result');
  assert.equal(cells.find(c => c.address === 'E2').valueOrigin, 'missing_formula_cache');
  assert.deepEqual(pages[0].spreadsheet.mergedRanges, [{ startRow: 1, startColumn: 1, endRow: 1, endColumn: 3 }]);
});

test('real CSV parser preserves leading zeros and quoted fields', async (t) => {
  const { directory } = await workbookFixture(t);
  const filename = path.join(directory, 'synthetic.csv');
  await fs.writeFile(filename, 'Identifier,Description,Value\n0012,"Mine, A",0\n');
  const { pages } = await extractCsvText(filename);
  const cells = pages[0].spreadsheet.cells;
  assert.equal(cells.find(c => c.address === 'A2').rawValue, '0012');
  assert.equal(cells.find(c => c.address === 'B2').rawValue, 'Mine, A');
  assert.equal(cells.find(c => c.address === 'C2').rawValue, '0');
});

test('real Mongoose validation preserves page evidence and fact references', async (t) => {
  const { filename } = await workbookFixture(t);
  const { pages } = await extractExcelText(filename);
  const documentId = new mongoose.Types.ObjectId();
  const page = new DocumentPage(toDocumentPageRecord(documentId, pages[0]));
  await page.validate();
  const reference = buildCellReference(page, { sheetName: 'Production', cellAddress: 'B2' }, '0');
  assert.equal(reference.status, 'value_matched');
  const fact = new ExtractedRecord({ documentId, parameter: 'Coal Production', value: 0,
    period: 'FY 2025-26', unit: 'tonnes', cellReference: reference });
  await fact.validate();
  assert.equal(fact.value, '0');
  assert.equal(fact.factMetadata.reportingPeriod.key, 'FY:2025-2026');
  assert.equal(fact.cellReference.cellAddress, 'B2');
  const hydrated = ExtractedRecord.hydrate(fact.toObject());
  hydrated.value = '10';
  await hydrated.validate();
  assert.equal(recordSource(hydrated).cellReference.reason, 'record_value_changed');
  assert.equal(page.toObject().spreadsheet.cells.find(c => c.address === 'C3').rawValue, false);
});

test('real Mongoose validates legacy records without backfill and refreshes edited periods', async () => {
  const fact = ExtractedRecord.hydrate({ _id: new mongoose.Types.ObjectId(), documentId: new mongoose.Types.ObjectId(),
    parameter: 'Coal Production', period: '2025', value: '10' });
  await fact.validate();
  assert.equal(fact.factMetadata, undefined);
  fact.period = 'CY 2025';
  await fact.validate();
  assert.equal(fact.factMetadata.reportingPeriod.key, 'CY:2025');
});

test('real Mongoose rejects invalid optional enum values', async () => {
  const fact = new ExtractedRecord({ documentId: new mongoose.Types.ObjectId(), parameter: 'Coal Production',
    publicationStatus: 'approved', cellReference: { kind: 'spreadsheet_sheet', status: 'verified' } });
  await assert.rejects(fact.validate(), error => Boolean(error.errors.publicationStatus && error.errors['cellReference.status']));
});
