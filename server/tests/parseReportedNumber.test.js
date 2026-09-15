const test = require('node:test');
const assert = require('node:assert/strict');
const { parseReportedNumber } = require('../utils/parseReportedNumber');

const valid = [
  [0, 0], [42.5, 42.5], ['0', 0], [' 42.50 ', 42.5],
  ['-12.5', -12.5], ['+12', 12], ['.5', 0.5],
  ['1,234.50', 1234.5], ['1,234,567', 1234567],
  ['12,34,567.89', 1234567.89], ['1,00,000', 100000],
  ['-1,23,456', -123456]
];
for (const [input, expected] of valid) {
  test(`parses complete numeric field ${JSON.stringify(input)}`, () => {
    assert.equal(parseReportedNumber(input), expected);
  });
}

const invalid = [
  undefined, null, '', ' ', true, {}, [], NaN, Infinity, -Infinity,
  'N/A', '-', '4.2 MT', '12%', '1e3', 'FY 2023-24', '10-20',
  '12.3.4', '1,2', '1234,567', '1,234,56', '1 234', '(100)',
  '10*', 'approximately 10', '0x10', '1\n2', '9'.repeat(400)
];
invalid.forEach((input, index) => {
  test(`rejects missing or ambiguous field ${index + 1}`, () => {
    assert.ok(Number.isNaN(parseReportedNumber(input)));
  });
});
