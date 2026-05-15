const { validateBody } = require('../../utils/validator');

const ISSUE_KEY_SCHEMA = {
  owner: { type: 'string', maxLength: 100, required: false },
  group: { type: 'string', maxLength: 100, required: false },
  plan: { type: 'string', maxLength: 50, required: false },
  metadata: { type: 'object', required: false },
};

async function postIssueKey(request, response, context) {
  if (!context.adapter || typeof context.adapter.issueKey !== 'function') {
    const error = new Error('Adapter does not support key issuance');
    error.statusCode = 503;
    error.code = 'ADAPTER_NOT_SUPPORTED';
    throw error;
  }

  const body = request.body || {};
  const validation = validateBody(body, ISSUE_KEY_SCHEMA);
  if (!validation.valid) {
    const error = new Error(`Invalid request: ${validation.errors.map((e) => `${e.field}: ${e.message}`).join('; ')}`);
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    error.details = validation.errors;
    throw error;
  }

  const sanitized = validation.sanitized;
  const result = await context.adapter.issueKey({
    owner: sanitized.owner,
    group: sanitized.group,
    plan: sanitized.plan,
    metadata: sanitized.metadata || {},
  });

  return {
    success: true,
    key: result,
  };
}

module.exports = {
  postIssueKey,
};
