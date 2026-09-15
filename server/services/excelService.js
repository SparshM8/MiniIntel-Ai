const { collectSpreadsheetEvidence } = require('../utils/spreadsheetEvidence');

const extractExcelText = async (filePath, xlsx = require('xlsx')) => {
  const workbook = xlsx.readFile(filePath, { cellFormula: true, cellNF: true, cellText: true });
  const pages = [];
  
  workbook.SheetNames.forEach((sheetName, index) => {
    const sheet = workbook.Sheets[sheetName];
    const csvContent = xlsx.utils.sheet_to_csv(sheet);
    
    const spreadsheet = collectSpreadsheetEvidence(sheetName, sheet);
    if (csvContent.trim() || spreadsheet.cells.length || spreadsheet.truncated) {
      pages.push({
        pageNumber: index + 1,
        sourceKind: 'spreadsheet_sheet',
        spreadsheet,
        content: `Sheet: ${sheetName}\n\n${csvContent}`,
        wordCount: csvContent.trim().split(/\s+/).filter(w => w.length > 0).length
      });
    }
  });

  return { pages };
};

const extractCsvText = async (filePath, xlsx = require('xlsx')) => {
  const workbook = xlsx.readFile(filePath, { raw: true, cellFormula: true, cellNF: true, cellText: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const csvContent = xlsx.utils.sheet_to_csv(sheet);
  
  return {
    pages: [{
      pageNumber: 1,
      sourceKind: 'csv_sheet',
      spreadsheet: collectSpreadsheetEvidence(workbook.SheetNames[0], sheet),
      content: csvContent.trim(),
      wordCount: csvContent.trim().split(/\s+/).filter(w => w.length > 0).length
    }]
  };
};

module.exports = { extractExcelText, extractCsvText };
