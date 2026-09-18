const test = require('node:test');
const assert = require('node:assert/strict');
const { extractPptxText } = require('../../services/pptxService');
const PDFDocument = require('pdfkit');
const JSZip = require('jszip');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const os = require('node:os');

test('processing pipeline parses real CSV without writing results before publication', async () => {
  const Document = require('../../models/Document');
  const llm = require('../../services/llmService');
  const originalFind = Document.findById;
  const originalClassify = llm.classifyDocument;
  const originalDirectory = process.env.UPLOAD_DIR;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mineintel-processing-'));
  const documentId = new (require('mongoose').Types.ObjectId)();
  const servicePath = require.resolve('../../services/processingService');
  process.env.UPLOAD_DIR = directory;
  try {
    fs.writeFileSync(path.join(directory, 'mine.csv'), 'mine,production\nMine A,42\n');
    Document.findById = async () => ({ _id: documentId, filename: 'mine.csv', fileType: 'csv' });
    llm.classifyDocument = async text => {
      assert.match(text, /Mine A/);
      assert.match(text, /42/);
      return 'Production';
    };
    delete require.cache[servicePath];
    const { processDocument } = require(servicePath);
    const progress = [];
    const result = await processDocument(documentId, async (step, value) => progress.push(value));
    assert.equal(result.category, 'Production');
    assert.equal(result.pages.length, 1);
    assert.equal(String(result.pages[0].documentId), String(documentId));
    assert.match(result.text, /Mine A/);
    assert.deepEqual(progress, [20, 60, 80, 95]);
    fs.unlinkSync(path.join(directory, 'mine.csv'));
    await assert.rejects(processDocument(documentId));
  } finally {
    Document.findById = originalFind;
    llm.classifyDocument = originalClassify;
    delete require.cache[servicePath];
    if (originalDirectory === undefined) delete process.env.UPLOAD_DIR; else process.env.UPLOAD_DIR = originalDirectory;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

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

test('PDF rendering after text extraction preserves scanned fallback and nonblank PNG pixels', async () => {
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
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mineintel-pdf-fallback-'));
  try {
    const filePath = path.join(directory, 'scanned.pdf');
    fs.writeFileSync(filePath, Buffer.concat(chunks));
    const parsed = await require('../../services/pdfService').extractPdfText(filePath);
    assert.equal(parsed.needsOcr, true);
    assert.deepEqual(parsed.pages, []);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
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

test('real OCR recognizes a clean image and scanned PDF through the production task', {
  skip: process.env.RUN_OCR_SMOKE !== '1', timeout: 180000
}, async () => {
  const { Worker } = require('node:worker_threads');
  const { runTask } = require('../../services/processingTask');
  const { createCanvas } = require('canvas');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mineintel-ocr-'));
  try {
    const canvas = createCanvas(1600, 500);
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 1600, 500);
    context.fillStyle = '#000000';
    context.font = '60px Arial';
    context.fillText('MINE PRODUCTION REPORT', 80, 130);
    context.fillText('Coal production 420 tonnes', 80, 250);
    context.fillText('Dispatch 380 tonnes', 80, 370);
    const png = canvas.toBuffer('image/png');
    fs.writeFileSync(path.join(directory, 'scan.png'), png);
    const pdf = new PDFDocument({ size: [800, 250], margin: 0 });
    const chunks = [];
    const complete = new Promise((resolve, reject) => {
      pdf.on('data', chunk => chunks.push(chunk));
      pdf.on('end', resolve);
      pdf.on('error', reject);
    });
    pdf.image(png, 0, 0, { width: 800 });
    pdf.end();
    await complete;
    fs.writeFileSync(path.join(directory, 'scan.pdf'), Buffer.concat(chunks));
    for (const [filename, fileType] of [['scan.png', 'image'], ['scan.pdf', 'pdf']]) {
      const thread = new Worker(`
        const { workerData } = require('node:worker_threads');
        require(workerData.llmPath).classifyDocument = async () => 'Production';
        require(workerData.taskPath);
      `, { eval: true, env: { ...process.env, UPLOAD_DIR: directory, OCR_CACHE_PATH: directory }, workerData: {
        llmPath: require.resolve('../../services/llmService'),
        taskPath: require.resolve('../../services/processingTask'),
        document: { _id: '507f1f77bcf86cd799439011', filename, fileType }
      } });
      const result = await runTask(thread, { timeoutMs: 85000 });
      assert.equal(result.pages.length, 1);
      assert.equal(result.pages[0].pageNumber, 1);
      assert.match(result.text, /MINE PRODUCTION REPORT/i);
      assert.match(result.text, /Coal production\s+420\s+tonnes/i);
      assert.match(result.text, /Dispatch\s+380\s+tonnes/i);
      assert.equal(thread.threadId, -1);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('isolated PDF parsers preserve digital text and page numbers after renderer initialization', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mineintel-digital-pdf-'));
  const pdf = new PDFDocument();
  const chunks = [];
  const complete = new Promise((resolve, reject) => {
    pdf.on('data', chunk => chunks.push(chunk));
    pdf.on('end', resolve);
    pdf.on('error', reject);
  });
  pdf.text('Mine A production: 42 tonnes');
  pdf.addPage().text('Mine B production: 18 tonnes');
  pdf.end();
  try {
    await complete;
    const filePath = path.join(directory, 'production.pdf');
    fs.writeFileSync(filePath, Buffer.concat(chunks));
    const { extractPdfText } = require('../../services/pdfService');
    const results = await Promise.all([extractPdfText(filePath), extractPdfText(filePath)]);
    for (const result of results) {
      assert.equal(result.needsOcr, false);
      assert.deepEqual(result.pages.map(page => page.pageNumber), [1, 2]);
      assert.match(result.pages[0].content, /Mine A production: 42 tonnes/);
      assert.match(result.pages[1].content, /Mine B production: 18 tonnes/);
      assert.ok(result.pages.every(page => !page.content.includes('<<PAGE_BREAK>>')));
    }
    await assert.rejects(extractPdfText(path.join(directory, 'missing.pdf')), /ENOENT/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});