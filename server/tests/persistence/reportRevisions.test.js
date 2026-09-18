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

async function raceReportSaves(context, report, requests) {
  const originalSave = Report.prototype.save;
  let release;
  let arrivals = 0;
  const barrier = new Promise(resolve => { release = resolve; });
  const timeout = setTimeout(release, 5000);
  const save = context.mock.method(Report.prototype, 'save', async function (...args) {
    if (this.id === report.id) {
      arrivals += 1;
      if (arrivals === requests.length) release();
      await barrier;
    }
    return originalSave.apply(this, args);
  });
  try {
    const results = await Promise.all(requests.map(request => request()));
    assert.equal(arrivals, requests.length, 'All requests must reach save before release');
    return results;
  } finally {
    clearTimeout(timeout);
    save.mock.restore();
  }
}

test('concurrent approvals persist one decision and reject the stale save', async context => {
  const report = await Report.create({ title: 'Concurrent approval', type: 'summary',
    generatedBy: owner._id, status: 'review' });
  const results = await raceReportSaves(context, report, [
    () => submit(report, 'POST', 'approve', admin, { comments: 'First' }),
    () => submit(report, 'PUT', 'approve', admin, { comments: 'Second' })
  ]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  assert.equal(results.find(result => result.status === 409).body.error, 'REPORT_CONFLICT');
  const saved = await Report.findById(report.id).lean();
  assert.equal(saved.status, 'approved');
  assert.equal(saved.__v, 1);
  assert.equal(await AuditLog.countDocuments({ resourceId: report._id }), 1);
  assert.equal(await Notification.countDocuments({ relatedId: report._id }), 1);
});

for (const legacy of [false, true]) {
  for (const [scenario, initialStatus, operations] of [
    ['approve/reject', 'review', [['POST', 'approve', 'admin'], ['PUT', 'reject', 'reviewer']]],
    ['reject/reject', 'review', [['POST', 'reject', 'reviewer'], ['PUT', 'reject', 'reviewer']]],
    ['edit/approve', 'review', [['PUT', '', 'owner'], ['POST', 'approve', 'admin']]],
    ['edit/reject', 'review', [['PUT', '', 'owner'], ['POST', 'reject', 'reviewer']]],
    ['edit/edit', 'draft', [['PUT', '', 'owner'], ['PUT', '', 'owner']]],
    ['submit/submit', 'draft', [['POST', 'submit-review', 'owner'], ['PUT', 'submit', 'owner']]],
    ['edit/submit', 'draft', [['PUT', '', 'owner'], ['PUT', 'submit', 'owner']]]
  ]) {
    test(`${legacy ? 'legacy' : 'versioned'} ${scenario} race preserves only the winning write`, async context => {
      const actors = { owner, reviewer, admin };
      const report = await Report.create({ title: 'Concurrent workflow', type: 'summary',
        generatedBy: owner._id, reviewerId: reviewer._id, status: initialStatus,
        content: { markdown: 'Original' }, version: 3 });
      if (legacy) await Report.collection.updateOne({ _id: report._id }, { $unset: { __v: 1 } });
      const results = await raceReportSaves(context, report, operations.map(([method, suffix, role], index) =>
        () => submit(report, method, suffix, actors[role], { reason: `Decision ${index}`, markdown: `Edit ${index}` })));
      assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
      assert.equal(results.find(result => result.status === 409).body.error, 'REPORT_CONFLICT');
      const winner = results.findIndex(result => result.status === 200);
      const [, action, role] = operations[winner];
      const saved = await Report.findById(report.id).lean();
      assert.equal(saved.__v, 1);
      assert.equal(saved.status, { approve: 'approved', reject: 'rejected', '': 'draft',
        'submit-review': 'review', submit: 'review' }[action]);
      assert.equal(saved.content.markdown, action === '' ? `Edit ${winner}` : 'Original');
      assert.equal(saved.version, action === '' || action === 'reject' ? 4 : 3);
      assert.equal(saved.previousVersions.length, action === '' || action === 'reject' ? 1 : 0);
      if (saved.previousVersions.length) assert.deepEqual(saved.previousVersions[0].content, { markdown: 'Original' });
      assert.equal(saved.approvedBy?.toString(), action === 'approve' ? admin.id : undefined);
      const audits = await AuditLog.find({ resourceId: report._id }).lean();
      assert.equal(audits.length, 1);
      assert.equal(audits[0].user.toString(), actors[role].id);
      assert.equal(audits[0].action, { approve: 'APPROVE_REPORT', reject: 'REJECT_REPORT',
        '': 'UPDATE_REPORT', 'submit-review': 'SUBMIT_FOR_REVIEW', submit: 'SUBMIT_FOR_REVIEW' }[action]);
      assert.equal(await Notification.countDocuments({ relatedId: report._id }), action === '' ? 0 : 1);
    });
  }
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

for (const method of ['POST', 'PUT']) {
  test(`${method} rejection denies unassigned reviewers without side effects`, async () => {
    for (const reviewerId of [undefined, new mongoose.Types.ObjectId()]) {
      const report = await Report.create({ title: 'Restricted review', type: 'summary',
        generatedBy: owner._id, status: 'review', reviewerId });
      const beforeDecision = await Report.findById(report.id).lean();
      const result = await submit(report, method, 'reject', reviewer, { reason: 'Not assigned' });
      assert.equal(result.status, 403, JSON.stringify(result.body));
      assert.deepEqual(await Report.findById(report.id).lean(), beforeDecision);
      assert.equal(await AuditLog.countDocuments({ resourceId: report._id }), 0);
      assert.equal(await Notification.countDocuments({ relatedId: report._id }), 0);
    }
  });

  test(`${method} assigned reviewer and admin can reject once with persisted reason and history`, async () => {
    for (const actor of [reviewer, admin]) {
      const report = await Report.create({ title: 'Review decision', type: 'summary', generatedBy: owner._id,
        reviewerId: actor === reviewer ? reviewer._id : undefined, status: 'review',
        content: { markdown: 'Evidence' }, version: 4 });
      const result = await submit(report, method, 'reject', actor, { reason: '  Correct the cited value  ' });
      assert.equal(result.status, 200, JSON.stringify(result.body));
      const saved = await Report.findById(report.id).lean();
      assert.equal(saved.status, 'rejected');
      assert.equal(saved.reviewerComments, 'Correct the cited value');
      assert.equal(saved.reviewerId.toString(), actor.id);
      assert.equal(saved.version, 5);
      assert.deepEqual(saved.previousVersions[0].content, { markdown: 'Evidence' });
      const audit = await AuditLog.findOne({ resourceId: report._id, action: 'REJECT_REPORT' });
      assert.equal(audit.user.toString(), actor.id);
      assert.equal((await submit(report, method, 'reject', actor, { reason: 'Again' })).status, 400);
      assert.equal(await AuditLog.countDocuments({ resourceId: report._id }), 1);
    }
  });

  test(`${method} decisions enforce active roles and admin-only final approval`, async () => {
    const report = await Report.create({ title: 'Approval', type: 'summary', generatedBy: owner._id,
      reviewerId: reviewer._id, status: 'review' });
    const beforeDecision = await Report.findById(report.id).lean();
    for (const action of ['approve', 'reject']) {
      assert.equal((await submit(report, method, action, null, { reason: 'Decision' })).status, 401);
      assert.equal((await submit(report, method, action, owner, { reason: 'Decision' })).status, 403);
    }
    assert.equal((await submit(report, method, 'approve', reviewer, {})).status, 403);
    assert.equal((await submit(report, method, 'reject', reviewer, { reason: ' ' })).status, 400);
    await User.updateOne({ _id: reviewer._id }, { $set: { status: 'suspended' } });
    assert.equal((await submit(report, method, 'reject', reviewer, { reason: 'Decision' })).status, 403);
    await User.updateOne({ _id: reviewer._id }, { $set: { status: 'active' } });
    assert.deepEqual(await Report.findById(report.id).lean(), beforeDecision);
    const result = await submit(report, method, 'approve', admin);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    const saved = await Report.findById(report.id).lean();
    assert.equal(saved.status, 'approved');
    assert.equal(saved.approvedBy.toString(), admin.id);
    assert.ok(saved.approvedAt);
    assert.equal((await submit(report, method, 'approve', admin)).status, 400);
  });

  test(`${method} revoked report assignment cannot reject`, async () => {
    const report = await Report.create({ title: 'Revoked assignment', type: 'summary', generatedBy: owner._id,
      reviewerId: reviewer._id, status: 'review' });
    await Report.updateOne({ _id: report._id }, { $unset: { reviewerId: 1 } });
    const beforeDecision = await Report.findById(report.id).lean();
    assert.equal((await submit(report, method, 'reject', reviewer, { reason: 'Decision' })).status, 403);
    assert.deepEqual(await Report.findById(report.id).lean(), beforeDecision);
    assert.equal(await AuditLog.countDocuments({ resourceId: report._id }), 0);
    assert.equal(await Notification.countDocuments({ relatedId: report._id }), 0);
  });
}