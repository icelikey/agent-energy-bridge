const { validateBody } = require('../../utils/validator');

const OPTIMIZE_SCHEMA = {
  taskType: { type: 'string', maxLength: 50, required: false },
  budgetTier: { type: 'enum', allowed: ['free', 'economy', 'balanced', 'premium', null], required: false },
  estimatedCostUsd: { type: 'number', min: 0, max: 10000, required: false },
  requestedTokens: { type: 'number', min: 0, max: 100_000_000, integer: true, required: false },
  dailySpentUsd: { type: 'number', min: 0, max: 100000, required: false },
  hourlyTokensUsed: { type: 'number', min: 0, max: 1_000_000_000, integer: true, required: false },
  availableUsd: { type: 'number', min: 0, max: 100000, required: false },
  protocol: { type: 'string', maxLength: 20, required: false },
  requiredCapabilities: { type: 'array', maxLength: 20, required: false },
  needsUniversalProtocol: { type: 'boolean', required: false },
  qualityPriority: { type: 'string', maxLength: 20, required: false },
  tasks: { type: 'array', maxLength: 50, required: false },
  taskWeights: { type: 'object', required: false },
  client: { type: 'string', maxLength: 100, required: false },
};

async function postOptimize(request, response, context) {
  const body = request.body || {};

  const validation = validateBody(body, OPTIMIZE_SCHEMA);
  if (!validation.valid) {
    const error = new Error(`Invalid request: ${validation.errors.map((e) => `${e.field}: ${e.message}`).join('; ')}`);
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    error.details = validation.errors;
    throw error;
  }

  const sanitized = validation.sanitized;

  if (!context.modelSelector || !context.budgetGuard) {
    const error = new Error('Model selector or budget guard not available');
    error.statusCode = 503;
    error.code = 'SERVICE_NOT_CONFIGURED';
    throw error;
  }

  let availableUsd = sanitized.availableUsd ?? 0;
  if (context.adapter && typeof context.adapter.getBalance === 'function') {
    try {
      const balance = await context.adapter.getBalance({ client: sanitized.client });
      availableUsd = Number(balance?.availableUsd ?? balance?.balanceUsd ?? availableUsd);
    } catch {
      // keep fallback from body or 0
    }
  }

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

  const selectedModelMeta = recommendation.primary || {};
  const guardDecision = context.budgetGuard.evaluateUsage({
    model: selectedModelMeta.id,
    estimatedCostUsd: sanitized.estimatedCostUsd ?? 0,
    requestedTokens: sanitized.requestedTokens ?? 0,
    dailySpentUsd: sanitized.dailySpentUsd ?? 0,
    hourlyTokensUsed: sanitized.hourlyTokensUsed ?? 0,
    availableUsd,
    modelPricePer1kUsd: selectedModelMeta.pricePer1kUsd ?? 0,
    fallbackModel: recommendation.fallback?.id ?? context.budgetGuard.snapshot().fallbackModel,
  });

  let action = guardDecision.allowed ? 'proceed' : 'downgrade_or_refuel';
  if (guardDecision.action === 'free_fallback') {
    action = 'free_fallback';
  }
  const savingActions = [];

  if (!guardDecision.allowed && (sanitized.requestedTokens ?? 0) > 40000) {
    savingActions.push('compress_context');
  }

  if (guardDecision.action === 'downgrade') {
    savingActions.push('switch_economy_route');
  }

  if (guardDecision.reasons.some((r) => r.includes('expensive model'))) {
    savingActions.push('use_allowlist_model');
  }

  return {
    success: true,
    action,
    guardDecision,
    recommendation: {
      primary: recommendation.primary,
      fallback: recommendation.fallback,
    },
    savingActions,
    estimatedCostUsd: sanitized.estimatedCostUsd ?? 0,
    requestedTokens: sanitized.requestedTokens ?? 0,
  };
}

module.exports = {
  postOptimize,
};
