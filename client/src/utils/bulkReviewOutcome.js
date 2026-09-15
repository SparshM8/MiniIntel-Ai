export function bulkReviewOutcome(result) {
  const payload = result?.success === true ? result.data : result;
  const { requestedCount, matchedCount, modifiedCount, unmatchedCount } = payload || {};
  if (![requestedCount, matchedCount, modifiedCount, unmatchedCount].every(n => Number.isSafeInteger(n) && n >= 0) ||
      requestedCount === 0 || matchedCount + unmatchedCount !== requestedCount || modifiedCount > matchedCount) {
    return { complete: false, text: 'Bulk approval counts unavailable. Review refreshed statuses before retrying.' };
  }
  return {
    complete: unmatchedCount === 0,
    text: `Bulk approval: ${matchedCount} of ${requestedCount} unique IDs matched; ${modifiedCount} records modified; ${unmatchedCount} unmatched.`
  };
}
