async function getBalance(request, response, context) {
  if (!context.adapter || typeof context.adapter.getBalance !== 'function') {
    const error = new Error('Adapter does not support balance queries');
    error.statusCode = 503;
    error.code = 'ADAPTER_NOT_SUPPORTED';
    throw error;
  }

  const identity = request.query || {};
  const balance = await context.adapter.getBalance(identity);

  return {
    success: true,
    balance,
  };
}

module.exports = {
  getBalance,
};
