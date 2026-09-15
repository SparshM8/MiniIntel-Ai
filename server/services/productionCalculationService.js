const { parseReportedNumber } = require('../utils/parseReportedNumber');

const text = (value) => typeof value === 'string' ? value.trim() : '';
const keyText = (value) => text(value).toLowerCase();
const metricRoles = new Map([
  ['production', 'production'], ['coal production', 'production'],
  ['target', 'target'], ['production target', 'target'], ['coal production target', 'target'],
  ['dispatch', 'dispatch'], ['coal dispatch', 'dispatch']
]);

// Conservative allowlist: ambiguous abbreviations such as MT require review.
const units = new Map([
  ['t', 1], ['tonne', 1], ['tonnes', 1], ['metric tonne', 1], ['metric tonnes', 1],
  ['million tonnes', 1000000], ['million tonne', 1000000]
]);

const sourceOf = (record) => ({
  recordId: record._id,
  documentId: record.documentId?._id || record.documentId,
  documentName: record.documentId?.originalName || record.documentId?.filename || null,
  pageNumber: Number.isInteger(record.pageNumber) && record.pageNumber > 0 ? record.pageNumber : null
});

function calculateProductionMetrics(records) {
  const groups = new Map();
  const warnings = [];
  for (const record of records) {
    if (record.status !== 'approved') continue;
    const role = metricRoles.get(keyText(record.parameter));
    if (!role) continue;
    const subsidiary = text(record.subsidiary);
    const mineName = text(record.mineName);
    const period = text(record.period);
    if ((!subsidiary && !mineName) || !period) {
      warnings.push({ code: 'MISSING_SCOPE', source: sourceOf(record) });
      continue;
    }
    const key = JSON.stringify([keyText(subsidiary), keyText(mineName), keyText(period)]);
    if (!groups.has(key)) groups.set(key, { subsidiary, mineName, period, production: [], target: [], dispatch: [] });
    groups.get(key)[role].push(record);
  }

  const rows = [];
  const anomalies = [];
  for (const group of groups.values()) {
    const row = {
      subsidiary: group.subsidiary, mineName: group.mineName, period: group.period,
      unit: 'tonnes', production: null, target: null, dispatch: null,
      variance: null, variancePercentage: null, achievementPercentage: null,
      dispatchGap: null, dispatchPercentage: null, sources: {}, warnings: []
    };
    const warn = (code, role) => row.warnings.push({ code, role });
    for (const role of ['production', 'target', 'dispatch']) {
      const candidates = group[role];
      row.sources[role] = candidates.map(sourceOf);
      if (candidates.length === 0) { warn('MISSING_METRIC', role); continue; }
      // Without revision identity, summing repeated totals can double-count.
      if (candidates.length !== 1) { warn('AMBIGUOUS_RECORDS', role); continue; }
      const record = candidates[0];
      const value = parseReportedNumber(record.value);
      if (!Number.isFinite(value) || value < 0) { warn('INVALID_VALUE', role); continue; }
      const factor = units.get(keyText(record.unit));
      if (factor === undefined) { warn('UNSUPPORTED_UNIT', role); continue; }
      const normalized = value * factor;
      if (!Number.isFinite(normalized) || normalized > Number.MAX_SAFE_INTEGER) {
        warn('NUMERIC_RANGE', role); continue;
      }
      row[role] = normalized;
    }
    const ratio = (numerator, denominator, role) => {
      if (denominator === 0) { warn('ZERO_DENOMINATOR', role); return null; }
      const result = (numerator / denominator) * 100;
      if (!Number.isFinite(result) || Math.abs(result) > Number.MAX_SAFE_INTEGER) {
        warn('NUMERIC_RANGE', role); return null;
      }
      return result;
    };
    if (row.production !== null && row.target !== null) {
      row.variance = row.production - row.target;
      row.variancePercentage = ratio(row.variance, row.target, 'target');
      row.achievementPercentage = row.target === 0 ? null : ratio(row.production, row.target, 'target');
      if (row.variancePercentage !== null && row.variancePercentage <= -10) {
        anomalies.push({
          metric: 'Production vs Target', currentValue: row.production, comparisonValue: row.target,
          change: row.variance, percentage: row.variancePercentage, period: row.period,
          comparisonPeriod: 'Target', unit: row.unit, subsidiary: row.subsidiary, mineName: row.mineName,
          reason: `Production fell below target by ${Math.abs(row.variancePercentage).toFixed(1)}%`,
          records: [...group.production, ...group.target], sources: [...row.sources.production, ...row.sources.target]
        });
      }
    }
    if (row.production !== null && row.dispatch !== null) {
      row.dispatchGap = row.production - row.dispatch;
      row.dispatchPercentage = ratio(row.dispatch, row.production, 'production');
    }
    rows.push(row);
  }
  return { rows, anomalies, warnings };
}

module.exports = { calculateProductionMetrics };
