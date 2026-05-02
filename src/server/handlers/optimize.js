async function postOptimize(request, response, context) {
  const body = request.body || {};

  if (!context.modelSelector || !context.budgetGuard) {
    const error = new Error('Model selector or budget guard not available');
    error.statusCode = 503;
    error.code = 'SERVICE_NOT_CONFIGURED';
    throw error;
  }

  const recommendation = context.modelSelector.recommend({
    taskType: body.taskType,
    requiredCapabilities: body.requiredCapabilities,
    budgetTier: body.budgetTier,
    protocol: body.protocol,
    needsUniversalProtocol: body.needsUniversalProtocol,
    qualityPriority: body.qualityPriority,
    tasks: body.tasks,
    taskWeights: body.taskWeights,
  });

  const selectedModelMeta = recommendation.primary || {};
  const guardDecision = context.budgetGuard.evaluateUsage({
    model: selectedModelMeta.id,
    estimatedCostUsd: body.estimatedCostUsd ?? 0,
    requestedTokens: body.requestedTokens ?? 0,
    dailySpentUsd: body.dailySpentUsd ?? 0,
    hourlyTokensUsed: body.hourlyTokensUsed ?? 0,
    modelPricePer1kUsd: selectedModelMeta.pricePer1kUsd ?? 0,
    fallbackModel: recommendation.fallback?.id ?? context.budgetGuard.snapshot().fallbackModel,
  });

  const action = guardDecision.allowed ? 'proceed' : 'downgrade_or_refuel';
  const savingActions = [];

  if (!guardDecision.allowed && body.requestedTokens > 40000) {
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
    estimatedCostUsd: body.estimatedCostUsd ?? 0,
    requestedTokens: body.requestedTokens ?? 0,
  };
}

module.exports = {
  postOptimize,
};
