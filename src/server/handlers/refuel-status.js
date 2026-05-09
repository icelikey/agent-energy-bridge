function requireAutoRefuel(context) {
  if (!context.adapter || typeof context.adapter.getAlertLog !== 'function') {
    const error = new Error('Auto-refuel decorator not available');
    error.statusCode = 503;
    error.code = 'SERVICE_NOT_CONFIGURED';
    throw error;
  }
}

async function getRefuelStatus(request, response, context) {
  requireAutoRefuel(context);
  const url = new URL(request.url, 'http://localhost');
  const limit = Math.min(Number(url.searchParams.get('limit') || 50), 500);

  const stats = context.adapter.getRefuelStats();
  const alertLog = context.adapter.getAlertLog(limit);

  return {
    stats,
    alertLog,
    degraded: context._degraded || false,
  };
}

module.exports = { getRefuelStatus };
