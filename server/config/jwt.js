function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret?.trim() || secret === 'fallback_secret') {
    throw new Error('JWT_SECRET must be configured with a private secret');
  }
  return secret;
}

module.exports = { getJwtSecret };