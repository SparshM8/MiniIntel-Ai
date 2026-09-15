const test = require('node:test');

const assert = require('node:assert/strict');
const { buildCellReference: build, cellEvidencePrompt } = require('../utils/cellReference');
const { recordSource } = require('../utils/recordSource');
const { calculateProductionMetrics } = require('../services/productionCalculationService');
const page = (extra = {}) => ({ sourceKind: 'spreadsheet_sheet', spreadsheet: {
  sheetName: 'Production', cells: [{ address: 'B2', rawValue: 0, cellType: 'n', valueOrigin: 'literal', ...extra }]
} });
const proposal = { sheetName: 'Production', cellAddress: 'B2' };

test('matches actual stored cell and preserves genuine zero', () => {
  const result = build(page(), proposal, '0');
  assert.equal(result.status, 'value_matched');
  assert.equal(result.cellAddress, 'B2');
  assert.equal(result.reason, 'semantic_review_required');
});
for (const [name, source, value, reason] of [
  ['missing', undefined, '0', 'missing_reference'],
  ['wrong sheet', { ...proposal, sheetName: 'Other' }, '0', 'sheet_mismatch'],
  ['wrong address', { ...proposal, cellAddress: 'B3' }, '0', 'cell_unavailable_or_ambiguous'],
  ['range', { ...proposal, cellAddress: 'B2:B3' }, '0', 'invalid_address'],
  ['different value', proposal, '1', 'value_mismatch'],
  ['annotated value', proposal, '0 MT', 'value_mismatch']
]) {
  test(`does not certify ${name}`, () => {
    const result = build(page(), source, value);
    assert.equal(result.status, 'unverified');
    assert.equal(result.reason, reason);
    assert.equal(result.cellAddress, undefined);
  });
}
for (const extra of [{ formula: '1-1' }, { cellType: 'e' }, { cellType: 'b' }, { valueOrigin: 'missing_formula_cache' }]) {
  test(`does not certify unsupported cell ${JSON.stringify(extra)}`, () => {
    assert.equal(build(page(extra), proposal, '0').reason, 'unsupported_cell_value');
  });
}
test('does not infer a location from equal values elsewhere', () => {
  const data = page();
  data.spreadsheet.cells.push({ ...data.spreadsheet.cells[0], address: 'C2' });
  assert.equal(build(data, undefined, '0').status, 'unverified');
});
test('missing or duplicate cell evidence remains unverified', () => {
  assert.equal(build({ sourceKind: 'csv_sheet' }, proposal, '0').reason, 'missing_sheet_evidence');
  const data = page();
  data.spreadsheet.cells.push(data.spreadsheet.cells[0]);
  assert.equal(build(data, proposal, '0').status, 'unverified');
});
test('non-spreadsheet records retain legacy page citations', () => {
  assert.equal(build({ pageNumber: 2 }, proposal, '0'), undefined);
  assert.equal(recordSource({ pageNumber: 2 }).pageNumber, 2);
});
test('bounded prompt exposes coordinates without evaluating data', () => {
  assert.match(cellEvidencePrompt(page()), /B2/);
  const data = page({ rawValue: 'x'.repeat(13000) });
  assert.ok(cellEvidencePrompt(data).length < 1000);
});
test('calculation evidence preserves sheet location rather than synthetic page', () => {
  const record = { _id: 'r', documentId: 'd', pageNumber: 1, value: '0', parameter: 'production',
    unit: 'tonnes', period: 'FY 2025-26', mineName: 'Synthetic', status: 'approved',
    cellReference: build(page(), proposal, '0') };
  const source = calculateProductionMetrics([record]).rows[0].sources.production[0];
  assert.equal(source.pageNumber, null);
  assert.equal(source.cellReference.cellAddress, 'B2');
});
test('changed values cannot retain a matched calculation citation', () => {
  const reference = build(page(), proposal, '0');
  const result = recordSource({ value: '10', cellReference: reference });
  assert.equal(result.cellReference.status, 'unverified');
  assert.equal(result.cellReference.reason, 'record_value_changed');
  assert.equal(result.cellReference.cellAddress, undefined);
  assert.equal(reference.status, 'value_matched');
});
