const path = require('node:path');

function getUploadDir() {
  if (process.env.UPLOAD_DIR) {
    if (!path.isAbsolute(process.env.UPLOAD_DIR)) throw new Error('UPLOAD_DIR must be an absolute persistent-volume path');
    return path.resolve(process.env.UPLOAD_DIR);
  }
  return process.env.VERCEL ? '/tmp/uploads' : path.join(__dirname, '..', 'uploads');
}

function getUploadPath(filename) {
  if (typeof filename !== 'string' || !filename || /[\\/]/.test(filename) || filename === '.' || filename === '..') {
    throw new Error('Invalid stored filename');
  }
  return path.join(getUploadDir(), filename);
}

module.exports = { getUploadDir, getUploadPath };