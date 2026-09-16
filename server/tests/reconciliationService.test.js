const test = require('node:test');
const assert = require('node:assert/strict');
const scenarios = require('./fixtures/reconciliationCases');
const { fact } = scenarios;
const { ENGINE_VERSION, UNIT_REGISTRY, reconcile } = require('../services/reconciliationService');

function scenario(id, facts) { return { contractVersion: '1.0.0', caseId: id, facts }; }

test('all Phase 1 acceptance scenarios produce their required outcomes', () => {
  for (const item of scenarios) assert.equal(reconcile(item).outcome, item.expectedOutcome, item.caseId);
});

test('returns stable engine metadata and exact-match evidence', () => {
  const output = reconcile(scenarios.find(item => item.caseId === 'same-value-same-unit'));
  assert.equal(output.engineVersion, ENGINE_VERSION);
  assert.equal(output.reasonCode, 'EXACT_MATCH');
  assert.equal(output.operands.length, 2);
  assert.equal(output.operands[0].normalizedUnit, 'tonne');
});

test('uses a closed immutable conversion registry', () => {
  assert.ok(Object.isFrozen(UNIT_REGISTRY));
  assert.deepEqual(Object.keys(UNIT_REGISTRY), ['kilogram', 'tonne', 'million_tonne']);
  assert.equal(UNIT_REGISTRY.kilogram.factor, 0.001);
  assert.equal(UNIT_REGISTRY.million_tonne.factor, 1000000);
});

test('reports deterministic conversion details without changing source values', () => {
  const input = scenarios.find(item => item.caseId === 'compatible-unit-conversion');
  const before = JSON.stringify(input);
  const output = reconcile(input);
  assert.equal(output.reasonCode, 'EQUAL_AFTER_CONVERSION');
  assert.deepEqual(output.operands.map(item => item.normalizedValue), [200, 200]);
  assert.equal(JSON.stringify(input), before);
});

test('does not use tolerance to hide a numeric conflict', () => {
  const output = reconcile(scenario('precision', [fact('a', { value: 0.1 + 0.2 }), fact('b', { value: 0.3 })]));
  assert.equal(output.outcome, 'conflict');
  assert.equal(output.reasonCode, 'VALUE_MISMATCH');
});

test('does not select a newer source revision as the winner', () => {
  const output = reconcile(scenarios.find(item => item.caseId === 'new-source-revision'));
  assert.equal(output.outcome, 'conflict');
  assert.deepEqual(output.operands.map(item => item.sourceRevisionId), ['rev:a:1', 'rev:a:2']);
});

test('abstains for invalid contracts and exposes validation issues', () => {
  const output = reconcile(scenario('invalid', [fact('a'), fact('b', { value: null })]));
  assert.equal(output.outcome, 'insufficient_evidence');
  assert.equal(output.reasonCode, 'INVALID_CONTRACT');
  assert.ok(output.issues.some(item => item.code === 'invalid_number'));
});

test('draft and unknown sources cannot produce a match or conflict', () => {
  for (const publicationStatus of ['draft', 'unknown']) {
    const output = reconcile(scenario(publicationStatus, [fact('a'), fact('b', {
      source: { documentId: 'doc:b', revisionId: 'rev:b:1', locator: 'page 1', publicationStatus }
    })]));
    assert.equal(output.outcome, 'insufficient_evidence');
    assert.equal(output.reasonCode, 'NON_FINAL_SOURCE');
  }
});

test('scope mismatch reason precedence is stable', () => {
  const base = fact('a');
  const cases = [
    ['ENTITY_MISMATCH', { entityId: 'mine:b', metricId: 'dispatch', role: 'target' }],
    ['METRIC_MISMATCH', { metricId: 'dispatch', role: 'target' }],
    ['ROLE_MISMATCH', { role: 'target' }]
  ];
  for (const [reasonCode, overrides] of cases) {
    assert.equal(reconcile(scenario(reasonCode, [base, fact('b', overrides)])).reasonCode, reasonCode);
  }
});

test('period identity includes key and exact boundaries', () => {
  const output = reconcile(scenario('period-boundary', [fact('a'), fact('b', { period: {
    key: 'FY:2025-2026', startDate: '2025-04-02', endDate: '2026-03-31'
  } })]));
  assert.equal(output.outcome, 'incompatible');
  assert.equal(output.reasonCode, 'PERIOD_MISMATCH');
});

test('all facts must agree in a multi-source case', () => {
  const output = reconcile(scenario('three-sources', [fact('a'), fact('b'), fact('c', { value: 201 })]));
  assert.equal(output.outcome, 'conflict');
  assert.equal(output.operands.length, 3);
});

test('genuine zero matches and negative zero remains exact', () => {
  const output = reconcile(scenario('zero', [fact('a', { value: 0 }), fact('b', { value: 0 })]));
  assert.equal(output.outcome, 'matched');
  assert.equal(output.operands[0].normalizedValue, 0);
  assert.equal(reconcile(scenario('negative-zero', [fact('a', { value: -0 }), fact('b', { value: 0 })])).outcome, 'conflict');
});
