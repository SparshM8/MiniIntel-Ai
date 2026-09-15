const { test, before, after } = require('node:test');

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server-core');
const ExtractedRecord = require('../../models/ExtractedRecord');
const DocumentPage = require('../../models/DocumentPage');
const controller = require('../../controllers/extractionController');
const { buildCellReference } = require('../../utils/cellReference');
const { recordSource } = require('../../utils/recordSource');

let database;
before(async () => {
  // Never read an application database URI or load dotenv/server startup.
  database = await MongoMemoryServer.create({
    binary: { version: '7.0.14', checkMD5: true },
    instance: { ip: '127.0.0.1', dbName: `review_test_${randomUUID().replaceAll('-', '')}` }
  });
  await mongoose.connect(database.getUri(), { serverSelectionTimeoutMS: 10000 });
});
after(async () => {
  try { await mongoose.disconnect(); }
  finally { if (database) await database.stop(); }
});

async function invoke(handler, { id, documentId, body = {} } = {}) {
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; },
    json(value) { this.body = JSON.parse(JSON.stringify(value)); return this; } };
  await handler({ params: { id, documentId }, body }, response);
  return response;
}
async function createFact(overrides = {}) {
  return ExtractedRecord.create({ documentId: new mongoose.Types.ObjectId(), parameter: 'Coal Production',
    value: '0', originalValue: '0', unit: 'tonnes', period: 'FY 2025-26', ...overrides });
}

test('insertMany and database read preserve typed worksheet evidence', async () => {
  const documentId = new mongoose.Types.ObjectId();
  await DocumentPage.insertMany([{ documentId, pageNumber: 1, sourceKind: 'spreadsheet_sheet',
    spreadsheet: { sheetName: 'Synthetic', cells: [
      { address: 'B2', cellType: 'n', rawValue: 0, valueOrigin: 'literal' },
      { address: 'B3', cellType: 'b', rawValue: false, valueOrigin: 'literal' },
      { address: 'B4', cellType: 'z', rawValue: null, formula: 'B2+1', valueOrigin: 'missing_formula_cache' }
    ] } }]);
  const page = await DocumentPage.findOne({ documentId }).lean();
  assert.equal(page.spreadsheet.cells[0].rawValue, 0);
  assert.equal(page.spreadsheet.cells[1].rawValue, false);
  assert.equal(page.spreadsheet.cells[2].rawValue, null);
  assert.equal(buildCellReference(page, { sheetName: 'Synthetic', cellAddress: 'B2' }, '0').status, 'value_matched');
  assert.equal(buildCellReference(page, { sheetName: 'Synthetic', cellAddress: 'B4' }, '1').status, 'unverified');
});

test('controller edit persists history while retaining original evidence', async () => {
  const fact = await createFact({ cellReference: { kind: 'spreadsheet_sheet', status: 'value_matched',
    sheetName: 'Synthetic', cellAddress: 'B2', matchedValue: '0', reason: 'semantic_review_required' } });
  const response = await invoke(controller.updateRecord, { id: fact.id, body: { value: '10', unit: 't' } });
  assert.equal(response.statusCode, 200);
  const stored = await ExtractedRecord.findById(fact.id).lean();
  assert.equal(stored.value, '10');
  assert.equal(stored.originalValue, '0');
  assert.deepEqual(stored.editHistory.map(edit => [edit.field, edit.oldValue, edit.newValue]), [
    ['value', '0', '10'], ['unit', 'tonnes', 't']
  ]);
  assert.ok(stored.editHistory.every(edit => edit.editedAt instanceof Date));
  assert.equal(stored.cellReference.cellAddress, 'B2');
  assert.equal(recordSource(stored).cellReference.reason, 'record_value_changed');
  assert.equal(stored.factMetadata.reportingPeriod.key, 'FY:2025-2026');
  await invoke(controller.updateRecord, { id: fact.id, body: { value: '10', unit: 't' } });
  assert.equal((await ExtractedRecord.findById(fact.id)).editHistory.length, 2);
});

test('approve and reject persist actual status and review timestamps', async () => {
  const fact = await createFact();
  const start = Date.now();
  assert.equal((await invoke(controller.approveRecord, { id: fact.id })).statusCode, 200);
  let stored = await ExtractedRecord.findById(fact.id).lean();
  assert.equal(stored.status, 'approved');
  assert.ok(stored.reviewedAt.getTime() >= start);
  assert.equal((await invoke(controller.rejectRecord, { id: fact.id })).statusCode, 200);
  stored = await ExtractedRecord.findById(fact.id).lean();
  assert.equal(stored.status, 'rejected');
  assert.equal(stored.editHistory.length, 0);
});

test('bulk approval affects only supplied existing IDs; missing IDs are silently unmatched', async () => {
  const first = await createFact();
  const second = await createFact();
  const untouched = await createFact();
  const response = await invoke(controller.bulkApprove, { body: { ids: [first.id, second.id, new mongoose.Types.ObjectId().toString()] } });
  assert.equal(response.statusCode, 200);
  assert.equal((await ExtractedRecord.findById(first.id)).status, 'approved');
  assert.equal((await ExtractedRecord.findById(second.id)).status, 'approved');
  assert.equal((await ExtractedRecord.findById(untouched.id)).status, 'pending');
});

test('valid but nonexistent IDs return 404 for single-record mutations', async () => {
  for (const handler of [controller.updateRecord, controller.approveRecord, controller.rejectRecord]) {
    assert.equal((await invoke(handler, { id: new mongoose.Types.ObjectId().toString(), body: { value: '2' } })).statusCode, 404);
  }
  assert.equal((await invoke(controller.bulkApprove, { body: { ids: [] } })).statusCode, 400);
});

test('scoped getRecords reads stored records without leaking other documents', async () => {
  const documentId = new mongoose.Types.ObjectId();
  const first = await createFact({ documentId, pageNumber: 2 });
  const second = await createFact({ documentId, pageNumber: 1 });
  await createFact();
  const response = await invoke(controller.getRecords, { documentId: documentId.toString() });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.map(record => record._id), [second.id, first.id]);
});

test('query approval does not backfill metadata on a legacy raw record', async () => {
  const legacy = { documentId: new mongoose.Types.ObjectId(), parameter: 'Coal Production', value: '3', status: 'pending' };
  const { insertedId } = await ExtractedRecord.collection.insertOne(legacy);
  await invoke(controller.approveRecord, { id: insertedId.toString() });
  const stored = await ExtractedRecord.findById(insertedId).lean();
  assert.equal(stored.status, 'approved');
  assert.equal(stored.factMetadata, undefined);
  assert.equal(stored.cellReference, undefined);
});
