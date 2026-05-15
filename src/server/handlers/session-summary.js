async function getSessionSummary(request, response, context) {
  if (!context.energyEngine) {
    const error = new Error('Energy engine not available');
    error.statusCode = 503;
    error.code = 'SERVICE_NOT_CONFIGURED';
    throw error;
  }

  const query = request.query || {};
  const rawLimit = Number(query.limit || 100);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(1000, Math.floor(rawLimit))) : 100;
  let sessions = [];

  if (context.sessionStore) {
    if (query.taskType) {
      sessions = context.sessionStore.getSessionsByTaskType(query.taskType, limit);
    } else if (query.model) {
      sessions = context.sessionStore.getSessionsByModel(query.model, limit);
    } else {
      sessions = context.sessionStore.getRecentSessions(limit);
    }
  }

  const summary = context.energyEngine.summarizeSession(sessions);

  return {
    success: true,
    summary,
    filters: {
      taskType: query.taskType || null,
      model: query.model || null,
      limit,
    },
  };
}

module.exports = {
  getSessionSummary,
};
