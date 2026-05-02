function sendError(response, error) {
  const statusCode = error.statusCode || error.status || 500;
  const body = {
    success: false,
    error: error.code || error.name || 'INTERNAL_ERROR',
    message: error.message || 'Internal server error',
  };
  if (process.env.NODE_ENV === 'development') {
    body.stack = error.stack;
  }
  if (!response.headersSent) {
    response.writeHead(statusCode, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  }
}

module.exports = {
  sendError,
};
