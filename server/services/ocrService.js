const { createWorker } = require('tesseract.js');
const fs = require('fs');
const path = require('path');

const performOcr = async (filePath) => {
  let worker = null;
  const ext = path.extname(filePath).toLowerCase();
  
  try {
    const options = {};
    if (process.env.OCR_LANG_PATH) options.langPath = process.env.OCR_LANG_PATH;
    if (process.env.OCR_CACHE_PATH) options.cachePath = process.env.OCR_CACHE_PATH;
    worker = await createWorker('eng', undefined, options);
    
    // If it's a PDF, we need to convert pages to images first
    if (ext === '.pdf') {
      const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const { createCanvas } = require('canvas');
      class CanvasFactory {
        create(width, height) {
          const canvas = createCanvas(width, height);
          return { canvas, context: canvas.getContext('2d') };
        }
        reset(target, width, height) {
          target.canvas.width = width;
          target.canvas.height = height;
        }
        destroy(target) {
          target.canvas.width = 0;
          target.canvas.height = 0;
          target.canvas = null;
          target.context = null;
        }
      }
      const task = getDocument({ data: new Uint8Array(fs.readFileSync(filePath)),
        CanvasFactory, disableFontFace: true, isOffscreenCanvasSupported: false });
      const pages = [];
      try {
        const document = await task.promise;
        const factory = new CanvasFactory();
        for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
          const page = await document.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 2000 / page.getViewport({ scale: 1 }).width });
          const target = factory.create(viewport.width, viewport.height);
          try {
            await page.render({ canvasContext: target.context, viewport }).promise;
            const { data: { text } } = await worker.recognize(target.canvas.toBuffer('image/png'));
            pages.push({ pageNumber, content: text.trim(),
              wordCount: text.trim().split(/\s+/).filter(word => word.length > 0).length });
          } finally {
            factory.destroy(target);
            page.cleanup();
          }
        }
      } finally {
        await task.destroy();
      }
      return { pages };
    } 
    
    // For normal images
    const { data: { text } } = await worker.recognize(filePath);
    return {
      pages: [{
        pageNumber: 1,
        content: text.trim(),
        wordCount: text.trim().split(/\s+/).filter(word => word.length > 0).length
      }]
    };
  } catch (error) {
    throw new Error(`OCR Error: ${error.message}`);
  } finally {
    if (worker) {
      await worker.terminate();
    }
  }
};

module.exports = { performOcr };
