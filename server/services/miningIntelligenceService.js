const { calculateProductionMetrics } = require('./productionCalculationService');

const exactMatch = (value) => new RegExp(`^${String(value).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

const analyze = async (options = {}, { ExtractedRecord, ragService }) => {
  const opts = options || {};
  const reqContext = opts.reqContext || (opts.isComplex !== undefined ? opts : null);
  const filters = opts.filters || {};
  const documentId = opts.documentId || filters.documentId || filters.document;
  const mineName = opts.mineName || filters.mine || filters.mineName;
  const period = opts.period || filters.period;
  const subsidiary = opts.subsidiary || filters.subsidiary;

  // 1. Fetch scoped structured data
  const recordQuery = {};
  if (documentId) {
    recordQuery.documentId = documentId;
  }
  if (mineName) {
    recordQuery.mineName = exactMatch(mineName);
  }
  if (subsidiary) {
    recordQuery.subsidiary = exactMatch(subsidiary);
  }
  if (period) {
    recordQuery.period = exactMatch(period);
  }

  // Never broaden an empty scope or substitute unreviewed records.
  const records = await ExtractedRecord.find({ ...recordQuery, status: 'approved' })
    .populate('documentId', 'originalName title filename')
        .lean();

  const calculation = calculateProductionMetrics(records);
  const anomalies = calculation.anomalies;
  let summaryText = '=== SCOPED PRODUCTION CALCULATIONS ===\n';
  summaryText += 'Unavailable values are not zero. No historical trends or rankings are inferred.\n';
  summaryText += `Scope warnings: ${calculation.warnings.length}. Rows: ${calculation.rows.length}.\n`;
  if (!calculation.rows.length) summaryText += 'Insufficient approved, supported records for this scope.\n';
  for (const row of calculation.rows) {
    const display = (value) => value === null ? 'unavailable' : String(value);
    summaryText += `\nEntity: ${row.subsidiary} / ${row.mineName}; Period: ${row.period}; Unit: tonnes\n`;
    summaryText += `Warnings: ${row.warnings.map(w => `${w.role}:${w.code}`).join(', ') || 'none'}\n`;
    summaryText += `Production: ${display(row.production)}; Target: ${display(row.target)}; Dispatch: ${display(row.dispatch)}\n`;
    summaryText += `Variance (production-target): ${display(row.variance)}; Variance %: ${display(row.variancePercentage)}; Achievement %: ${display(row.achievementPercentage)}\n`;
    summaryText += `Dispatch gap (production-dispatch): ${display(row.dispatchGap)}; Dispatch %: ${display(row.dispatchPercentage)}\n`;
    for (const [role, sources] of Object.entries(row.sources)) {
      for (const source of sources) {
        const ref = source.cellReference;
        const location = ref
          ? `sheet ${ref.sheetName || 'unavailable'}; cell ${ref.cellAddress || 'unavailable'}; ${ref.status}; ${ref.reason}`
          : `page ${source.pageNumber ?? 'unavailable'}`;
        summaryText += `Source ${role}: ${source.documentName || source.documentId}; record ${source.recordId}; ${location}\n`;
      }
    }
  }

  // 3. Evidence Retrieval for top anomalies (STRICTLY CAPPED TO TOP 2 TO PREVENT API LIMITS)
  let evidenceText = '=== RAG EVIDENCE FOR DETECTED ANOMALIES ===\n\n';
  let combinedSources = [];

  // Sort anomalies by magnitude and take at most the top 2
  const topAnomalies = anomalies
    .sort((a, b) => Math.abs(b.percentage || 0) - Math.abs(a.percentage || 0))
    .slice(0, 2);

  if (topAnomalies.length > 0) {
    for (const anom of topAnomalies) {
      evidenceText += `Anomaly: ${anom.reason} in ${anom.period}\n`;
      try {
        const query = `Why did ${anom.metric} vary in ${anom.period}? Equipment downtime, weather, maintenance, logistics, constraints.`;
        // Top 2 chunks per anomaly with safe timeout and embedding quota protection
        const similarChunks = await ragService.searchSimilar(query, 2, {
          reqContext,
          user: opts.user,
          filters: { ...filters, ...(documentId ? { documentId } : {}),
            mine: anom.mineName, subsidiary: anom.subsidiary, period: anom.period }
        });

        if (similarChunks && similarChunks.length > 0) {
          evidenceText += 'Retrieved Evidence:\n';
          similarChunks.forEach((chunk, i) => {
            const docName = chunk.documentId?.originalName || chunk.documentId?.title || chunk.documentId?.filename || 'Document';
            const cleanContent = (chunk.content || '').replace(/\s+/g, ' ').substring(0, 400);
            evidenceText += `[Evidence ${i + 1}] Source: ${docName}, Page: ${chunk.pageNumber || 'N/A'}\nExcerpt: ${cleanContent}\n\n`;
            combinedSources.push({
              documentId: chunk.documentId,
              pageNumber: chunk.pageNumber,
              similarity: chunk.similarityScore,
              reason: anom.reason,
              text: cleanContent
            });
          });
        } else {
          evidenceText += 'No supporting constraint documents found in available records.\n\n';
        }
      } catch (ragErr) {
        console.warn(`[Mining Intelligence] Evidence search skipped for anomaly (${anom.period}):`, ragErr.message);
        evidenceText += 'Supporting documentary evidence retrieval failed; the cause of this variance is unverified.\n\n';
      }
    }
  }

  // Ensure total output is safely bounded
  const boundedSummary = summaryText.length > 3500 ? summaryText.substring(0, 3500) + '\n[... deterministic metrics bounded]' : summaryText;
  const boundedEvidence = evidenceText.length > 2500 ? evidenceText.substring(0, 2500) + '\n[... anomaly evidence bounded]' : evidenceText;

  return {
    summaryText: boundedSummary,
    evidenceText: boundedEvidence,
        anomalies: topAnomalies,
    combinedSources,
    calculations: calculation.rows,
    calculationWarnings: calculation.warnings
  };
};

exports.createMiningIntelligenceService = (dependencies) => ({
  analyzeDataAndFindAnomalies: (options) => analyze(options, dependencies)
});
exports.analyzeDataAndFindAnomalies = (options) => analyze(options, {
  ExtractedRecord: require('../models/ExtractedRecord'),
  ragService: require('./ragService')
});
