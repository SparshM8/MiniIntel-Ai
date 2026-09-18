const Report = require('../models/Report');
const Document = require('../models/Document');
const User = require('../models/User');
const { reportRetrievalMetrics, reportRetrievalLabel } = require('../utils/reportRetrievalMetrics');
const ragService = require('./ragService');
const llmService = require('./llmService');
const auditService = require('./auditService');
const miningIntelligenceService = require('./miningIntelligenceService');
const PDFDocument = require('pdfkit');
const {
  Document: DocxDocument,
  Paragraph,
  TextRun,
  Packer,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType
} = require('docx');

// Helper to strip any raw markdown tokens (**bold**, *italic*, # headings, etc.)
function stripMarkdownArtifacts(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/^#+\s*/g, '')
    .replace(/\*\*\*(.*?)\*\*\*/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/___(.*?)___/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/^[-*+]\s+/g, '')
    .replace(/##+/g, '')
    .trim();
}

// Helper to parse inline markdown formatting into Docx TextRun array
function parseInlineDocxRuns(text, baseOptions = {}) {
  if (!text) return [new TextRun({ text: '', ...baseOptions })];
  const regex = /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*|___[^_]+___|__[^_]+__|_[^_]+_|`[^`]+`)/g;
  const parts = String(text).split(regex);
  const runs = [];

  for (const part of parts) {
    if (!part) continue;
    if ((part.startsWith('***') && part.endsWith('***')) || (part.startsWith('___') && part.endsWith('___'))) {
      const clean = part.slice(3, -3);
      runs.push(new TextRun({ text: clean, bold: true, italics: true, ...baseOptions }));
    } else if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
      const clean = part.slice(2, -2);
      runs.push(new TextRun({ text: clean, bold: true, ...baseOptions }));
    } else if ((part.startsWith('*') && part.endsWith('*') && part.length > 2) || (part.startsWith('_') && part.endsWith('_') && part.length > 2)) {
      const clean = part.slice(1, -1);
      runs.push(new TextRun({ text: clean, italics: true, ...baseOptions }));
    } else if (part.startsWith('`') && part.endsWith('`')) {
      const clean = part.slice(1, -1);
      runs.push(new TextRun({ text: clean, font: 'Consolas', ...baseOptions }));
    } else {
      const clean = part.replace(/\*\*/g, '').replace(/\*/g, '').replace(/^#+\s*/g, '');
      if (clean) {
        runs.push(new TextRun({ text: clean, ...baseOptions }));
      }
    }
  }

  return runs.length > 0 ? runs : [new TextRun({ text: '', ...baseOptions })];
}

// Helper to render PDF inline formatting with PDFKit
function renderPdfFormattedLine(doc, line) {
  const cleanLine = String(line || '').trim();
  if (!cleanLine) return;

  const regex = /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*|___[^_]+___|__[^_]+__|_[^_]+_|`[^`]+`)/g;
  const parts = cleanLine.split(regex);
  const tokens = [];

  for (const part of parts) {
    if (!part) continue;
    if ((part.startsWith('***') && part.endsWith('***')) || (part.startsWith('___') && part.endsWith('___'))) {
      tokens.push({ text: part.slice(3, -3), bold: true, italics: true });
    } else if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
      tokens.push({ text: part.slice(2, -2), bold: true });
    } else if ((part.startsWith('*') && part.endsWith('*') && part.length > 2) || (part.startsWith('_') && part.endsWith('_') && part.length > 2)) {
      tokens.push({ text: part.slice(1, -1), italics: true });
    } else if (part.startsWith('`') && part.endsWith('`')) {
      tokens.push({ text: part.slice(1, -1), font: 'Courier' });
    } else {
      const clean = part.replace(/\*\*/g, '').replace(/\*/g, '').replace(/^#+\s*/g, '');
      if (clean) tokens.push({ text: clean });
    }
  }

  if (tokens.length === 0) return;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const isLast = i === tokens.length - 1;
    let fontName = 'Helvetica';
    if (tok.bold && tok.italics) fontName = 'Helvetica-BoldOblique';
    else if (tok.bold) fontName = 'Helvetica-Bold';
    else if (tok.italics) fontName = 'Helvetica-Oblique';
    else if (tok.font === 'Courier') fontName = 'Courier';

    doc.font(fontName).fontSize(9.5).fillColor('#1e293b').text(tok.text, { continued: !isLast });
  }
  doc.moveDown(0.25);
}

const generateReport = async (data, type, userId, reqContext = {}) => {
  const {
    documentId,
    instructions,
    template,
    period,
    mineName,
    subsidiary,
    subject,
    title,
    keyAreas,
    comparisonPeriod,
    includeRecommendations = true,
    includeAppendix = true
  } = data || {};

  // Set reqContext flags for quota isolation and strict mode
  reqContext.isReport = true;
  reqContext.isComplex = true;
  reqContext.maxCalls = reqContext.maxCalls || 5;
  reqContext.maxEmbeddingCalls = reqContext.maxEmbeddingCalls || 20;

  // Build targeted RAG search query
  let searchQuery = type;
  if (title) searchQuery += ' ' + title.trim();
  if (instructions) searchQuery += ' ' + instructions.trim();
  if (template) searchQuery += ' ' + template.trim();
  if (period) searchQuery += ' ' + period.trim();
  if (mineName) searchQuery += ' ' + mineName.trim();
  if (subject) searchQuery += ' ' + subject.trim();
  if (Array.isArray(keyAreas) && keyAreas.length > 0) searchQuery += ' ' + keyAreas.join(' ');

  // Scoped RAG filters
  const ragFilters = {};
  if (documentId) ragFilters.documentId = documentId;
  if (mineName) ragFilters.mine = mineName;
  if (period) ragFilters.period = period;
  if (subsidiary) ragFilters.subsidiary = subsidiary;
  if (subject) ragFilters.subject = subject;

  // 1. Retrieve bounded, scoped chunks (bounded topK = 5)
  const requestingUser = await User.findById(userId).select('_id role status').lean();
  if (!requestingUser || ['inactive', 'suspended'].includes(requestingUser.status)) {
    throw new Error('Active report requester required');
  }
  let rawChunks = [];
  try {
    rawChunks = await ragService.searchSimilar(searchQuery, 5, {
      reqContext,
      user: requestingUser,
      filters: ragFilters
    });
  } catch (ragErr) {
    console.warn('[Report Generation] RAG search error:', ragErr.message);
    if (ragErr.code === 'AI_CONTEXT_LIMIT' || ragErr.code === 'AI_RATE_LIMIT') {
      throw ragErr;
    }
    rawChunks = [];
  }

  // Deduplicate chunks by chunkId and content similarity
  const seenChunkIds = new Set();
  const seenSnippets = new Set();
  const similarChunks = [];

  for (const chunk of rawChunks) {
    const chunkId = chunk.chunkId ? chunk.chunkId.toString() : (chunk._id ? chunk._id.toString() : null);
    const snippetKey = (chunk.content || '').replace(/\s+/g, ' ').substring(0, 60).toLowerCase();

    if (chunkId && seenChunkIds.has(chunkId)) continue;
    if (snippetKey && seenSnippets.has(snippetKey)) continue;

    if (chunkId) seenChunkIds.add(chunkId);
    if (snippetKey) seenSnippets.add(snippetKey);
    similarChunks.push(chunk);
    if (similarChunks.length >= 5) break;
  }

  // Build bounded evidence context (concise excerpts)
  let contextText = '';
  let totalChars = 0;
  const MAX_RAG_CHARS = 3500;

  for (let i = 0; i < similarChunks.length; i++) {
    const chunk = similarChunks[i];
    const pageLabel = chunk.pageNumber != null ? `Page ${chunk.pageNumber}` : 'Page N/A';
    const docName = chunk.documentId?.originalName || chunk.documentId?.filename || chunk.documentName || 'Mining Document';
    // Bound each chunk excerpt to max 450 characters
    const boundedChunkContent = (chunk.content || '').trim().substring(0, 450);
    const chunkEntry = `--- Source Reference ${i + 1} — ${docName} [${pageLabel}] ---\n${boundedChunkContent}\n\n`;

    if (totalChars + chunkEntry.length > MAX_RAG_CHARS) {
      console.log(`[Report Context] Bounded RAG chunks to ${i} items (${totalChars} chars) to protect API limits.`);
      break;
    }
    contextText += chunkEntry;
    totalChars += chunkEntry.length;
  }

  // 2. Inject Deterministic Calculations and Anomaly Findings
  let deterministicContext = '';
  try {
    const intelligenceResult = await miningIntelligenceService.analyzeDataAndFindAnomalies({
      reqContext,
      user: requestingUser,
      filters: ragFilters,
      documentId,
      mineName,
      period,
      subsidiary
    });

    if (intelligenceResult) {
      const { summaryText, evidenceText } = intelligenceResult;
      deterministicContext += '\n=== VERIFIED DETERMINISTIC METRICS & ANOMALIES ===\n';
      if (summaryText) deterministicContext += summaryText.substring(0, 2500) + '\n';
      if (evidenceText) deterministicContext += evidenceText.substring(0, 1000) + '\n';
    }
  } catch (intelErr) {
    console.warn('[Report Generation] Mining intelligence injection skipped:', intelErr.message);
  }

  // Total context boundary (bounded strictly to 6000 chars to avoid TPM/RPM rate limits)
  const fullContext = contextText + '\n' + deterministicContext;
  const boundedFullContext = fullContext.length > 6000
    ? fullContext.substring(0, 6000) + '\n\n[... Remaining data bounded to protect API limits]'
    : fullContext;

  // 3. Evidence-First Enterprise Prompt Construction
  const keyAreasList = Array.isArray(keyAreas) && keyAreas.length > 0
    ? keyAreas.join(', ')
    : 'Production, Dispatch, Target Variance, Equipment Reliability, Operational Constraints';

  const reportMainTitle = (title && typeof title === 'string' && title.trim())
    ? title.trim()
    : `${type} Report - ${period ? period.trim() : new Date().toLocaleDateString('en-GB')}`;

  const systemPrompt = `You are an expert Chief Mining Intelligence Officer & Enterprise Report Author for MineIntel AI.
Generate a comprehensive, publication-grade enterprise mining report of type '${type}' grounded STRICTLY in the provided evidence context and verified deterministic calculations.

ENTERPRISE REPORT REQUIREMENTS:
1. STRUCTURE & SECTIONS (strictly use this hierarchy):
   # ${reportMainTitle}
   
   ## 1. Executive Summary
   - A formal executive overview summarizing operations, performance highlights, and critical findings.
   - Ground truth context: Period: ${period || 'Current Operational Period'}, Mine/Subsidiary: ${mineName || subsidiary || 'All Monitored Mines'}${comparisonPeriod ? `, Comparison Period: ${comparisonPeriod}` : ''}${subject ? `, Department/Subject: ${subject}` : ''}.

   ## 2. Key Operational Metrics
   - Provide a structured Markdown table summarizing the core metrics extracted from the records.
   - Format:
     | Metric | Period | Actual | Target | Variance | Status |
     | --- | --- | --- | --- | --- | --- |
     (Include actual extracted values, units such as MT, BCM, %, and deterministic variances).

   ## 3. Detailed Operational Analysis
   - In-depth, analytical breakdown across key focus areas: ${keyAreasList}.
   - Clear thematic subsections addressing excavation, production volumes, dispatch logistics, and operational bottlenecks.

   ## 4. Variance & Trend Analysis
   - Concrete comparison of actual performance against targets and prior periods.
   - Explain the operational causes behind positive or negative variances using extracted evidence.

   ## 5. Operational Risks & Constraints
   - Critical risks, bottlenecks, equipment constraints, safety considerations, or data anomalies observed in the logs.

   ${includeRecommendations ? `## 6. Strategic Recommendations
   - Actionable, numbered recommendations with prioritized timeframes (Immediate / Medium-Term / Strategic) to rectify variances and optimize extraction/dispatch.` : ''}

   ${includeAppendix ? `## ${includeRecommendations ? '7' : '6'}. Evidence Appendix & Citations
   - Detailed listing of source documents, specific page citations, and verified evidence excerpts supporting the findings.` : ''}

CRITICAL RULES FOR ENTERPRISE QUALITY:
- NO conversational AI preamble (e.g. NEVER write "Here is your report", "Certainly", "Based on your request", or "As an AI"). Start directly with the Level 1 Title heading.
- Ground all numbers, units, periods, and mine names in the provided evidence. DO NOT hallucinate conflicting numbers.
- Format all Markdown tables strictly with standard pipe syntax and clean alignments.
- When citing sources, use the exact document name and bracketed page number [Page X] when available; if [Page N/A], cite the document name only.

Additional Instructions: ${instructions || 'Focus on factual accuracy, concrete operational metrics, and actionable executive insights.'}

Evidence Context:
${boundedFullContext}`;

  // 4. Gemini Generation with Safe Error Handling
  let reportContent = '';
  try {
    if (process.env.LLM_API_KEY === 'mock-key-for-testing') {
      reportContent = `# ${reportMainTitle}\n\n## 1. Executive Summary\nProduction operations summary based on available mining records.\n\n## 2. Key Operational Metrics\n| Metric | Period | Actual | Target | Variance | Status |\n| --- | --- | --- | --- | --- | --- |\n| Coal Production | ${period || 'FY 2023-24'} | 4.2 MT | 4.0 MT | +5.0% | On Track |\n\n## 3. Detailed Operational Analysis\nProduction achieved target specifications across key seams.\n\n## 4. Variance & Trend Analysis\nPositive variance recorded in primary excavation.\n\n## 5. Operational Risks & Constraints\nLogistical dispatch constraints noted during peak periods.\n\n${includeRecommendations ? '## 6. Strategic Recommendations\n1. Optimize haulage dispatch fleet cycles.\n\n' : ''}${includeAppendix ? '## Evidence Appendix & Citations\nAll data grounded in verified operational logs.' : ''}`;
    } else {
      reportContent = await llmService.callLLM(systemPrompt, 'Generate the complete professional report using the verified evidence.', {
        reqContext,
        throwOnLimit: true
      });
    }
  } catch (err) {
    console.error('[Report Generation Service Error]', err.message);
    const is503 = err.code === 'AI_SERVICE_UNAVAILABLE' || err.statusCode === 503 || err.status === 503 || (err.message && (
      err.message.includes('503') || err.message.toLowerCase().includes('high demand') || err.message.includes('UNAVAILABLE')
    ));
    const is429 = err.code === 'AI_RATE_LIMIT' || err.statusCode === 429 || err.status === 429;
    const isContext = err.code === 'AI_CONTEXT_LIMIT' || err.code === 'MAX_CALLS_EXCEEDED';

    const apiError = new Error(
      is503 ? 'AI service is temporarily unavailable. Please try again shortly.' :
      is429 ? (err.message || 'Gemini Rate Limit Exceeded. Please retry shortly.') :
      (err.message || 'Report generation failed due to an AI service error.')
    );
    apiError.code = is503 ? 'AI_SERVICE_UNAVAILABLE' : (is429 ? 'AI_RATE_LIMIT' : (isContext ? 'AI_CONTEXT_LIMIT' : 'REPORT_GENERATION_FAILED'));
    apiError.statusCode = is503 ? 503 : (is429 ? 429 : (isContext ? 422 : 500));
    apiError.retryAfterSeconds = err.retryAfterSeconds || (is503 || is429 ? 30 : undefined);
    apiError.retryable = err.retryable !== undefined ? err.retryable : (is503 || is429);
    throw apiError;
  }

  // 5. Strict Verification: NEVER persist or accept error messages as report text!
  if (
    !reportContent ||
    typeof reportContent !== 'string' ||
    reportContent.trim().length < 50 ||
    reportContent.includes('reached the maximum API limits') ||
    reportContent.includes('The task is very complex and reached the maximum') ||
    reportContent.includes('AI_RATE_LIMIT') ||
    reportContent.includes('Rate Limit Exceeded') ||
    reportContent.includes('temporarily unavailable') ||
    reportContent.includes('high demand')
  ) {
    const limitError = new Error('Report generation could not be completed because the AI request exceeded the available context limit or service capacity.');
    limitError.code = 'AI_CONTEXT_LIMIT';
    limitError.statusCode = 422;
    limitError.retryable = true;
    throw limitError;
  }

  const { confidenceScore, evidenceCoverage, metricBasis } = reportRetrievalMetrics(similarChunks);

  // 8. Persist genuine report to MongoDB ONLY upon successful generation
  const report = new Report({
    title: reportMainTitle,
    type: type,
    content: {
      markdown: reportContent,
      parameters: {
        documentId: documentId || null,
        instructions: instructions || '',
        template: template || '',
        period: period || '',
        mineName: mineName || '',
        subsidiary: subsidiary || '',
        subject: subject || '',
        title: reportMainTitle,
        keyAreas: Array.isArray(keyAreas) ? keyAreas : (keyAreas ? [keyAreas] : []),
        comparisonPeriod: comparisonPeriod || '',
        includeRecommendations: includeRecommendations !== false,
        includeAppendix: includeAppendix !== false
      },
      sources: similarChunks.map(c => ({
        documentId: c.documentId?._id || c.documentId,
        documentName: c.documentId?.originalName || c.documentId?.filename || c.documentName || 'Mining Report Document',
        pageNumber: c.pageNumber != null ? c.pageNumber : null,
        similarity: c.similarityScore || 0.85,
        excerpt: (c.content || '').replace(/\s+/g, ' ').substring(0, 200)
      }))
    },
    status: 'draft',
    version: 1,
    previousVersions: [],
    generatedBy: userId,
    confidenceScore,
    metricBasis,
    evidenceCoverage
  });

  await report.save();

  try {
    await auditService.logAudit({
      user: userId,
      action: 'GENERATE_REPORT',
      resource: 'Report',
      resourceId: report._id,
      details: { type, documentId, confidenceScore, evidenceCoverage }
    });
  } catch (auditErr) {
    console.warn('Audit log write failed:', auditErr.message);
  }

  return report;
};

// Generate Binary PDF buffer with zero markdown artifacts
const generatePdfBuffer = async (report, markdown, sources) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 50,
      info: { Title: report.title || 'Mining Report', Author: 'MineIntel AI Enterprise' }
    });
    const buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    // Official Header Banner
    doc.fontSize(8).fillColor('#64748b').font('Helvetica-Bold').text('MINEINTEL AI  |  ENTERPRISE MINING INTELLIGENCE REPORT', { characterSpacing: 1 });
    doc.moveDown(0.4);

    // Title
    doc.fontSize(18).fillColor('#92400e').font('Helvetica-Bold').text(stripMarkdownArtifacts(report.title || 'Mining Report'));
    doc.moveDown(0.4);

    // Metadata Box
    const startY = doc.y;
    doc.rect(50, startY, 495, 34).fillAndStroke('#f8fafc', '#e2e8f0');
    doc.fontSize(8.5).fillColor('#334155').font('Helvetica-Bold');
    doc.text(`Type: ${report.type || 'Report'}   |   Status: ${(report.status || 'draft').toUpperCase()}   |   Date: ${new Date(report.createdAt || Date.now()).toLocaleDateString('en-GB')}   |   Version: ${report.version || 1}`, 58, startY + 7);
    doc.fontSize(8).fillColor('#64748b').font('Helvetica');
    doc.text(reportRetrievalLabel(report), 58, startY + 20);

    doc.y = startY + 44;
    doc.moveDown(0.5);

    // Body parsing
    const lines = (markdown || '').split('\n');
    let i = 0;

    while (i < lines.length) {
      const rawLine = lines[i];
      const trimmed = rawLine.trim();

      if (!trimmed) {
        doc.moveDown(0.3);
        i++;
        continue;
      }

      // 1. Table Detection
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        const tableLines = [];
        while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
          tableLines.push(lines[i].trim());
          i++;
        }

        const dataRows = [];
        let headerRow = null;

        for (const rowStr of tableLines) {
          if (/^\|[\s\-:|]+\|$/.test(rowStr)) continue;
          const cols = rowStr.split('|').map(c => stripMarkdownArtifacts(c.trim())).filter((_, idx, arr) => idx !== 0 && idx !== arr.length - 1);
          if (!headerRow) headerRow = cols;
          else dataRows.push(cols);
        }

        if (headerRow && headerRow.length > 0) {
          const colWidth = 495 / headerRow.length;
          const startX = 50;

          if (doc.y + 40 > doc.page.height - 60) doc.addPage();

          // Draw header
          const headY = doc.y;
          doc.rect(startX, headY, 495, 20).fillAndStroke('#e2e8f0', '#cbd5e1');
          doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8.5);
          headerRow.forEach((h, hIdx) => {
            doc.text(h, startX + (hIdx * colWidth) + 4, headY + 5, { width: colWidth - 8, lineBreak: false });
          });
          doc.y = headY + 22;

          // Draw data rows
          dataRows.forEach((row, rIdx) => {
            if (doc.y + 20 > doc.page.height - 60) doc.addPage();
            const rowY = doc.y;
            const bg = rIdx % 2 === 0 ? '#ffffff' : '#f8fafc';
            doc.rect(startX, rowY, 495, 18).fillAndStroke(bg, '#f1f5f9');
            doc.fillColor('#334155').font('Helvetica').fontSize(8);
            row.forEach((cell, cIdx) => {
              doc.text(cell || '', startX + (cIdx * colWidth) + 4, rowY + 4, { width: colWidth - 8, lineBreak: false });
            });
            doc.y = rowY + 19;
          });
          doc.moveDown(0.6);
        }
        continue;
      }

      // Check page boundary
      if (doc.y > doc.page.height - 70) doc.addPage();

      // 2. Headings
      if (trimmed.startsWith('# ')) {
        const clean = stripMarkdownArtifacts(trimmed.replace(/^#\s+/, ''));
        doc.moveDown(0.5).fontSize(14).font('Helvetica-Bold').fillColor('#92400e').text(clean).fontSize(10).fillColor('#1e293b').font('Helvetica');
        i++;
        continue;
      }
      if (trimmed.startsWith('## ')) {
        const clean = stripMarkdownArtifacts(trimmed.replace(/^##\s+/, ''));
        doc.moveDown(0.4).fontSize(12).font('Helvetica-Bold').fillColor('#0f172a').text(clean).fontSize(10).fillColor('#1e293b').font('Helvetica');
        i++;
        continue;
      }
      if (trimmed.startsWith('### ')) {
        const clean = stripMarkdownArtifacts(trimmed.replace(/^###\s+/, ''));
        doc.moveDown(0.3).fontSize(10.5).font('Helvetica-Bold').fillColor('#334155').text(clean).fontSize(10).fillColor('#1e293b').font('Helvetica');
        i++;
        continue;
      }
      if (trimmed.startsWith('#### ')) {
        const clean = stripMarkdownArtifacts(trimmed.replace(/^####\s+/, ''));
        doc.moveDown(0.25).fontSize(9.5).font('Helvetica-Bold').fillColor('#475569').text(clean).fontSize(10).fillColor('#1e293b').font('Helvetica');
        i++;
        continue;
      }

      // 3. Bullet points / Lists
      if (/^[-*+]\s+/.test(trimmed)) {
        const clean = stripMarkdownArtifacts(trimmed.replace(/^[-*+]\s+/, ''));
        doc.font('Helvetica').fontSize(9.5).fillColor('#1e293b').text(`  •  ${clean}`, { indent: 10 });
        i++;
        continue;
      }
      if (/^\d+\.\s+/.test(trimmed)) {
        const clean = stripMarkdownArtifacts(trimmed);
        doc.font('Helvetica').fontSize(9.5).fillColor('#1e293b').text(`  ${clean}`, { indent: 10 });
        i++;
        continue;
      }

      // 4. Standard Paragraph with inline bold/italic parser
      renderPdfFormattedLine(doc, trimmed);
      i++;
    }

    // Evidence Appendix
    if (sources && sources.length > 0) {
      if (doc.y > doc.page.height - 120) doc.addPage();
      else doc.moveDown(0.8);

      doc.fontSize(13).font('Helvetica-Bold').fillColor('#92400e').text('Evidence Appendix & Verified Citations', { underline: true });
      doc.moveDown(0.5);

      sources.forEach((s, idx) => {
        if (doc.y > doc.page.height - 80) doc.addPage();
        const docName = stripMarkdownArtifacts(s.documentName || 'Mining Document');
        const pageStr = s.pageNumber != null ? `Page ${s.pageNumber}` : 'Page N/A';
        const simStr = s.similarity ? ` (Match: ${Math.round(s.similarity * 100)}%)` : '';

        doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#0f172a').text(`[${idx + 1}] ${docName} - ${pageStr}${simStr}`);
        if (s.excerpt) {
          doc.fontSize(8.5).font('Helvetica-Oblique').fillColor('#475569').text(`"${stripMarkdownArtifacts(s.excerpt).trim()}"`, { indent: 15 });
        }
        doc.moveDown(0.3);
      });
    }

    doc.end();
  });
};

// Generate Binary DOCX buffer with zero markdown artifacts
const generateDocxBuffer = async (report, markdown, sources) => {
  const children = [];

  // Title
  children.push(new Paragraph({
    text: stripMarkdownArtifacts(report.title || 'Mining Operations Report'),
    heading: HeadingLevel.TITLE
  }));

  // Metadata Paragraphs
  const metaRuns = [
    new TextRun({ text: 'Type: ', bold: true }),
    new TextRun({ text: `${report.type || 'Operational Report'}  |  ` }),
    new TextRun({ text: 'Status: ', bold: true }),
    new TextRun({ text: `${(report.status || 'draft').toUpperCase()}  |  ` }),
    new TextRun({ text: 'Version: ', bold: true }),
    new TextRun({ text: `${report.version || 1}  |  ` }),
    new TextRun({ text: 'Date: ', bold: true }),
    new TextRun({ text: `${new Date(report.createdAt || Date.now()).toLocaleDateString('en-GB')}` })
  ];
  children.push(new Paragraph({ children: metaRuns }));

  if (report.confidenceScore || report.evidenceCoverage) {
    children.push(new Paragraph({
      children: [
        new TextRun({ text: reportRetrievalLabel(report), italics: true, color: '64748B' })
      ]
    }));
  }

  children.push(new Paragraph({ text: '' }));

  // Parse lines into Headings, Tables, Lists, and Formatted Paragraphs
  const lines = (markdown || '').split('\n');
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // 1. Table Detection
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }

      const dataRows = [];
      let headerRow = null;

      for (let tIdx = 0; tIdx < tableLines.length; tIdx++) {
        const rowStr = tableLines[tIdx];
        if (/^\|[\s\-:|]+\|$/.test(rowStr)) {
          continue; // Separator row
        }
        const cols = rowStr.split('|').map(c => c.trim()).filter((_, idx, arr) => idx !== 0 && idx !== arr.length - 1);
        if (!headerRow) {
          headerRow = cols;
        } else {
          dataRows.push(cols);
        }
      }

      if (headerRow && headerRow.length > 0) {
        const tableRows = [
          new TableRow({
            tableHeader: true,
            children: headerRow.map(col => new TableCell({
              shading: { fill: 'F1F5F9' },
              children: [new Paragraph({
                children: parseInlineDocxRuns(col, { bold: true, color: '0F172A' })
              })]
            }))
          }),
          ...dataRows.map(row => new TableRow({
            children: headerRow.map((_, colIdx) => new TableCell({
              children: [new Paragraph({
                children: parseInlineDocxRuns(row[colIdx] || '')
              })]
            }))
          }))
        ];

        children.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: tableRows
        }));
        children.push(new Paragraph({ text: '' }));
      }
      continue;
    }

    // 2. Headings
    if (trimmed.startsWith('# ')) {
      children.push(new Paragraph({
        text: stripMarkdownArtifacts(trimmed.replace(/^#\s+/, '')),
        heading: HeadingLevel.HEADING_1
      }));
      i++;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      children.push(new Paragraph({
        text: stripMarkdownArtifacts(trimmed.replace(/^##\s+/, '')),
        heading: HeadingLevel.HEADING_2
      }));
      i++;
      continue;
    }
    if (trimmed.startsWith('### ')) {
      children.push(new Paragraph({
        text: stripMarkdownArtifacts(trimmed.replace(/^###\s+/, '')),
        heading: HeadingLevel.HEADING_3
      }));
      i++;
      continue;
    }
    if (trimmed.startsWith('#### ')) {
      children.push(new Paragraph({
        text: stripMarkdownArtifacts(trimmed.replace(/^####\s+/, '')),
        heading: HeadingLevel.HEADING_4
      }));
      i++;
      continue;
    }

    // 3. Bullet points / Lists
    if (/^[-*+]\s+/.test(trimmed)) {
      const content = trimmed.replace(/^[-*+]\s+/, '');
      children.push(new Paragraph({
        children: [
          new TextRun({ text: '•  ', bold: true, color: 'D97706' }),
          ...parseInlineDocxRuns(content)
        ],
        indent: { left: 400 }
      }));
      i++;
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const numMatch = trimmed.match(/^(\d+\.)\s+(.*)$/);
      if (numMatch) {
        children.push(new Paragraph({
          children: [
            new TextRun({ text: numMatch[1] + '  ', bold: true }),
            ...parseInlineDocxRuns(numMatch[2])
          ],
          indent: { left: 400 }
        }));
        i++;
        continue;
      }
    }

    // 4. Standard Paragraph
    children.push(new Paragraph({
      children: parseInlineDocxRuns(trimmed)
    }));
    i++;
  }

  // Evidence Appendix if sources provided
  if (sources && sources.length > 0) {
    children.push(new Paragraph({ text: '' }));
    children.push(new Paragraph({
      text: 'Evidence Appendix & Verified Citations',
      heading: HeadingLevel.HEADING_1
    }));
    sources.forEach((s, idx) => {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: `[${idx + 1}] ${stripMarkdownArtifacts(s.documentName || 'Mining Document')}`, bold: true, color: '0F172A' }),
          new TextRun({ text: ` (Page ${s.pageNumber != null ? s.pageNumber : 'N/A'})`, italics: true, color: '64748B' }),
          new TextRun({ text: s.similarity ? ` - Match: ${Math.round(s.similarity * 100)}%` : '', color: '059669' })
        ]
      }));
      if (s.excerpt) {
        children.push(new Paragraph({
          children: [
            new TextRun({ text: `"${stripMarkdownArtifacts(s.excerpt).trim()}"`, italics: true, color: '334155' })
          ],
          indent: { left: 400 }
        }));
      }
      children.push(new Paragraph({ text: '' }));
    });
  }

  const docx = new DocxDocument({
    sections: [{
      properties: {},
      children
    }]
  });

  return await Packer.toBuffer(docx);
};

// Export report content in different formats: pdf, docx, csv, json
const exportReport = async (reportId, format = 'json') => {
  const report = await Report.findById(reportId).populate('generatedBy', 'username').lean();
  if (!report) throw new Error('Report not found');

  const markdown = report.content?.markdown || '';
  const sources = report.content?.sources || [];
  const safeFilename = report.title.replace(/[^a-zA-Z0-9_-]/g, '_');

  switch (format.toLowerCase()) {
    case 'json':
      return {
        contentType: 'application/json',
        filename: `${safeFilename}.json`,
        data: JSON.stringify({
          id: report._id,
          title: report.title,
          type: report.type,
          status: report.status,
          version: report.version,
          generatedBy: report.generatedBy?.username,
          createdAt: report.createdAt,
          ...reportRetrievalMetrics(sources),
          accuracyEvaluated: false,
          content: markdown,
          sources
        }, null, 2)
      };

    case 'csv': {
      const header = 'Source_Number,Document_Name,Page_Number,Similarity,Excerpt\n';
      const rows = sources.map((s, idx) =>
        `"${idx + 1}","${(s.documentName || '').replace(/"/g, '""')}","${s.pageNumber != null ? s.pageNumber : 'N/A'}","${s.similarity != null ? Number(s.similarity).toFixed(4) : ''}","${(s.excerpt || '').replace(/"/g, '""')}"`
      ).join('\n');
      return {
        contentType: 'text/csv',
        filename: `${safeFilename}_sources.csv`,
        data: header + rows
      };
    }

    case 'pdf': {
      const pdfBuffer = await generatePdfBuffer(report, markdown, sources);
      return {
        contentType: 'application/pdf',
        filename: `${safeFilename}.pdf`,
        data: pdfBuffer
      };
    }

    case 'docx': {
      const docxBuffer = await generateDocxBuffer(report, markdown, sources);
      return {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        filename: `${safeFilename}.docx`,
        data: docxBuffer
      };
    }

    case 'md': {
      const fullMd = `# ${report.title}\n\n**Type:** ${report.type}  \n**Status:** ${report.status}  \n**Generated:** ${report.createdAt}  \n${reportRetrievalLabel(report)}\n\n---\n\n${markdown}`;
      return {
        contentType: 'text/markdown',
        filename: `${safeFilename}.md`,
        data: fullMd
      };
    }

    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
};

// Evidence Details
const getReportEvidence = async (reportId) => {
  const report = await Report.findById(reportId).lean();
  if (!report) throw new Error('Report not found');

  const sources = report.content?.sources || [];
  return {
    reportId: report._id,
    title: report.title,
    ...reportRetrievalMetrics(sources),
    accuracyEvaluated: false,
    totalSources: sources.length,
    sources
  };
};

// Version History
const getVersionHistory = async (reportId) => {
  const report = await Report.findById(reportId).lean();
  if (!report) throw new Error('Report not found');

  const history = (report.previousVersions || []).map(v => ({
    version: v.version,
    date: v.date,
    contentPreview: typeof v.content === 'string' ? v.content.substring(0, 120) : (v.content?.markdown || '').substring(0, 120)
  }));

  return {
    reportId: report._id,
    currentVersion: report.version || 1,
    status: report.status,
    totalVersions: history.length + 1,
    history: history.sort((a, b) => b.version - a.version)
  };
};

// Change Comparison between versions
const getReportChanges = async (reportId, fromVersion, toVersion) => {
  const report = await Report.findById(reportId).lean();
  if (!report) throw new Error('Report not found');

  const currentContent = report.content?.markdown || '';
  const previousVersions = report.previousVersions || [];

  if (previousVersions.length === 0) {
    return {
      reportId: report._id,
      currentVersion: report.version || 1,
      totalChanges: 0,
      summary: 'Initial version. No previous revisions recorded.',
      changes: []
    };
  }

  const prev = previousVersions[previousVersions.length - 1];
  const prevContent = typeof prev.content === 'string' ? prev.content : (prev.content?.markdown || '');

  return {
    reportId: report._id,
    fromVersion: prev.version || 1,
    toVersion: report.version,
    diffLength: Math.abs(currentContent.length - prevContent.length),
    summary: `Version ${prev.version} updated to Version ${report.version}. Current length: ${currentContent.length} chars (Previous: ${prevContent.length} chars).`,
    previousExcerpt: prevContent.substring(0, 200),
    currentExcerpt: currentContent.substring(0, 200)
  };
};

module.exports = {
  generateReport,
  exportReport,
  getReportEvidence,
  getVersionHistory,
  getReportChanges
};
