const MAX_BULK_REVIEW_IDS = 1000;

function validateBulkReviewIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_BULK_REVIEW_IDS) {
    return { error: `IDs must be a nonempty array of at most ${MAX_BULK_REVIEW_IDS} entries` };
  }
  // Validate the whole request before issuing any write; do not cast arbitrary objects.
  for (const id of ids) {
    if (typeof id !== 'string' || !/^[a-fA-F0-9]{24}$/.test(id)) {
      return { error: 'Every ID must be a 24-character hexadecimal string' };
    }
  }
  const uniqueIds = [...new Set(ids.map(id => id.toLowerCase()))];
  return { ids: uniqueIds, duplicateCount: ids.length - uniqueIds.length };
}

module.exports = { validateBulkReviewIds, MAX_BULK_REVIEW_IDS };
