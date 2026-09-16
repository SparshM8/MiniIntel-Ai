const {
  listReconciliations,
  getReconciliation,
  createReconciliation,
  appendDecision
} = require('../services/reconciliationPersistenceService');
const { sendSuccess, sendError } = require('../utils/apiResponse');

function handleError(res, error) {
  const detail = error.issues ? { code: error.code, issues: error.issues } : error.code;
  return sendError(res, error.message, detail || 'RECONCILIATION_ERROR', error.status || 500);
}

async function list(req, res) {
  try {
    const records = await listReconciliations({ documentId: req.params.documentId, actor: req.user });
    return sendSuccess(res, records, 'Reconciliations retrieved');
  } catch (error) { return handleError(res, error); }
}

async function get(req, res) {
  try {
    const record = await getReconciliation({ recordId: req.params.id, actor: req.user });
    return sendSuccess(res, record, 'Reconciliation retrieved');
  } catch (error) { return handleError(res, error); }
}

async function create(req, res) {
  try {
    const result = await createReconciliation({
      documentId: req.params.documentId,
      reconciliationCase: req.body,
      actor: req.user
    });
    return sendSuccess(res, result.record, result.created ? 'Reconciliation created' : 'Reconciliation already exists', result.created ? 201 : 200);
  } catch (error) { return handleError(res, error); }
}

async function decide(req, res) {
  try {
    const result = await appendDecision({ recordId: req.params.id, actor: req.user, ...req.body });
    return sendSuccess(res, result.record, result.created ? 'Review decision recorded' : 'Review decision already recorded');
  } catch (error) { return handleError(res, error); }
}

module.exports = { list, get, create, decide };
