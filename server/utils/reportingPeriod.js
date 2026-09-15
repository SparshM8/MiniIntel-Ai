// Inclusive ISO date boundaries. Bare years never imply a financial/calendar year.

function parseReportingPeriod(label) {
  const originalLabel = typeof label === 'string' ? label : '';
  const input = originalLabel.trim();
  const unresolved = (reason) => ({ originalLabel, status: 'unresolved', reason });
  if (!input) return unresolved('missing_period');
  let match = /^FY\s+(\d{4})\s*[-–/]\s*(\d{2}|\d{4})$/i.exec(input);
  if (match) {
    const start = Number(match[1]);
    const end = match[2].length === 2 ? Math.floor(start / 100) * 100 + Number(match[2]) + (Number(match[2]) < start % 100 ? 100 : 0) : Number(match[2]);
    if (start < 1000 || end > 9999 || end !== start + 1) return unresolved('invalid_financial_year');
    return { originalLabel, status: 'resolved', kind: 'financial_year',
      key: `FY:${start}-${end}`, startDate: `${start}-04-01`, endDate: `${end}-03-31` };
  }
  match = /^CY\s+(\d{4})$/i.exec(input);
  if (match && Number(match[1]) >= 1000) {
    return { originalLabel, status: 'resolved', kind: 'calendar_year', key: `CY:${match[1]}`,
      startDate: `${match[1]}-01-01`, endDate: `${match[1]}-12-31` };
  }
  match = /^(\d{4})-(\d{2})$/.exec(input);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (year < 1000 || month < 1 || month > 12) return unresolved('invalid_month');
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return { originalLabel, status: 'resolved', kind: 'month', key: `MONTH:${input}`,
      startDate: `${input}-01`, endDate: `${input}-${days}` };
  }
  return unresolved('ambiguous_or_unsupported_period');
}

module.exports = { parseReportingPeriod };
