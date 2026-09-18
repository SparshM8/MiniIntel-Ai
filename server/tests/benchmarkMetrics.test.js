const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateBenchmark } = require('../utils/benchmarkMetrics');
const { reportRetrievalMetrics, reportRetrievalLabel } = require('../utils/reportRetrievalMetrics');

test('benchmark computes measured percentages with completeness separate from accuracy', () => {
  const result = calculateBenchmark({
    time: { manualSeconds: 100, assistedSeconds: 40 },
    extraction: { correct: 8, required: 10 },
    reportFacts: { supportedCorrect: 3, checkable: 4 },
    reportCompleteness: { includedRequired: 4, required: 8 },
    automation: { automated: 6, eligible: 10 }
  });
  assert.equal(result.metrics.time.reductionPercentage, 60);
  assert.equal(result.metrics.extraction.percentage, 80);
  assert.equal(result.metrics.reportFacts.percentage, 75);
  assert.equal(result.metrics.reportCompleteness.percentage, 50);
  assert.equal(result.metrics.automation.percentage, 60);
});

test('no applicable denominator is unknown and slower assisted tasks remain negative', () => {
  const result = calculateBenchmark({ time: { manualSeconds: 100, assistedSeconds: 150 }, extraction: { correct: 0, required: 0 } });
  assert.equal(result.metrics.time.reductionPercentage, -50);
  assert.equal(result.metrics.extraction.percentage, null);
  assert.equal(result.metrics.reportFacts, undefined);
});

test('benchmark rejects invalid or fabricated measurement counts', () => {
  for (const input of [null, {}, [], { extraction: { correct: 3, required: 2 } },
    { extraction: { correct: -1, required: 2 } }, { automation: { automated: '2', eligible: 4 } },
    { reportFacts: { supportedCorrect: 1.5, checkable: 4 } }, { time: { manualSeconds: 0, assistedSeconds: 4 } },
    { time: { manualSeconds: 10, assistedSeconds: Infinity } }]) assert.throws(() => calculateBenchmark(input));
});

test('report metrics preserve low similarity and do not invent accuracy for missing or legacy evidence', () => {
  assert.equal(reportRetrievalMetrics([{ similarityScore: 0.1 }]).confidenceScore, 0.1);
  assert.equal(reportRetrievalMetrics([{ similarity: 0 }]).confidenceScore, 0);
  assert.equal(reportRetrievalMetrics([]).confidenceScore, null);
  assert.equal(reportRetrievalMetrics([]).evidenceCoverage.percentage, null);
  assert.equal(reportRetrievalMetrics([{ similarity: 8 }]).confidenceScore, null);
  assert.match(reportRetrievalLabel({ confidenceScore: 0.98 }), /similarity: N\/A/);
  assert.match(reportRetrievalLabel({}), /Accuracy not evaluated/);
  assert.equal(reportRetrievalMetrics([{ similarity: 0.1 }, { similarity: 0.5 }]).evidenceCoverage.percentage, 50);
});