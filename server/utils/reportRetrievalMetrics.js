function reportRetrievalMetrics(sources = []) {
  const scores = sources.map(source => source.similarityScore ?? source.similarity);
  const known = scores.filter(score => Number.isFinite(score) && score >= -1 && score <= 1);
  const total = sources.length;
  const cited = known.filter(score => score > 0.25).length;
  return {
    confidenceScore: known.length ? known.reduce((sum, score) => sum + score, 0) / known.length : null,
    evidenceCoverage: { total, cited, percentage: total ? Math.round(cited / total * 100) : null },
    metricBasis: 'retrieval-similarity-v1'
  };
}

function reportRetrievalLabel(report) {
  const metrics = reportRetrievalMetrics(report.content?.sources || []);
  const similarity = metrics.confidenceScore === null ? 'N/A' : `${Math.round(metrics.confidenceScore * 100)}%`;
  return `Retrieval similarity: ${similarity} | Sources above 0.25: ${metrics.evidenceCoverage.cited}/${metrics.evidenceCoverage.total} | Accuracy not evaluated`;
}

module.exports = { reportRetrievalMetrics, reportRetrievalLabel };