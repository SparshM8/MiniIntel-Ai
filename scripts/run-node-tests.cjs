const { readdirSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { spawnSync } = require('node:child_process');

function discover(directory, recursive) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return recursive ? discover(path, true) : [];
    return entry.isFile() && entry.name.endsWith('.test.js') ? [path] : [];
  }).sort();
}

try {
  const [directory, option] = process.argv.slice(2);
  if (!directory || (option && option !== '--recursive') || process.argv.length > 4) {
    throw new Error('Usage: node run-node-tests.cjs <directory> [--recursive]');
  }
  const files = discover(resolve(directory), option === '--recursive');
  if (files.length === 0) throw new Error(`No .test.js files found in ${directory}`);
  console.log(`Running ${files.length} test file(s) with ${process.version}`);
    // Explicit paths, no shell, and one worker keep discovery cross-platform and
  // prevent integration files from racing over process-global resources/caches.
  const child = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], {
    stdio: 'inherit', shell: false
  });
  if (child.error) throw child.error;
  process.exitCode = child.status ?? 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
