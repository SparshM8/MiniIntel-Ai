const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const express = require('express');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server-core');
const Report = require('../../models/Report');
const User = require('../../models/User');
const AuditLog = require('../../models/AuditLog');
const Notification = require('../../models/Notification');

const servicePath = require.resolve('../../services/reportService');
const originalService = require.cache[servicePath];
require.cache[servicePath] = { id: servicePath, filename: servicePath, loaded: true, exports: {} };
const { updateReport, submitForReview } = require('../../controllers/reportController');
let database, server, base, owner, reviewer, admin;
const secret = randomUUID();
const originalSecret = process.env.JWT_SECRET;
const originalAdmin = process.env.ADMIN_USERNAME;

before(async () => {
  database = await MongoMemoryServer.create({ binary: { version: '7.0.14', checkMD5: true },
    instance: { ip: '127.0.0.1', dbName: `report_revisions_${randomUUID().replaceAll('-', '')}` } });
  await mongoose.connect(database.getUri());
  process.env.JWT_SECRET = secret;
  process.env.ADMIN_USERNAME = `report-admin-${randomUUID()}`;
  [owner, reviewer, admin] = await User.insertMany([
    { username: 'report-owner', password: 'unused', role: 'user' },
    { username: 'report-reviewer', password: 'unused', role: 'reviewer' },
    { username: process.env.ADMIN_USERNAME, password: 'unused', role: 'admin' }
  ]);
  const app = express();
  app.use(express.json());
  app.use('/api/v1/reports', require('../../routes/api/v1/reports'));
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  base = `http://127.0.0.1:${server.address().port}/api/v1/reports`;
});

after(async () => {
  try {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await mongoose.disconnect();
  } finally {
    if (database) await database.stop();
    if (originalService) require.cache[servicePath] = originalService;
    else delete require.cache[servicePath];
    if (originalSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originalSecret;
    if (originalAdmin === undefined) delete process.env.ADMIN_USERNAME; else process.env.ADMIN_USERNAME = originalAdmin;
  }
});

async function submit(report, method, suffix, actor, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (actor) headers.Authorization = `Bearer ${jwt.sign({ id: actor.id }, secret, { expiresIn: '5m' })}`;
  const response = await fetch(`${base}/${report.id}/${suffix}`, { method, headers,
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  return { status: response.status, body: await response.json() };
}

for (const status of ['approved', 'review', 'rejected', 'draft']) {
  for (const [variant, changes, expectedMarkdown] of [
    ['markdown', { markdown: 'Corrected evidence' }, 'Corrected evidence'],
    ['string content', { content: 'Corrected evidence' }, 'Corrected evidence'],
    ['object content', { content: { markdown: 'Corrected evidence' } }, 'Corrected evidence'],
    ['metadata only', { language: 'hi' }, 'Original evidence']
  ]) {
  test(`editing ${status} report ${variant} saves a draft and preserves previous content`, async () => {
    const ownerId = new mongoose.Types.ObjectId();
    const report = await Report.create({ title: 'Original', type: 'summary', generatedBy: ownerId,
      status, content: { markdown: 'Original evidence', nested: { total: 12 } }, version: 3,
      approvedBy: new mongoose.Types.ObjectId(), approvedAt: new Date(),
      reviewedAt: new Date(), reviewerComments: 'Previous decision' });
    let result;
    const response = { status(code) { assert.equal(code, 200); return this; },
      json(body) { result = body; return this; } };
    await updateReport({ params: { id: report.id }, user: { _id: ownerId, role: 'user' },
      body: { title: 'Revised', ...changes } }, response, error => { throw error; });
    assert.equal(result.success, true);
    const saved = await Report.findById(report.id).lean();
    assert.equal(saved.status, 'draft');
    assert.equal(saved.version, 4);
    assert.equal(saved.title, 'Revised');
    assert.equal(saved.content.markdown, expectedMarkdown);
    assert.deepEqual(saved.content.nested, { total: 12 });
    if (changes.language) assert.equal(saved.language, changes.language);
    assert.deepEqual(saved.previousVersions[0].content, { markdown: 'Original evidence', nested: { total: 12 } });
    assert.equal(saved.previousVersions[0].version, 3);
    assert.equal(saved.approvedBy, undefined);
    assert.equal(saved.approvedAt, undefined);
    assert.equal(saved.reviewedAt, undefined);
    assert.equal(saved.reviewerComments, '');
  });
  }
}

test('foreign users cannot create a revision or invalidate approval', async () => {
  const report = await Report.create({ title: 'Approved', type: 'summary', status: 'approved',
    generatedBy: new mongoose.Types.ObjectId(), content: { markdown: 'Unchanged' } });
  const beforeUpdate = await Report.findById(report.id).lean();
  let statusCode;
  const response = { status(code) { statusCode = code; return this; }, json() { return this; } };
  await updateReport({ params: { id: report.id }, user: { _id: new mongoose.Types.ObjectId(), role: 'user' },
    body: { markdown: 'Forbidden' } }, response, error => { throw error; });
  assert.equal(statusCode, 403);
  assert.deepEqual(await Report.findById(report.id).lean(), beforeUpdate);
});

test('foreign actors cannot submit a report for review', async () => {
  const report = await Report.create({ title: 'Private draft', type: 'summary',
    generatedBy: new mongoose.Types.ObjectId(), content: { markdown: 'Original' } });
  const beforeSubmit = await Report.findById(report.id).lean();
  for (const role of ['user', 'reviewer']) {
    let statusCode;
    const response = { status(code) { statusCode = code; return this; }, json() { return this; } };
    await submitForReview({ params: { id: report.id }, user: { _id: new mongoose.Types.ObjectId(), role },
      body: {} }, response, error => { throw error; });
    assert.equal(statusCode, 403);
    assert.deepEqual(await Report.findById(report.id).lean(), beforeSubmit);
  }
});

for (const [method, suffix] of [['POST', 'submit-review'], ['PUT', 'submit']]) {
  test(`${method} ${suffix} enforces identity and preserves denied reports and side effects`, async () => {
    const report = await Report.create({ title: 'Private draft', type: 'summary', generatedBy: owner._id });
    const beforeSubmit = await Report.findById(report.id).lean();
    assert.equal((await submit(report, method, suffix, null)).status, 401);
    assert.equal((await submit(report, method, suffix, reviewer, {})).status, 403);
    for (const reviewerId of [null, '', 'bad', 123, { $ne: null }, owner.id, admin.id, new mongoose.Types.ObjectId().toString()]) {
      const result = await submit(report, method, suffix, owner, { reviewerId });
      assert.equal(result.status, 400, JSON.stringify(result.body));
      assert.equal(result.body.error, 'INVALID_REVIEWER');
    }
    for (const status of ['suspended', 'inactive']) {
      await User.updateOne({ _id: reviewer._id }, { $set: { status } });
      assert.equal((await submit(report, method, suffix, owner, { reviewerId: reviewer.id })).status, 400);
    }
    await User.updateOne({ _id: reviewer._id }, { $set: { status: 'active' } });
    assert.deepEqual(await Report.findById(report.id).lean(), beforeSubmit);
    assert.equal(await AuditLog.countDocuments({ resourceId: report._id }), 0);
    assert.equal(await Notification.countDocuments({ relatedId: report._id }), 0);
  });

  test(`${method} ${suffix} supports assigned owner submission and body-less admin submission`, async () => {
    for (const [actor, status, body] of [[owner, 'draft', { reviewerId: reviewer.id }], [admin, 'rejected', undefined]]) {
      const report = await Report.create({ title: 'Submission', type: 'summary', generatedBy: owner._id, status });
      const result = await submit(report, method, suffix, actor, body);
      assert.equal(result.status, 200, JSON.stringify(result.body));
      const saved = await Report.findById(report.id).lean();
      assert.equal(saved.status, 'review');
      if (body) assert.equal(saved.reviewerId.toString(), reviewer.id);
      const audit = await AuditLog.findOne({ resourceId: report._id, action: 'SUBMIT_FOR_REVIEW' }).lean();
      assert.equal(audit.details.previousStatus, status);
      assert.equal(audit.user.toString(), actor.id);
      assert.ok(await Notification.countDocuments({ relatedId: report._id }));
      assert.equal((await submit(report, method, suffix, actor, body)).status, 400);
      assert.equal(await AuditLog.countDocuments({ resourceId: report._id }), 1);
    }
  });
}

test('body-less resubmission revalidates the retained reviewer assignment', async () => {
  const report = await Report.create({ title: 'Retained assignment', type: 'summary', generatedBy: owner._id,
    reviewerId: reviewer._id, status: 'rejected' });
  await User.updateOne({ _id: reviewer._id }, { $set: { status: 'inactive' } });
  assert.equal((await submit(report, 'POST', 'submit-review', owner)).status, 400);
  assert.equal((await Report.findById(report.id)).status, 'rejected');
  await User.updateOne({ _id: reviewer._id }, { $set: { status: 'active' } });
  assert.equal((await submit(report, 'POST', 'submit-review', owner)).status, 200);
});