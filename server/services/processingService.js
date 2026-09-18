const { getUploadPath } = require('../config/storage');
const { toDocumentPageRecord } = require('../utils/documentPageRecord');
const Document = require('../models/Document');
const { classifyDocument } = require('./llmService');
const processDocument = async (documentId, updateProgress = async () => {}) => {
    const document = await Document.findById(documentId);
    if (!document) throw new Error('Document not found');
  return processDocumentFromRecord(document, updateProgress);
};

const processDocumentFromRecord = async (document, updateProgress = async () => {}) => {
    const filePath = getUploadPath(document.filename);
    let extractedPages = [];
    await updateProgress('Reading file', 20);

    if (document.fileType === 'pdf') {
      const { extractPdfText } = require('./pdfService');
      const result = await extractPdfText(filePath);
      await updateProgress('Extracting text', 40);
      if (result.needsOcr) {
        const { performOcr } = require('./ocrService');
        await updateProgress('Performing OCR', 40);
        const ocrResult = await performOcr(filePath);
        extractedPages = ocrResult.pages;
      } else {
        extractedPages = result.pages;
      }
    } else if (document.fileType === 'image') {
      const { performOcr } = require('./ocrService');
      const ocrResult = await performOcr(filePath);
      extractedPages = ocrResult.pages;
    } else if (document.fileType === 'docx') {
      const { extractDocxText } = require('./docxService');
      const docxResult = await extractDocxText(filePath);
      extractedPages = docxResult.pages;
    } else if (document.fileType === 'xlsx') {
      const { extractExcelText } = require('./excelService');
      const excelResult = await extractExcelText(filePath);
      extractedPages = excelResult.pages;
    } else if (document.fileType === 'csv') {
      const { extractCsvText } = require('./excelService');
      const csvResult = await extractCsvText(filePath);
      extractedPages = csvResult.pages;
    } else if (document.fileType === 'pptx') {
      const { extractPptxText } = require('./pptxService');
      const pptxResult = await extractPptxText(filePath);
      extractedPages = pptxResult.pages;
    } else {
      throw new Error('Unsupported document type');
    }
    if (!extractedPages.length || !extractedPages.some(page => page.content?.trim())) {
      throw new Error('No readable document content extracted');
    }
    await updateProgress('Extracting text', 60);
    const concatenatedText = extractedPages.map(page => page.content).join('\n\n').trim();
    const pageRecords = extractedPages.map(page => toDocumentPageRecord(document._id, page));
    await updateProgress('Classifying document', 80);
    const category = await classifyDocument(concatenatedText);
    await updateProgress('Publishing pages', 95);
    return { category, text: concatenatedText, pages: pageRecords };
};

module.exports = { processDocument, processDocumentFromRecord };
