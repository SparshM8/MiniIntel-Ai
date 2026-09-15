import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { evidencePresentation } from '../src/utils/evidencePresentation.js';
const require = createRequire(import.meta.url);
const { recordSource } = require('../../server/utils/recordSource.js');
const record = { value: '0', pageNumber: 2, cellReference: {
  kind: 'spreadsheet_sheet', sheetName: 'Production', cellAddress: 'B2',
  status: 'value_matched', matchedValue: '0', reason: 'semantic_review_required'
} };

test('matched zero displays worksheet not synthetic page and warns about semantics', () => {
  const result = evidencePresentation(record);
  assert.match(result.location, /Production; Cell: B2/);
  assert.doesNotMatch(result.location, /page/i);
  assert.match(result.warning, /does not verify/);
});
test('unsaved edit immediately removes a matched cell citation', () => {
  const result = evidencePresentation(record, '10');
  assert.equal(result.reason, 'record_value_changed');
  assert.match(result.location, /Cell: unavailable/);
});
test('unverified references do not display proposed cells as valid evidence', () => {
  const result = evidencePresentation({ ...record, cellReference: { ...record.cellReference, status: 'unverified' } });
  assert.equal(result.label, 'Unverified reference');
  assert.match(result.location, /unavailable/);
});
test('legacy and missing references use explicit uncertainty', () => {
  assert.match(evidencePresentation({ pageNumber: 2 }).warning, /may not be a printed page/);
  assert.equal(evidencePresentation({}).location, 'Source location unavailable');
});
for (const value of ['0', 0, '0.00', ' 0 ', '', null, '0 MT', '0-1', Infinity, '1,2']) {
  test(`client match status agrees with server for ${String(value)}`, () => {
    const candidate = { ...record, value };
    const server = recordSource(candidate).cellReference.status;
    const client = evidencePresentation(candidate).label.startsWith('Value matched') ? 'value_matched' : 'unverified';
    assert.equal(client, server);
  });
}
test('Western and Indian grouped values remain consistent with server', () => {
  for (const value of ['100000', '100,000', '1,00,000']) {
    const candidate = { ...record, value, cellReference: { ...record.cellReference, matchedValue: '100000' } };
    assert.equal(recordSource(candidate).cellReference.status, 'value_matched');
    assert.match(evidencePresentation(candidate).label, /^Value matched/);
  }
});
