function documentScope(user) {
  if (user?.role === 'admin') return {};
  if (!user?._id) return { _id: { $in: [] } };
  const conditions = [{ userId: user._id }];
  if (user.role === 'reviewer') conditions.push({ reviewerIds: user._id });
  return { $or: conditions };
}

function validDocumentId(value) {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
}

module.exports = { documentScope, validDocumentId };