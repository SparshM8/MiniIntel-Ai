
const CONTRACT_VERSION = '1.0.0';

const OUTCOMES = Object.freeze([
  'matched', 'converted', 'conflict', 'incompatible', 'insufficient_evidence'
]);
const ROLES = Object.freeze(['actual', 'target']);
const PUBLICATION_STATUSES = Object.freeze(['draft', 'final', 'unknown']);

function issue(path, code, message) { return { path, code, message }; }
function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateFact(fact, path = 'fact') {
  const issues = [];
  if (!fact || typeof fact !== 'object' || Array.isArray(fact)) return [issue(path, 'invalid_fact', 'Fact must be an object.')];
  for (const field of ['factId', 'entityId', 'metricId', 'unit']) if (!text(fact[field])) issues.push(issue(`${path}.${field}`, 'required', `${field} is required.`));
  if (!ROLES.includes(fact.role)) issues.push(issue(`${path}.role`, 'unsupported_role', 'Role must be actual or target.'));
  if (typeof fact.value !== 'number' || !Number.isFinite(fact.value)) issues.push(issue(`${path}.value`, 'invalid_number', 'Value must be a finite number.'));
  if (!fact.period || typeof fact.period !== 'object') issues.push(issue(`${path}.period`, 'required', 'Resolved period is required.'));
  else {
    if (!text(fact.period.key)) issues.push(issue(`${path}.period.key`, 'required', 'Period key is required.'));
    if (!validDate(fact.period.startDate) || !validDate(fact.period.endDate) || fact.period.startDate > fact.period.endDate) issues.push(issue(`${path}.period`, 'invalid_period', 'Period needs ordered ISO date boundaries.'));
  }
  const source = fact.source;
  if (!source || typeof source !== 'object') issues.push(issue(`${path}.source`, 'required', 'Source provenance is required.'));
  else {
    for (const field of ['documentId', 'revisionId', 'locator']) if (!text(source[field])) issues.push(issue(`${path}.source.${field}`, 'required', `${field} is required.`));
    if (!PUBLICATION_STATUSES.includes(source.publicationStatus)) issues.push(issue(`${path}.source.publicationStatus`, 'unsupported_status', 'Publication status is invalid.'));
  }
  return issues;
}

function validateCase(value) {
  const issues = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, issues: [issue('case', 'invalid_case', 'Case must be an object.')] };
  if (value.contractVersion !== CONTRACT_VERSION) issues.push(issue('case.contractVersion', 'unsupported_version', `Expected ${CONTRACT_VERSION}.`));
  if (!text(value.caseId)) issues.push(issue('case.caseId', 'required', 'caseId is required.'));
  if (!Array.isArray(value.facts) || value.facts.length < 2) issues.push(issue('case.facts', 'insufficient_facts', 'At least two facts are required.'));
  else {
    const ids = new Set();
    value.facts.forEach((fact, index) => {
      issues.push(...validateFact(fact, `case.facts[${index}]`));
      const factId = text(fact?.factId);
      if (factId && ids.has(factId)) issues.push(issue(`case.facts[${index}].factId`, 'duplicate_fact_id', 'factId must be unique.'));
      if (factId) ids.add(factId);
    });
  }
  if (value.expectedOutcome !== undefined && !OUTCOMES.includes(value.expectedOutcome)) issues.push(issue('case.expectedOutcome', 'unsupported_outcome', 'Expected outcome is invalid.'));
  return { ok: issues.length === 0, issues };
}

module.exports = { CONTRACT_VERSION, OUTCOMES, ROLES, PUBLICATION_STATUSES, validateFact, validateCase };
