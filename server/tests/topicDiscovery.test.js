const test = require('node:test');
const assert = require('node:assert/strict');
const { discoverTextTopics } = require('../services/topicDiscovery');
const { discoverTextEntities } = require('../services/entityDiscovery');

test('topic discovery examines all supported text and merges duplicate topics', async () => {
  const prompts = [];
  const result = await discoverTextTopics(`${'production '.repeat(1500)}LATE_GEOLOGY`, async (system, prompt) => {
    prompts.push(prompt);
    return { topics: [{ name: prompts.length === 1 ? 'Coal' : 'coal', keywords: [prompts.length === 1 ? 'production' : 'geology'], weight: 0.5 }] };
  }, 'topic prompt');
  assert.equal(prompts.length, 2);
  assert.ok(prompts[1].includes('LATE_GEOLOGY'));
  assert.deepEqual(result, [{ name: 'Coal', keywords: ['production', 'geology'], weight: 0.5 }]);
});

test('oversized text is rejected before spending API calls', async () => {
  let calls = 0;
  await assert.rejects(discoverTextTopics('x'.repeat(96001), async () => { calls++; }, ''), { code: 'TOPIC_DOCUMENT_TOO_LARGE' });
  assert.equal(calls, 0);
});

test('failed or malformed segments never yield partial success', async () => {
  let calls = 0;
  await assert.rejects(discoverTextTopics('text '.repeat(3000), async () => {
    calls++;
    if (calls === 2) throw new Error('provider unavailable');
    return { topics: [{ name: 'Coal', keywords: ['coal'], weight: 1 }] };
  }, ''), /provider unavailable/);
  await assert.rejects(discoverTextTopics('coal', async () => ({ topics: [{ name: 'Coal', keywords: [], weight: 5 }] }), ''), /invalid topic data/);
  await assert.rejects(discoverTextTopics('coal', async () => ({}), ''), /invalid response/);
});

test('entity discovery includes late text and merges mentions across all supported segments', async () => {
  const prompts = [];
  const entities = await discoverTextEntities('coal '.repeat(3000) + 'Late Mine', async (system, prompt) => {
    prompts.push(prompt);
    return { entities: [{ name: 'Mine A', type: 'Mine', mentions: 2 }] };
  }, '');
  assert.equal(prompts.length, 2);
  assert.ok(prompts[1].includes('Late Mine'));
  assert.deepEqual(entities, [{ name: 'Mine A', type: 'Mine', mentions: 4 }]);
});

test('entity discovery rejects oversize, malformed and failed segments without partial success', async () => {
  let calls = 0;
  await assert.rejects(discoverTextEntities('x'.repeat(96001), async () => { calls++; }, ''), { code: 'ENTITY_DOCUMENT_TOO_LARGE' });
  assert.equal(calls, 0);
  await assert.rejects(discoverTextEntities('coal', async () => ({}), ''), /invalid response/);
  await assert.rejects(discoverTextEntities('coal', async () => ({ entities: [{ name: 'Mine', type: 'Mine', mentions: -1 }] }), ''), /invalid entity data/);
  await assert.rejects(discoverTextEntities('coal '.repeat(3000), async () => {
    if (++calls === 2) throw new Error('provider unavailable');
    return { entities: [] };
  }, ''), /provider unavailable/);
});