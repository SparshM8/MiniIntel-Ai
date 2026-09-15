const test = require('node:test');

const assert = require('node:assert/strict');
const { createValidationService } = require('../services/validationService');

const record = (overrides = {}) => ({
  _id: 'record-1', documentId: 'document-1', parameter: 'Coal Production',
  value: '100', unit: 'tonnes', period: 'FY 2025-26',
  mineName: 'Synthetic Mine', subsidiary: 'Synthetic Subsidiary',
  confidenceScore: 0.95, ...overrides
});

function harness(records, existing = []) {
  const stored = [...existing];
  const service = createValidationService({
    ExtractedRecord: {
      find(query) {
        assert.deepEqual(query, { documentId: 'document-1' });
        return { sort: async () => records };
      }
    },
    ValidationResult: {
      findOne: async (query) => stored.find((issue) =>
        Object.entries(query).every(([key, value]) => issue[key] === value)),
      create: async (issue) => { stored.push(issue); return issue; }
    }
  });
  return { run: () => service.validateDocument('document-1'), stored };
}

for (const value of ['10-20', '4.2 MT', '12%', '1e3', '1,2', 'N/A', '12.3.4', '9'.repeat(400), Infinity]) {
  test(`flags ambiguous numeric extraction ${String(value).slice(0, 30)}`, async () => {
    const source = record({ value });
    const snapshot = { ...source };
    const issues = await harness([source]).run();
    assert.equal(issues.length, 1);
    assert.equal(issues[0].type, 'invalid_value');
    assert.equal(issues[0].severity, 'error');
    assert.equal(issues[0].field, 'value');
    assert.equal(issues[0].details.reason, 'invalid_numeric_format');
    assert.deepEqual(source, snapshot);
  });
}

for (const value of [undefined, null, '', '   ']) {
  test(`keeps missing field ${JSON.stringify(value)} distinct from malformed numbers`, async () => {
    const issues = await harness([record({ value })]).run();
    assert.deepEqual(issues.map((issue) => issue.type), ['missing_data']);
  });
}

for (const value of ['0', 0, '1,234.5', '1,23,456.5', '.5']) {
  test(`accepts valid numeric field ${value}`, async () => {
    assert.deepEqual(await harness([record({ value })]).run(), []);
  });
}

test('preserves negative-value validation', async () => {
  const issues = await harness([record({ value: '-100' })]).run();
  assert.equal(issues.length, 1);
  assert.equal(issues[0].type, 'invalid_value');
  assert.match(issues[0].message, /cannot be negative/);
});

test('does not impose numeric rules on narrative fields', async () => {
  assert.deepEqual(await harness([record({ parameter: 'Geological description', value: 'Shale seam' })]).run(), []);
});

for (const parameter of ['Production', 'Dispatch', 'Target', 'Cost', 'Quantity']) {
  test(`flags malformed monitored metric ${parameter}`, async () => {
    const issues = await harness([record({ parameter, value: '10*' })]).run();
    assert.equal(issues[0].type, 'invalid_value');
  });
}

for (const invalidRole of ['production', 'dispatch', 'target']) {
  test(`excludes malformed ${invalidRole} from relational comparisons`, async () => {
    const records = [
      record({ _id: 'p', value: invalidRole === 'production' ? '1-2' : '100' }),
      record({ _id: 'd', parameter: 'Coal Dispatch', value: invalidRole === 'dispatch' ? '999 MT' : '90' }),
      record({ _id: 't', parameter: 'Production Target', value: invalidRole === 'target' ? '999 MT' : '100' })
    ];
    const issues = await harness(records).run();
    assert.deepEqual(issues.map((issue) => issue.type), ['invalid_value']);
  });
}

test('retains comparisons for valid numbers, including genuine zero', async () => {
  const issues = await harness([
    record({ _id: 'p', value: '0' }),
    record({ _id: 'd', parameter: 'Dispatch', value: '10' }),
    record({ _id: 't', parameter: 'Target', value: '100' })
  ]).run();
  assert.deepEqual(issues.map((issue) => issue.type), ['conflict', 'suspicious_value']);
});

test('malformed values do not distort parameter averages', async () => {
  const records = [record({ value: '100', period: 'period-0' })];
  for (let i = 1; i <= 6; i++) records.push(record({ _id: `r-${i}`, value: '0*', period: `period-${i}` }));
  const issues = await harness(records).run();
  assert.equal(issues.length, 6);
  assert.ok(issues.every((issue) => issue.type === 'invalid_value'));
});

test('repeat validation does not duplicate an open invalid-value issue', async () => {
  const fixture = harness([record({ value: '10-20' })]);
  assert.equal((await fixture.run()).length, 1);
  assert.deepEqual(await fixture.run(), []);
  assert.equal(fixture.stored.length, 1);
});

test('resolved issues do not suppress new invalid-value findings', async () => {
  const fixture = harness([record({ value: '10-20' })], [{
    documentId: 'document-1', recordId: 'record-1', type: 'invalid_value',
    field: 'value', status: 'resolved'
  }]);
  assert.equal((await fixture.run()).length, 1);
  assert.equal(fixture.stored.length, 2);
});

test('handles an empty document', async () => {
  assert.deepEqual(await harness([]).run(), []);
});

test('propagates persistence failure rather than claiming validation succeeded', async () => {
  const failure = new Error('Synthetic persistence failure');
  const service = createValidationService({
    ExtractedRecord: { find: () => ({ sort: async () => [record({ value: '10*' })] }) },
    ValidationResult: { findOne: async () => null, create: async () => { throw failure; } }
  });
  await assert.rejects(service.validateDocument('document-1'), (error) => error === failure);
});
