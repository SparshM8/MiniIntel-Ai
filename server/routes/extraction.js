// Legacy URLs share authentication, document access checks, and response envelopes
// with v1. Do not reintroduce an unauthenticated controller-only review path.
module.exports = require('./api/v1/extraction');
