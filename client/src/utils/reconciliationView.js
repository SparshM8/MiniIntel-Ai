export const outcomeLabel = value => ({
  matched: 'Matched',
  converted: 'Converted',
  conflict: 'Conflict',
  incompatible: 'Incompatible',
  insufficient_evidence: 'Insufficient evidence'
}[value] || 'Unknown');

export const reviewStateLabel = value => ({
  pending: 'Pending review',
  accepted: 'Accepted',
  rejected: 'Rejected',
  correction_requested: 'Correction requested'
}[value] || 'Unknown');

export const isVersionConflict = error => {
  const response = error?.response?.data;
  const code = typeof response?.error === 'string' ? response.error : response?.error?.code;
  return error?.response?.status === 409 && code === 'STALE_REVIEW_VERSION';
};
