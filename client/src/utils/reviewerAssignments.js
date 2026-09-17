const validId = value => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
export const MAX_REVIEWERS = 100;

export function assignmentIds(value) {
  if (!Array.isArray(value) || value.some(id => !validId(id))) {
    throw new Error('Unexpected reviewer assignments response. Reload before saving.');
  }
  return [...new Set(value.map(id => id.toLowerCase()))];
}

export function sameAssignments(left, right) {
  return left.length === right.length && left.every(id => right.includes(id));
}

export function parseAssignmentLoad(documentResponse, usersResponse, documentId) {
  const document = documentResponse?.data?.document;
  const users = usersResponse?.data;
  if (documentResponse?.success === false || usersResponse?.success === false
    || document?._id !== documentId || !Array.isArray(users)
    || users.some(user => !validId(user?._id) || typeof user.username !== 'string')) {
    throw new Error('Unexpected document or user response. Reload before saving.');
  }
  const selected = assignmentIds(document.reviewerIds);
  const byId = new Map(users.map(user => [user._id.toLowerCase(), user]));
  const choices = users.filter(user => user.role === 'reviewer' && user.status === 'active')
    .map(user => ({ id: user._id.toLowerCase(), name: user.username, department: user.department || '', eligible: true }));
  for (const id of selected) {
    if (choices.some(user => user.id === id)) continue;
    const user = byId.get(id);
    choices.push({ id, name: user?.username || `Unavailable reviewer (${id})`, department: '', eligible: false });
  }
  return { selected, choices: choices.sort((left, right) => left.name.localeCompare(right.name)) };
}

export function confirmAssignmentSave(response, documentId, requested) {
  if (response?.success !== true || response?.data?.documentId !== documentId) {
    throw new Error('Assignment save could not be confirmed.');
  }
  const saved = assignmentIds(response.data.reviewerIds);
  if (!sameAssignments(saved, requested)) throw new Error('Saved assignments differ from the request.');
  return saved;
}