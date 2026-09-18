const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { extractPdfText } = require('../server/services/pdfService');

const source = {
  url: 'https://coal.nic.in/sites/default/files/2026-05/Press_19may26.pdf',
  sha256: 'c21a65df57bfca30d3bfd460877a277e9df7fd4ff4f549af941726312d7e3ed4',
  title: 'Coal Production commences from Urtan and Dhirauli Mines in Madhya Pradesh',
  listing: 'https://coal.nic.in/',
  expected: ['Urtan', 'Dhirauli', 'Madhya Pradesh']
};

async function main() {
  const response = await fetch(source.url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Public source returned HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 5 * 1024 * 1024 || !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Unexpected source format or size');
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== source.sha256) throw new Error(`Source changed: ${hash}. Review the new document before updating the reference.`);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mineintel-public-benchmark-'));
  try {
    const filePath = path.join(directory, 'source.pdf');
    await fs.writeFile(filePath, bytes);
    const started = performance.now();
    const originalLog = console.log;
    let result;
    try {
      console.log = () => {};
      result = await extractPdfText(filePath);
    } finally { console.log = originalLog; }
    const elapsedMs = performance.now() - started;
    const text = result.pages.map(page => page.content).join('\n');
    const evidence = source.expected.map(value => ({ value, preserved: text.includes(value) }));
    const passed = !result.needsOcr && evidence.every(item => item.preserved);
    console.log(JSON.stringify({
      kind: 'public-pdf-parser-smoke', source, retrievedAt: new Date().toISOString(),
      bytes: bytes.length, pages: result.pages.length, elapsedMs: Math.round(elapsedMs), evidence, passed,
      limitations: 'Three English place-name checks from the official listing title. Not an independent field-accuracy, Hindi/OCR, report-quality, AI or load benchmark. No AI requests or database writes.'
    }, null, 2));
    if (!passed) process.exitCode = 1;
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });