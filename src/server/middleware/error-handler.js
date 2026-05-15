function sendError(response, error) {
  const statusCode = error.statusCode || error.status || 500;
  const body = {
    success: false,
    error: error.code || error.name || 'INTERNAL_ERROR',
    message: error.message || 'Internal server error',
  };
  if (error.details) {
    body.details = error.details;
  }
  if (process.env.NODE_ENV === 'development') {
    body.stack = error.stack;
  }

  const headers = { 'content-type': 'application/json' };
  if (statusCode === 429 && error.retryAfter) {
    headers['retry-after'] = String(error.retryAfter);
  }

  if (!response.headersSent) {
    response.writeHead(statusCode, headers);
    response.end(JSON.stringify(body));
  }
}

module.exports = {
  sendError,
};
