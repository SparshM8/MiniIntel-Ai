const fs = require('fs');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');

const parsePdf = async (dataBuffer) => {
  const pdfParse = require('pdf-parse-new');
  
  function render_page(pageData) {
      let render_options = {
          normalizeWhitespace: false,
          disableCombineTextItems: false
      };
      return pageData.getTextContent(render_options)
      .then(function(textContent) {
          let lastY, text = '';
          for (let item of textContent.items) {
              if (lastY == item.transform[5] || !lastY){
                  text += item.str;
              } else {
                  text += '\n' + item.str;
              }
              lastY = item.transform[5];
          }
          return text + '<<PAGE_BREAK>>';
      });
  }

  try {
    const data = await pdfParse(dataBuffer, { pagerender: render_page });
    const text = data.text;
    
    // pdfParse concatenates results with \n by default, and we added <<PAGE_BREAK>>
    const rawPages = text.split('<<PAGE_BREAK>>');
    const pages = [];
    
    rawPages.forEach((pageContent, index) => {
      const content = pageContent.trim();
      if (content) {
        pages.push({
          pageNumber: index + 1,
          content: content,
          wordCount: content.split(/\s+/).filter(word => word.length > 0).length
        });
      }
    });

    if (pages.map(page => page.content).join('\n').trim().length < 10) {
      return { pages: [], needsOcr: true };
    }
    return { pages, needsOcr: false };
  } catch (error) {
    console.error("PDF Parsing error:", error.message);
    // If it completely fails to parse (e.g. bad xref), we can fallback to OCR 
    // assuming it might be a malformed or scanned PDF
    return { pages: [], needsOcr: true };
  }
};

const extractPdfText = async (filePath) => {
  const dataBuffer = fs.readFileSync(filePath);
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, { workerData: { pdfBuffer: dataBuffer } });
    let result;
    let failure;
    worker.once('message', message => { result = message; });
    worker.once('error', error => { failure = error; });
    worker.once('exit', code => {
      if (failure) return reject(failure);
      if (code !== 0 || !result) return reject(new Error('PDF parser worker exited without a result'));
      resolve(result);
    });
  });
};

if (!isMainThread && workerData?.pdfBuffer) {
  parsePdf(Buffer.from(workerData.pdfBuffer)).then(result => parentPort.postMessage(result));
}

module.exports = { extractPdfText };
