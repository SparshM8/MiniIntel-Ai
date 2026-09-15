const test = require('node:test');

const assert = require('node:assert/strict');
const { calculateProductionMetrics: calculate } = require('../services/productionCalculationService');
const { createMiningIntelligenceService } = require('../services/miningIntelligenceService');
const fact = (parameter, value, extra = {}) => ({
  _id: parameter, documentId: 'doc-1', pageNumber: 2, status: 'approved',
  subsidiary: 'Synthetic CIL', mineName: 'Mine A', period: 'FY 2025-26',
  unit: 'tonnes', parameter, value, ...extra
});
const pair = (value = '80', target = '100') => [fact('production', value), fact('target', target)];

test('calculates variance with evidence for both operands', () => {
  const result = calculate(pair());
  assert.equal(result.rows[0].variance, -20);
  assert.equal(result.rows[0].variancePercentage, -20);
  assert.equal(result.rows[0].achievementPercentage, 80);
  assert.equal(result.anomalies[0].sources.length, 2);
  assert.equal(result.rows[0].dispatch, null);
});
for (const value of [null, undefined, '', '10-20', '4.2 MT', '1e3', 'N/A', '-1', Infinity]) {
  test(`does not replace invalid production ${String(value)} with zero`, () => {
    const result = calculate([fact('production', value), fact('target', '100')]);
    assert.equal(result.rows[0].production, null);
    assert.equal(result.rows[0].variance, null);
    assert.deepEqual(result.anomalies, []);
  });
}

test('distinguishes actual zero from unavailable and guards division by zero', () => {
  const row = calculate([...pair('0', '0'), fact('dispatch', '10')]).rows[0];
  assert.equal(row.production, 0);
  assert.equal(row.variance, 0);
  assert.equal(row.variancePercentage, null);
  assert.equal(row.dispatchPercentage, null);
  assert.equal(row.dispatchGap, -10);
});

test('normalizes explicit million tonnes before comparison', () => {
  const row = calculate([fact('production', '1', { unit: 'million tonnes' }), fact('target', '1,000,000')]).rows[0];
  assert.equal(row.production, 1000000);
  assert.equal(row.variance, 0);
});
for (const unit of ['MT', 'BCM', '', 'kg']) {
  test(`rejects unsupported or ambiguous unit ${unit}`, () => {
    const row = calculate([fact('production', '10', { unit }), fact('target', '10')]).rows[0];
    assert.equal(row.production, null);
    assert.ok(row.warnings.some(w => w.code === 'UNSUPPORTED_UNIT'));
  });
}
for (const extra of [{ mineName: 'Mine B' }, { subsidiary: 'Other' }, { period: 'CY 2025' }]) {
  test(`does not merge mismatched scope ${JSON.stringify(extra)}`, () => {
    const result = calculate([fact('production', '80'), fact('target', '100', extra)]);
    assert.equal(result.rows.length, 2);
    assert.ok(result.rows.every(row => row.variance === null));
  });
}

test('duplicate totals are withheld rather than summed', () => {
  const result = calculate([...pair(), fact('coal production', '80')]);
  assert.equal(result.rows[0].production, null);
  assert.ok(result.rows[0].warnings.some(w => w.code === 'AMBIGUOUS_RECORDS'));
});

test('production target is not actual production', () => {
  const row = calculate([fact('production target', '100')]).rows[0];
  assert.equal(row.production, null);
  assert.equal(row.target, 100);
});

test('unapproved and unsupported metrics cannot create production facts', () => {
  assert.deepEqual(calculate([fact('production', '10', { status: 'pending' }), fact('overburden production', '10')]).rows, []);
});

test('missing scope is explicitly reported', () => {
  const result = calculate([fact('production', '10', { period: '' })]);
  assert.equal(result.warnings[0].code, 'MISSING_SCOPE');
  assert.deepEqual(result.rows, []);
});

test('overflow and excessive values are withheld', () => {
  assert.equal(calculate([fact('production', '9999999999999999')]).rows[0].production, null);
  const row = calculate(pair('100', Number.MIN_VALUE)).rows[0];
  assert.equal(row.achievementPercentage, null);
});

function harness(records, search = async () => []) {
  const queries = [];
  return {
    queries,
    service: createMiningIntelligenceService({
      ExtractedRecord: { find: (query) => { queries.push(query); return { populate: () => ({ lean: async () => records }) }; } },
      ragService: { searchSimilar: search }
    })
  };
}

test('empty scoped lookup does not broaden or retrieve unapproved records', async () => {
  const { service, queries } = harness([]);
  const result = await service.analyzeDataAndFindAnomalies({ documentId: 'missing', mineName: 'Mine.*', period: 'FY 2025-26' });
  assert.equal(queries.length, 1);
  assert.equal(queries[0].status, 'approved');
  assert.equal(queries[0].documentId, 'missing');
  assert.ok(queries[0].mineName.test('Mine.*'));
  assert.ok(!queries[0].mineName.test('Mine A'));
  assert.match(result.summaryText, /Insufficient approved/);
  assert.doesNotMatch(result.summaryText, /No significant negative/);
});

test('anomaly search receives calculation scope and caller context', async () => {
  let received;
  const { service } = harness(pair(), async (_query, _count, options) => { received = options; return []; });
  const user = { _id: 'synthetic-user' };
  const result = await service.analyzeDataAndFindAnomalies({ documentId: 'doc-1', user });
  assert.equal(received.filters.documentId, 'doc-1');
  assert.equal(received.filters.mine, 'Mine A');
  assert.equal(received.filters.period, 'FY 2025-26');
  assert.equal(received.user, user);
  assert.equal(result.calculations[0].variance, -20);
  assert.match(result.summaryText, /Dispatch: unavailable/);
});

test('provider failure does not remove deterministic results', async () => {
  const { service } = harness(pair(), async () => { throw new Error('Synthetic outage'); });
  const result = await service.analyzeDataAndFindAnomalies();
  assert.equal(result.calculations[0].variance, -20);
});
