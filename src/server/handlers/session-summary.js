async function getSessionSummary(request, response, context) {
  if (!context.energyEngine) {
    const error = new Error('Energy engine not available');
    error.statusCode = 503;
    error.code = 'SERVICE_NOT_CONFIGURED';
    throw error;
  }

  const query = request.query || {};
  let sessions = [];

  if (context.sessionStore) {
    if (query.taskType) {
      sessions = context.sessionStore.getSessionsByTaskType(query.taskType, Number(query.limit || 100));
    } else if (query.model) {
      sessions = context.sessionStore.getSessionsByModel(query.model, Number(query.limit || 100));
    } else {
      sessions = context.sessionStore.getRecentSessions(Number(query.limit || 100));
    }
  }

  const summary = context.energyEngine.summarizeSession(sessions);

  return {
    success: true,
    summary,
    filters: {
      taskType: query.taskType || null,
      model: query.model || null,
      limit: Number(query.limit || 100),
    },
  };
}

module.exports = {
  getSessionSummary,
};
