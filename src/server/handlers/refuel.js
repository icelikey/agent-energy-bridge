const { validateBody, validateString } = require('../../utils/validator');

const REFUEL_SCHEMA = {
  code: { type: 'string', minLength: 1, maxLength: 100, required: true },
  identity: { type: 'object', required: false },
};

async function postRefuelRedeem(request, response, context) {
  if (!context.adapter || typeof context.adapter.redeemCode !== 'function') {
    const error = new Error('Adapter does not support code redemption');
    error.statusCode = 503;
    error.code = 'ADAPTER_NOT_SUPPORTED';
    throw error;
  }

  const body = request.body || {};
  const validation = validateBody(body, REFUEL_SCHEMA);
  if (!validation.valid) {
    const error = new Error(`Invalid request: ${validation.errors.map((e) => `${e.field}: ${e.message}`).join('; ')}`);
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    error.details = validation.errors;
    throw error;
  }

  const sanitized = validation.sanitized;
  // Extra sanitization: restrict code characters to alphanumeric + dash/underscore
  const codeResult = validateString(sanitized.code, {
    pattern: /^[A-Za-z0-9\-_]+$/,
  });
  if (!codeResult.valid) {
    const error = new Error('Activation code contains invalid characters');
    error.statusCode = 400;
    error.code = 'INVALID_CODE_FORMAT';
    throw error;
  }

  const result = await context.adapter.redeemCode({
    code: sanitized.code,
    identity: sanitized.identity || {},
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
