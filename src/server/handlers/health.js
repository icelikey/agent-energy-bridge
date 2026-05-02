async function getHealth(request, response, context) {
  const adapterStatus = context.adapter
    ? { connected: true, adapter: context.adapter.constructor.name }
    : { connected: false };

  const routeHealth = context.routeHealthChecker
    ? context.routeHealthChecker.getReport()
    : null;

  return {
    success: true,
    status: 'ok',
    service: 'agent-energy-bridge',
    version: '0.1.0',
    adapter: adapterStatus,
    routes: routeHealth,
  };
}

module.exports = {
  getHealth,
};
