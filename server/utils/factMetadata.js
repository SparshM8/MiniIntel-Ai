const { parseReportingPeriod } = require('./reportingPeriod');

const metrics = new Map([
  ['coal production', ['coal_production', 'actual']],
  ['coal production target', ['coal_production', 'target']],
  ['coal dispatch', ['coal_dispatch', 'actual']]
]);

// Derived metadata is not evidence of publication status or reviewer approval.
function deriveFactMetadata(parameter, period) {
  const label = typeof parameter === 'string' ? parameter.trim().toLowerCase() : '';
  const identity = metrics.get(label);
  return {
    version: 1,
    metricIdentity: identity ? identity[0] : 'unknown',
    figureType: identity ? identity[1] : 'unknown',
    reportingPeriod: parseReportingPeriod(period)
  };
}

module.exports = { deriveFactMetadata };
