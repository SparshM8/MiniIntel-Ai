const { validateCase } = require('../contracts/reconciliation');

const ENGINE_VERSION = '1.0.0';
const UNIT_REGISTRY = Object.freeze({
  kilogram: Object.freeze({ canonicalUnit: 'tonne', factor: 0.001 }),
  tonne: Object.freeze({ canonicalUnit: 'tonne', factor: 1 }),
  'million_tonne': Object.freeze({ canonicalUnit: 'tonne', factor: 1000000 })
});

function result(reconciliationCase, outcome, reasonCode, details = {}) {
  return { engineVersion: ENGINE_VERSION, caseId: reconciliationCase?.caseId || null,
    outcome, reasonCode, ...details };
}
function samePeriod(left, right) {
  return left.key === right.key && left.startDate === right.startDate && left.endDate === right.endDate;
}
function normalizedOperand(fact, unit) {
  return { factId: fact.factId, sourceRevisionId: fact.source.revisionId,
    originalValue: fact.value, originalUnit: fact.unit,
    normalizedValue: fact.value * unit.factor, normalizedUnit: unit.canonicalUnit,
    conversionFactor: unit.factor };
}
function firstMismatch(facts, field, reasonCode) {
  const expected = facts[0][field];
  return facts.some(fact => fact[field] !== expected) ? reasonCode : null;
}

function reconcile(reconciliationCase) {
  const validation = validateCase(reconciliationCase);
  if (!validation.ok) return result(reconciliationCase, 'insufficient_evidence', 'INVALID_CONTRACT', { issues: validation.issues });
  const facts = reconciliationCase.facts;
  if (facts.some(fact => fact.source.publicationStatus !== 'final')) {
    return result(reconciliationCase, 'insufficient_evidence', 'NON_FINAL_SOURCE');
  }
  const scopeMismatch = firstMismatch(facts, 'entityId', 'ENTITY_MISMATCH') ||
    firstMismatch(facts, 'metricId', 'METRIC_MISMATCH') || firstMismatch(facts, 'role', 'ROLE_MISMATCH');
  if (scopeMismatch) return result(reconciliationCase, 'incompatible', scopeMismatch);
  if (facts.some(fact => !samePeriod(facts[0].period, fact.period))) {
    return result(reconciliationCase, 'incompatible', 'PERIOD_MISMATCH');
  }
  const units = facts.map(fact => UNIT_REGISTRY[fact.unit]);
  if (units.some(unit => !unit)) return result(reconciliationCase, 'incompatible', 'UNSUPPORTED_UNIT');
  const operands = facts.map((fact, index) => normalizedOperand(fact, units[index]));
  const baseline = operands[0].normalizedValue;
  const equal = operands.every(operand => Object.is(operand.normalizedValue, baseline));
  if (!equal) return result(reconciliationCase, 'conflict', 'VALUE_MISMATCH', { operands });
  const converted = operands.some(operand => operand.conversionFactor !== 1 || operand.originalUnit !== operands[0].originalUnit);
  return result(reconciliationCase, converted ? 'converted' : 'matched',
    converted ? 'EQUAL_AFTER_CONVERSION' : 'EXACT_MATCH', { operands });
}

module.exports = { ENGINE_VERSION, UNIT_REGISTRY, reconcile };
