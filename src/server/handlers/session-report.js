async function postSessionReport(request, response, context) {
  if (!context.energyEngine) {
    const error = new Error('Energy engine not available');
    error.statusCode = 503;
    error.code = 'SERVICE_NOT_CONFIGURED';
    throw error;
  }

  const body = request.body || {};
  const session = body.session || body;

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
