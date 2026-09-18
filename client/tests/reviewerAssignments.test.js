import test from 'node:test';
import assert from 'node:assert/strict';
import { assignmentIds, confirmAssignmentSave, MAX_REVIEWERS, parseAssignmentLoad, sameAssignments } from '../src/utils/reviewerAssignments.js';

const documentId = '111111111111111111111111';
const first = 'abcdefabcdefabcdefabcdef';
const second = '222222222222222222222222';
const doc = (ids, assignmentVersion = 0) => ({ success: true, data: { document: { _id: documentId, reviewerIds: ids, assignmentVersion } } });
const user = (id, role = 'reviewer', status = 'active') => ({ _id: id, username: `User ${id}`, role, status });

test('assignment IDs normalize case and duplicates without accepting malformed values', () => {
  assert.deepEqual(assignmentIds([first, first.toUpperCase()]), [first]);
  for (const value of [undefined, null, {}, ['bad'], [42], [{ id: first }]]) {
    assert.throws(() => assignmentIds(value));
  }
  assert.equal(MAX_REVIEWERS, 100);
});

test('assignment equality ignores order but not membership', () => {
  assert.equal(sameAssignments([first, second], [second, first]), true);
  assert.equal(sameAssignments([first], [second]), false);
  assert.equal(sameAssignments([], [first]), false);
});

test('load includes active reviewers and preserves unavailable assignments as removal-only', () => {
  const missing = '333333333333333333333333';
  const result = parseAssignmentLoad(doc([second, missing]), { data: [user(first), user(second, 'reviewer', 'suspended')] }, documentId);
  assert.deepEqual(result.selected, [second, missing]);
  assert.equal(result.assignmentVersion, 0);
  assert.equal(result.choices.find(choice => choice.id === first).eligible, true);
  assert.equal(result.choices.find(choice => choice.id === second).eligible, false);
  assert.equal(result.choices.find(choice => choice.id === missing).eligible, false);
});

test('unassigned users, admins, legacy roles and inactive reviewers are not candidates', () => {
  for (const [role, status] of [['user', 'active'], ['admin', 'active'], ['official', 'active'], ['reviewer', 'inactive'], ['reviewer', undefined]]) {
    const result = parseAssignmentLoad(doc([]), { data: [{ ...user(first, role), status }] }, documentId);
    assert.deepEqual(result.choices, []);
  }
});

test('load fails closed for missing assignment metadata or malformed envelopes', () => {
  for (const response of [{}, doc(undefined), doc(null), doc(['bad']), { success: false, data: doc([]).data }]) {
    assert.throws(() => parseAssignmentLoad(response, { data: [] }, documentId));
  }
  for (const response of [{}, { data: {} }, { data: [null] }, { data: [{ _id: first }] }, { success: false, data: [] }]) {
    assert.throws(() => parseAssignmentLoad(doc([]), response, documentId));
  }
  assert.throws(() => parseAssignmentLoad(doc([]), { data: [] }, second));
});

test('save confirmation requires correct document, success and exact assignment set', () => {
  const response = { success: true, data: { documentId, reviewerIds: [first, second], assignmentVersion: 1 } };
  assert.deepEqual(confirmAssignmentSave(response, documentId, [second, first], 0), [first, second]);
  for (const malformed of [{}, { ...response, success: false }, { ...response, data: { documentId: second, reviewerIds: [first] } },
    { ...response, data: { documentId } }, { ...response, data: { documentId, reviewerIds: [] } }]) {
    assert.throws(() => confirmAssignmentSave(malformed, documentId, [first, second], 0));
  }
  assert.deepEqual(confirmAssignmentSave({ success: true, data: { documentId, reviewerIds: [], assignmentVersion: 5 } }, documentId, [], 4), []);
});

test('load and save reject missing, malformed, stale or non-incremented versions', () => {
  for (const assignmentVersion of [undefined, null, -1, 0.5, '0', Number.MAX_SAFE_INTEGER, Infinity]) {
    const response = doc([]);
    response.data.document.assignmentVersion = assignmentVersion;
    assert.throws(() => parseAssignmentLoad(response, { data: [] }, documentId));
  }
  for (const assignmentVersion of [undefined, null, -1, 0, 2, '1']) {
    assert.throws(() => confirmAssignmentSave({ success: true,
      data: { documentId, reviewerIds: [first], assignmentVersion } }, documentId, [first], 0));
  }
});