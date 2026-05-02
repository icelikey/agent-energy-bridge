async function postRecommend(request, response, context) {
  if (!context.modelSelector) {
    const error = new Error('Model selector not available');
    error.statusCode = 503;
    error.code = 'SERVICE_NOT_CONFIGURED';
    throw error;
  }

  const body = request.body || {};
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

  return {
    success: true,
    recommendation,
  };
}

module.exports = {
  postRecommend,
};
