/** Parse complete numeric fields; never guess units, annotations, or OCR repairs. */
const parseReportedNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value !== 'string') return NaN;

  const text = value.trim();
  const plain = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;
  const western = /^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;
  const indian = /^[+-]?\d{1,2}(?:,\d{2})*,\d{3}(?:\.\d+)?$/;
  if (!plain.test(text) && !western.test(text) && !indian.test(text)) return NaN;

  const number = Number(text.replace(/,/g, ''));
  return Number.isFinite(number) ? number : NaN;
};

module.exports = { parseReportedNumber };
