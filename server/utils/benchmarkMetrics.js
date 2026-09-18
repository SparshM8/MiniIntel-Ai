function calculateBenchmark(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected a measurement object');
  const metrics = {};
  const ratio = (key, numerator, denominator) => {
    const item = input[key];
    if (item === undefined) return;
    if (!item || !Number.isSafeInteger(item[numerator]) || !Number.isSafeInteger(item[denominator]) ||
        item[numerator] < 0 || item[denominator] < 0 || item[numerator] > item[denominator]) {
      throw new Error(`Invalid counts for ${key}`);
    }
    metrics[key] = { ...item, percentage: item[denominator] === 0 ? null : Number((100 * item[numerator] / item[denominator]).toFixed(2)) };
  };
  ratio('extraction', 'correct', 'required');
  ratio('reportFacts', 'supportedCorrect', 'checkable');
  ratio('reportCompleteness', 'includedRequired', 'required');
  ratio('automation', 'automated', 'eligible');
  if (input.time !== undefined) {
    const time = input.time;
    if (!time || !Number.isFinite(time.manualSeconds) || time.manualSeconds <= 0 ||
        !Number.isFinite(time.assistedSeconds) || time.assistedSeconds < 0) throw new Error('Invalid timing measurements');
    metrics.time = { ...time, reductionPercentage: Number((100 * (time.manualSeconds - time.assistedSeconds) / time.manualSeconds).toFixed(2)) };
  }
  if (!Object.keys(metrics).length) throw new Error('No recognized measurements supplied');
  return { metrics, notice: 'Calculated from supplied measurements, not independent verification. Null means no applicable denominator.' };
}

module.exports = { calculateBenchmark };