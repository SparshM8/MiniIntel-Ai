const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTopicOverview } = require('../utils/topicOverview');

test('topic overview counts unique accessible documents without invented taxonomy or scores', () => {
  const result = buildTopicOverview([
    { _id: 'owned', extractedText: 'Coal coal and safety. COAL production.' },
    { _id: 'assigned', extractedText: 'Safety coal' },
    { _id: 'pending' }
  ], [
    { _id: 'topic', name: 'Safety', documents: ['owned', 'owned', 'assigned', 'hidden'] },
    { _id: 'private-topic', name: 'Private', documents: ['hidden'] }
  ]);
  assert.deepEqual(result.meta, { topicCount: 1, analyzedDocuments: 2, processedDocuments: 2 });
  assert.deepEqual(result.data, [{ _id: 'topic', name: 'Safety', documentCount: 2 }]);
  assert.deepEqual(result.wordCloud[0], { text: 'coal', count: 4, documentCount: 2 });
  assert.deepEqual(result.wordCloud[1], { text: 'safety', count: 2, documentCount: 2 });
  assert.ok(!result.wordCloud.some(word => word.text === 'and'));
});

test('empty corpus stays empty and words beyond the old 5000-character window are counted', () => {
  assert.deepEqual(buildTopicOverview([], []), { data: [], meta: { topicCount: 0, analyzedDocuments: 0, processedDocuments: 0 }, wordCloud: [] });
  const result = buildTopicOverview([{ _id: 'long', extractedText: `${'the '.repeat(1500)}geology geology` }], []);
  assert.deepEqual(result.wordCloud, [{ text: 'geology', count: 2, documentCount: 1 }]);
});

test('word list is deterministic, bounded, excludes numbers and preserves Unicode letters', () => {
  const result = buildTopicOverview([{ _id: 'sample', extractedText: '123 45 THE Safety safety geology café' }], []);
  assert.deepEqual(result.wordCloud.map(word => word.text), ['safety', 'café', 'geology']);
  assert.ok(result.wordCloud.length <= 80);
});