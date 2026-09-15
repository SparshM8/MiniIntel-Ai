const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { deriveFactMetadata } = require('../utils/factMetadata');

// Contract-level schema adapter, not a substitute for real Mongoose integration tests.
function loadSchema() {
  class Schema {
    constructor(fields, options) { this.fields = fields; this.options = options; this.hooks = {}; }
    pre(event, callback) { this.hooks[event] = callback; }
  }
  Schema.Types = { ObjectId: class ObjectId {} };
  const context = { module: { exports: {} }, require: (name) => {
    if (name === 'mongoose') return { Schema, model: (_name, schema) => schema };
    if (name === '../utils/factMetadata') return { deriveFactMetadata };
    throw new Error(`Unexpected dependency: ${name}`);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../models/ExtractedRecord.js'), 'utf8'), context);
  return context.module.exports;
}
const schema = loadSchema();
test('metadata and source fields are optional in the schema contract', () => {
  for (const field of ['factMetadata', 'publicationStatus', 'sourceVersion', 'extractionMethod']) {
    assert.notEqual(schema.fields[field].required, true);
  }
  assert.equal(schema.fields.factMetadata.default, undefined);
});
test('new record validation derives metadata without changing original labels', () => {
  const record = { isNew: true, parameter: 'Coal Production', period: 'FY 2025-26' };
  schema.hooks.validate.call(record);
  assert.equal(record.factMetadata.reportingPeriod.key, 'FY:2025-2026');
  assert.equal(record.period, 'FY 2025-26');
});
test('unmodified legacy records remain without metadata', () => {
  const record = { isNew: false, isModified: () => false, parameter: 'Coal Production', period: '2025' };
  schema.hooks.validate.call(record);
  assert.equal(record.factMetadata, undefined);
});
test('period corrections replace stale derived metadata', () => {
  const record = { isNew: false, isModified: (field) => field === 'period',
    parameter: 'Coal Production', period: 'CY 2025', factMetadata: deriveFactMetadata('Coal Production', 'FY 2025-26') };
  schema.hooks.validate.call(record);
  assert.equal(record.factMetadata.reportingPeriod.key, 'CY:2025');
});
