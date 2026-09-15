function number(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value !== 'string') return NaN;
  const text = value.trim();
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(text) &&
      !/^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(text) &&
      !/^[+-]?\d{1,2}(?:,\d{2})*,\d{3}(?:\.\d+)?$/.test(text)) return NaN;
  return Number(text.replace(/,/g, ''));
}

export function evidencePresentation(record, currentValue = record.value) {
  const ref = record.cellReference;
  const spreadsheet = ['spreadsheet_sheet', 'csv_sheet'].includes(ref?.kind);
  if (!spreadsheet) return {
    spreadsheet: false, label: 'Legacy source metadata',
    location: record.pageNumber ? `Recorded page/index: ${record.pageNumber}` : 'Source location unavailable',
    warning: 'No typed cell reference is available. A legacy index may not be a printed page.'
  };
  const current = number(currentValue);
  const original = number(ref.matchedValue);
  const unchanged = Number.isFinite(current) && Number.isFinite(original) && current === original;
  const matched = ref.status === 'value_matched' && unchanged && /^[A-Z]+[1-9]\d*$/.test(ref.cellAddress || '');
  return {
    spreadsheet: true,
    label: matched ? 'Value matched; semantic review required' : 'Unverified reference',
    location: `Sheet: ${ref.sheetName || 'unavailable'}; Cell: ${matched ? ref.cellAddress : 'unavailable'}`,
    reason: ref.status === 'value_matched' && !unchanged ? 'record_value_changed' : ref.reason,
    warning: matched
      ? 'Matching a number does not verify its header, unit, entity, or reporting period.'
      : 'Do not treat this reference as evidence for the current value. Review the original document.'
  };
}
