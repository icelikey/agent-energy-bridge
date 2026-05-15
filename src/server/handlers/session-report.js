const { validateBody, validateObject } = require('../../utils/validator');

const SESSION_REPORT_SCHEMA = {
  session: { type: 'object', required: false },
  // Allow flat body as well (legacy compatibility)
  taskType: { type: 'string', maxLength: 50, required: false },
  inputTokens: { type: 'number', min: 0, max: 1_000_000_000, integer: true, required: false },
  outputTokens: { type: 'number', min: 0, max: 1_000_000_000, integer: true, required: false },
  costUsd: { type: 'number', min: 0, max: 100000, required: false },
  model: { type: 'string', maxLength: 100, required: false },
  success: { type: 'boolean', required: false },
  latencyMs: { type: 'number', min: 0, max: 3_600_000, required: false },
};

async function postSessionReport(request, response, context) {
  if (!context.energyEngine) {
    const error = new Error('Energy engine not available');
    error.statusCode = 503;
    error.code = 'SERVICE_NOT_CONFIGURED';
    throw error;
  }

  const body = request.body || {};
  const validation = validateBody(body, SESSION_REPORT_SCHEMA);
  if (!validation.valid) {
    const error = new Error(`Invalid request: ${validation.errors.map((e) => `${e.field}: ${e.message}`).join('; ')}`);
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    error.details = validation.errors;
    throw error;
  }

  const sanitized = validation.sanitized;
  // Prefer nested session object if provided; otherwise use flat body as session
  const session = sanitized.session || sanitized;

  // Validate that session is a plain object
  const objCheck = validateObject(session);
  if (!objCheck.valid) {
    const error = new Error('Session must be a valid object');
    error.statusCode = 400;
    error.code = 'INVALID_SESSION';
    throw error;
  }

  const scored = context.energyEngine.scoreSession(session);

  if (context.sessionStore) {
    context.sessionStore.addSession(scored);
  }

  return {
    success: true,
    scored,
    stored: Boolean(context.sessionStore),
  };
}

module.exports = {
  postSessionReport,
};
