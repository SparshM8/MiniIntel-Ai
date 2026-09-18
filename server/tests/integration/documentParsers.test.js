const test = require('node:test');
const assert = require('node:assert/strict');
const { extractPptxText } = require('../../services/pptxService');
const PDFDocument = require('pdfkit');
const JSZip = require('jszip');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const os = require('node:os');

test('upload middleware accepts CSV and rejects unsupported MIME types', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mineintel-upload-'));
  const previousDirectory = process.env.UPLOAD_DIR;
  process.env.UPLOAD_DIR = directory;
  const app = require('express')();
  app.post('/', require('../../middleware/upload').single('file'), (request, response) => response.json({ size: request.file.size }));
  app.use((error, request, response, next) => response.status(400).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    const form = new FormData();
    form.append('file', new Blob(['mine,42'], { type: 'text/csv' }), 'mine.csv');
    const response = await fetch(url, { method: 'POST', body: form });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).size, 7);
    const rejected = new FormData();
    rejected.append('file', new Blob(['bad'], { type: 'application/x-msdownload' }), 'bad.exe');
    assert.equal((await fetch(url, { method: 'POST', body: rejected })).status, 400);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    if (previousDirectory === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = previousDirectory;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('PPTX extraction preserves text through the Office parser 8 AST API', async () => {
  const archive = new JSZip();
  archive.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>');
  archive.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>');
  archive.file('ppt/presentation.xml', '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>');
  archive.file('ppt/_rels/presentation.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>');
  archive.file('ppt/slides/slide1.xml', '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Mine A production 42 tonnes</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>');
  const result = await extractPptxText(await archive.generateAsync({ type: 'nodebuffer' }));
  assert.match(result.pages.map(page => page.content).join('\n'), /Mine A production 42 tonnes/);
});

test('OpenAPI nullable retrieval metrics and CI runtime configuration parse correctly', () => {
  const root = path.resolve(__dirname, '../../..');
  const api = YAML.parse(fs.readFileSync(path.join(root, 'openapi.yaml'), 'utf8'));
  assert.equal(api.components.schemas.Report.properties.confidenceScore.nullable, true);
  const workflow = YAML.parse(fs.readFileSync(path.join(root, '.github/workflows/unit-tests.yml'), 'utf8'));
  for (const job of Object.values(workflow.jobs)) {
    if (job.strategy) assert.deepEqual(job.strategy.matrix.node, ['24']);
  }
});

test('PPTX parsing rejects invalid input instead of reporting empty success', async () => {
  await assert.rejects(extractPptxText(Buffer.from('not a presentation')));
});

test('PDF rendering produces nonblank PNG pixels with the patched canvas dependency', async () => {
  const pdf = new PDFDocument({ size: [100, 100], margin: 0 });
  const chunks = [];
  const complete = new Promise((resolve, reject) => {
    pdf.on('data', chunk => chunks.push(chunk));
    pdf.on('end', resolve);
    pdf.on('error', reject);
  });
  pdf.rect(10, 10, 60, 60).fill('#ff0000');
  pdf.end();
  await complete;
  const { convert } = await import('pdf-img-convert');
  const images = await convert(Buffer.concat(chunks), { width: 100 });
  assert.equal(images.length, 1);
  const { createCanvas, loadImage } = require('canvas');
  const image = await loadImage(Buffer.from(images[0]));
  assert.equal(image.width, 100);
  const context = createCanvas(100, 100).getContext('2d');
  context.drawImage(image, 0, 0);
  assert.deepEqual([...context.getImageData(30, 30, 1, 1).data], [255, 0, 0, 255]);
});