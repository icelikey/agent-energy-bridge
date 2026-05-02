async function postRefuelRedeem(request, response, context) {
  if (!context.adapter || typeof context.adapter.redeemCode !== 'function') {
    const error = new Error('Adapter does not support code redemption');
    error.statusCode = 503;
    error.code = 'ADAPTER_NOT_SUPPORTED';
    throw error;
  }

  const body = request.body || {};
  if (!body.code) {
    const error = new Error('Missing required field: code');
    error.statusCode = 400;
    error.code = 'MISSING_FIELD';
    throw error;
  }

  const result = await context.adapter.redeemCode({
    code: body.code,
    identity: body.identity || {},
  });

  return {
    success: true,
    redeemed: result.ok ?? true,
    result,
  };
}

module.exports = {
  postRefuelRedeem,
};
