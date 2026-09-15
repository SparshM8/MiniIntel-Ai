const test = require('node:test');

const assert = require('node:assert/strict');
const { parseReportingPeriod: parse } = require('../utils/reportingPeriod');
const { deriveFactMetadata } = require('../utils/factMetadata');

for (const label of ['FY 2025-26', 'FY 2025-2026', 'fy 2025/26', ' FY 2025–26 ']) {
  test(`normalizes explicit financial year ${label}`, () => {
    const result = parse(label);
    assert.equal(result.status, 'resolved');
    assert.equal(result.originalLabel, label);
    assert.equal(result.key, 'FY:2025-2026');
    assert.equal(result.startDate, '2025-04-01');
    assert.equal(result.endDate, '2026-03-31');
  });
}
for (const label of ['2025', 'FY 2025', '2025/26', 'last year', 'March 2025']) {
  test(`does not guess ambiguous label ${label}`, () => {
    const result = parse(label);
    assert.equal(result.status, 'unresolved');
    assert.equal(result.key, undefined);
  });
}
for (const label of ['FY 2025-27', 'FY 2025-2024', 'FY 9999-00', 'FY 0000-01', '2025-13', '2025-00']) {
  test(`rejects invalid period ${label}`, () => assert.equal(parse(label).status, 'unresolved'));
}
for (const label of [null, undefined, '', ' ', 2025]) {
  test(`handles missing/nontext period ${String(label)}`, () => assert.equal(parse(label).reason, 'missing_period'));
}
test('calendar and financial years have different identities and boundaries', () => {
  const cy = parse('CY 2025');
  assert.equal(cy.startDate, '2025-01-01');
  assert.equal(cy.endDate, '2025-12-31');
  assert.notEqual(cy.key, parse('FY 2025-26').key);
});
test('handles financial year across a century', () => assert.equal(parse('FY 1999-00').key, 'FY:1999-2000'));
for (const [label, end] of [['2024-02', '2024-02-29'], ['2025-02', '2025-02-28'], ['2025-04', '2025-04-30'], ['2025-12', '2025-12-31']]) {
  test(`calculates month end ${label}`, () => assert.equal(parse(label).endDate, end));
}
test('derives explicit coal target independently from approval/publication', () => {
  const metadata = deriveFactMetadata(' Coal Production Target ', 'FY 2025-26');
  assert.equal(metadata.metricIdentity, 'coal_production');
  assert.equal(metadata.figureType, 'target');
  assert.equal(metadata.publicationStatus, undefined);
  assert.equal(metadata.status, undefined);
});
test('does not assume a generic production/target label refers to coal', () => {
  for (const label of ['production', 'target', 'production target', 'overburden production', 'dispatch']) {
    assert.equal(deriveFactMetadata(label, '2025').metricIdentity, 'unknown');
  }
});
test('handles legacy or missing labels without mutating the record', () => {
  const legacy = { parameter: 'Coal Dispatch', period: '2025' };
  const snapshot = { ...legacy };
  assert.equal(deriveFactMetadata(legacy.parameter, legacy.period).reportingPeriod.status, 'unresolved');
  assert.deepEqual(legacy, snapshot);
  assert.equal(deriveFactMetadata().figureType, 'unknown');
});
