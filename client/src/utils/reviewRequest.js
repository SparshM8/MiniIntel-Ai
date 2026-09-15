export const REVIEW_REQUEST_TIMEOUT_MS = 30000;

// A client deadline stops waiting; it does not roll back a server-side write.
export function reviewRequest(operation, { timeoutMs = REVIEW_REQUEST_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error('Request timed out. The server may still complete it. Check current records before retrying.');
      error.code = 'REVIEW_TIMEOUT';
      reject(error);
      controller.abort();
    }, timeoutMs);
  });
  return Promise.race([
    deadline,
    Promise.resolve().then(() => operation({ signal: controller.signal }))
  ]).finally(() => clearTimeout(timer));
}
