const period = { key: 'FY:2025-2026', startDate: '2025-04-01', endDate: '2026-03-31' };
function fact(id, overrides = {}) {
  return { factId: id, entityId: 'mine:synthetic-alpha', metricId: 'coal_production', role: 'actual', value: 200,
    unit: 'tonne', period: { ...period }, source: { documentId: `doc:${id}`, revisionId: `rev:${id}:1`,
      locator: 'Sheet Production!B2', publicationStatus: 'final' }, ...overrides };
}
function scenario(id, expectedOutcome, facts) { return { contractVersion: '1.0.0', caseId: id, expectedOutcome, facts }; }

module.exports = [
  scenario('same-value-same-unit', 'matched', [fact('a'), fact('b')]),
  scenario('compatible-unit-conversion', 'converted', [fact('a', { value: 200000, unit: 'kilogram' }), fact('b')]),
  scenario('conflicting-final-values', 'conflict', [fact('a'), fact('b', { value: 215 })]),
  scenario('different-reporting-periods', 'incompatible', [fact('a'), fact('b', { period: { key: 'FY:2024-2025', startDate: '2024-04-01', endDate: '2025-03-31' } })]),
  scenario('different-entities', 'incompatible', [fact('a'), fact('b', { entityId: 'mine:synthetic-beta' })]),
  scenario('unsupported-unit', 'incompatible', [fact('a'), fact('b', { unit: 'truckload' })]),
  scenario('ambiguous-source-status', 'insufficient_evidence', [fact('a'), fact('b', { source: { documentId: 'doc:b', revisionId: 'rev:b:1', locator: 'page 2', publicationStatus: 'unknown' } })]),
  scenario('new-source-revision', 'conflict', [fact('a'), fact('b', { value: 210, source: { documentId: 'doc:a', revisionId: 'rev:a:2', locator: 'Sheet Production!B2', publicationStatus: 'final' } })]),
  scenario('actual-versus-target', 'incompatible', [fact('a'), fact('b', { role: 'target' })]),
  scenario('zero-is-valid', 'matched', [fact('a', { value: 0 }), fact('b', { value: 0 })])
];

module.exports.fact = fact;
