const { validateBody } = require('../../utils/validator');

const RENDER_DOCS_SCHEMA = {
  template: { type: 'string', maxLength: 50, required: false },
  data: { type: 'object', required: false },
};

async function postRenderDocs(request, response, context) {
  if (!context.adapter || typeof context.adapter.renderDocs !== 'function') {
    const error = new Error('Adapter does not support docs rendering');
    error.statusCode = 503;
    error.code = 'ADAPTER_NOT_SUPPORTED';
    throw error;
  }

  const body = request.body || {};
  const validation = validateBody(body, RENDER_DOCS_SCHEMA);
  if (!validation.valid) {
    const error = new Error(`Invalid request: ${validation.errors.map((e) => `${e.field}: ${e.message}`).join('; ')}`);
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    error.details = validation.errors;
    throw error;
  }

  const sanitized = validation.sanitized;
  const result = await context.adapter.renderDocs({
    template: sanitized.template,
    data: sanitized.data || {},
  });

  return {
    success: true,
    docs: result,
  };
}

module.exports = {
  postRenderDocs,
};
