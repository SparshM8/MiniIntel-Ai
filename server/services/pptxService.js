const officeParser = require('officeparser');

const extractPptxText = async (filePath) => {
  try {
    const parsed = await officeParser.parseOffice(filePath);
    const { value: text } = await parsed.to('text');
    
    // officeparser returns raw text. We can chunk it by logical page or length.
    
    const rawChunks = text.split('\n\n').filter(c => c.trim().length > 0);
    const pages = [];
    let currentPageText = '';
    let pageNumber = 1;

    for (const chunk of rawChunks) {
      if (currentPageText.length + chunk.length > 2000) {
        pages.push({
          pageNumber,
          content: currentPageText.trim(),
          wordCount: currentPageText.trim().split(/\s+/).filter(w => w.length > 0).length
        });
        pageNumber++;
        currentPageText = chunk + '\n\n';
      } else {
        currentPageText += chunk + '\n\n';
      }
    }

    if (currentPageText.trim().length > 0) {
      pages.push({
        pageNumber,
        content: currentPageText.trim(),
        wordCount: currentPageText.trim().split(/\s+/).filter(w => w.length > 0).length
      });
    }

    return { pages };
  } catch (error) {
    console.error("PPTX Parsing error:", error.message);
    throw error;
  }
};

module.exports = { extractPptxText };
