const fs = require('node:fs');
const { calculateBenchmark } = require('../server/utils/benchmarkMetrics');

try {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/evaluate-benchmark.cjs <measurements.json>');
  console.log(JSON.stringify(calculateBenchmark(JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))), null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}