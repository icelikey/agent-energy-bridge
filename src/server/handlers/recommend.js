const { validateBody } = require('../../utils/validator');

const RECOMMEND_SCHEMA = {
  taskType: { type: 'string', maxLength: 50, required: false },
  budgetTier: { type: 'enum', allowed: ['free', 'economy', 'balanced', 'premium', null], required: false },
  protocol: { type: 'string', maxLength: 20, required: false },
  requiredCapabilities: { type: 'array', maxLength: 20, required: false },
  needsUniversalProtocol: { type: 'boolean', required: false },
  qualityPriority: { type: 'string', maxLength: 20, required: false },
  tasks: { type: 'array', maxLength: 50, required: false },
  taskWeights: { type: 'object', required: false },
};

async function postRecommend(request, response, context) {
  if (!context.modelSelector) {
    const error = new Error('Model selector not available');
    error.statusCode = 503;
    error.code = 'SERVICE_NOT_CONFIGURED';
    throw error;
  }

  const body = request.body || {};
  const validation = validateBody(body, RECOMMEND_SCHEMA);
  if (!validation.valid) {
    const error = new Error(`Invalid request: ${validation.errors.map((e) => `${e.field}: ${e.message}`).join('; ')}`);
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    error.details = validation.errors;
    throw error;
  }

  const sanitized = validation.sanitized;
  const recommendation = context.modelSelector.recommend({
    taskType: sanitized.taskType,
    requiredCapabilities: sanitized.requiredCapabilities,
    budgetTier: sanitized.budgetTier,
    protocol: sanitized.protocol,
    needsUniversalProtocol: sanitized.needsUniversalProtocol,
    qualityPriority: sanitized.qualityPriority,
    tasks: sanitized.tasks,
    taskWeights: sanitized.taskWeights,
  });

  return {
    success: true,
    recommendation,
  };
}

module.exports = {
  postRecommend,
};
