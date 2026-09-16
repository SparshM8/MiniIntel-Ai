const test = require('node:test');

const assert = require('node:assert/strict');
const scenarios = require('./fixtures/reconciliationCases');
const { fact } = scenarios;
const {
  CONTRACT_VERSION, OUTCOMES, ROLES, PUBLICATION_STATUSES, validateFact, validateCase
} = require('../contracts/reconciliation');

function codes(result) { return result.issues.map(item => item.code); }

test('contract exposes stable closed vocabularies', () => {
  assert.equal(CONTRACT_VERSION, '1.0.0');
  assert.deepEqual(OUTCOMES, ['matched', 'converted', 'conflict', 'incompatible', 'insufficient_evidence']);
  assert.deepEqual(ROLES, ['actual', 'target']);
  assert.deepEqual(PUBLICATION_STATUSES, ['draft', 'final', 'unknown']);
  assert.ok(Object.isFrozen(OUTCOMES));
});

test('all synthetic acceptance scenarios satisfy the input contract', () => {
  assert.equal(scenarios.length, 10);
  assert.deepEqual(new Set(scenarios.map(item => item.expectedOutcome)), new Set(OUTCOMES));
  for (const scenario of scenarios) assert.deepEqual(validateCase(scenario), { ok: true, issues: [] }, scenario.caseId);
});

test('zero is valid while missing and non-finite values are rejected', () => {
  assert.deepEqual(validateFact(fact('zero', { value: 0 })), []);
  for (const value of [undefined, null, '', NaN, Infinity, -Infinity]) {
    assert.ok(validateFact(fact('bad', { value })).some(item => item.code === 'invalid_number'), String(value));
  }
});

test('requires explicit identity, role, unit, resolved period and provenance', () => {
  const candidate = fact('incomplete', {
    entityId: ' ', metricId: '', role: 'estimate', unit: null,
    period: { key: '', startDate: '2026-03-31', endDate: '2025-04-01' },
    source: { documentId: '', revisionId: null, locator: ' ', publicationStatus: 'provisional' }
  });
  const issues = validateFact(candidate);
  assert.ok(issues.length >= 9);
  assert.ok(issues.some(item => item.path === 'fact.period' && item.code === 'invalid_period'));
  assert.ok(issues.some(item => item.path === 'fact.source.publicationStatus' && item.code === 'unsupported_status'));
});

test('rejects impossible calendar dates rather than normalizing them', () => {
  const issues = validateFact(fact('date', { period: {
    key: 'MONTH:2025-02', startDate: '2025-02-01', endDate: '2025-02-31'
  } }));
  assert.ok(issues.some(item => item.code === 'invalid_period'));
});

test('rejects duplicate trimmed fact IDs and unsupported outcomes or versions', () => {
  const result = validateCase({
    contractVersion: '2.0.0', caseId: 'invalid', expectedOutcome: 'guessed',
    facts: [fact('same'), fact(' same ')]
  });
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes('unsupported_version'));
  assert.ok(codes(result).includes('unsupported_outcome'));
  assert.ok(codes(result).includes('duplicate_fact_id'));
});

test('rejects invalid case shapes and fewer than two facts', () => {
  assert.equal(validateCase(null).issues[0].code, 'invalid_case');
  assert.equal(validateCase({ contractVersion: CONTRACT_VERSION, caseId: 'one', facts: [fact('a')] }).issues[0].code, 'insufficient_facts');
});
