import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewRequest, REVIEW_REQUEST_TIMEOUT_MS } from '../src/utils/reviewRequest.js';

test('review request default deadline is 30 seconds', () => {
  assert.equal(REVIEW_REQUEST_TIMEOUT_MS, 30000);
});
test('success returns result and clears deadline without aborting', async () => {
  let signal;
  assert.equal(await reviewRequest(config => { signal = config.signal; return 'ok'; }, { timeoutMs: 10 }), 'ok');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(signal.aborted, false);
});
test('synchronous and asynchronous failures propagate unchanged', async () => {
  const error = new Error('synthetic');
  await assert.rejects(reviewRequest(() => { throw error; }), candidate => candidate === error);
  await assert.rejects(reviewRequest(() => Promise.reject(error)), candidate => candidate === error);
});
test('deadline aborts transport without retry and late success cannot resolve request', async () => {
  let signal;
  let release;
  let calls = 0;
  const result = reviewRequest(config => {
    calls++;
    signal = config.signal;
    return new Promise(resolve => { release = resolve; });
  }, { timeoutMs: 10 });
  await assert.rejects(result, error => error.code === 'REVIEW_TIMEOUT' && /may still complete/.test(error.message));
  assert.equal(signal.aborted, true);
  release('late');
  await assert.rejects(result, { code: 'REVIEW_TIMEOUT' });
  assert.equal(calls, 1);
});
