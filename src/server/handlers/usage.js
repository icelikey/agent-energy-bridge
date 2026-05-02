async function getUsageSummary(request, response, context) {
  if (!context.adapter || typeof context.adapter.getUsage !== 'function') {
    const error = new Error('Adapter does not support usage queries');
    error.statusCode = 503;
    error.code = 'ADAPTER_NOT_SUPPORTED';
    throw error;
  }

  const identity = request.query || {};
  const usage = await context.adapter.getUsage(identity);

  return {
    success: true,
    usage,
  };
}

module.exports = {
  getUsageSummary,
};
