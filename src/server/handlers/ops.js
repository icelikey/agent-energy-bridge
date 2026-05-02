async function getOpsSnapshot(request, response, context) {
  if (!context.opsEngine) {
    const error = new Error('Ops engine not available');
    error.statusCode = 503;
    error.code = 'SERVICE_NOT_CONFIGURED';
    throw error;
  }

  const snapshot = await context.opsEngine.captureSnapshot('api');
  return {
    success: true,
    snapshot,
  };
}

async function getOpsReport(request, response, context) {
  if (!context.opsEngine) {
    const error = new Error('Ops engine not available');
    error.statusCode = 503;
    error.code = 'SERVICE_NOT_CONFIGURED';
    throw error;
  }

  const limit = Number(request.query?.limit || 168);
  const report = context.opsEngine.generateReport({ limit });

  return {
    success: true,
    report,
  };
}

async function getOpsEnergy(request, response, context) {
  if (!context.opsEngine) {
    const error = new Error('Ops engine not available');
    error.statusCode = 503;
    error.code = 'SERVICE_NOT_CONFIGURED';
    throw error;
  }

  const energyReport = context.opsEngine.getEnergyReport();

  return {
    success: true,
    energyReport,
  };
}

async function postOpsStart(request, response, context) {
  if (!context.opsEngine) {
    const error = new Error('Ops engine not available');
    error.statusCode = 503;
    error.code = 'SERVICE_NOT_CONFIGURED';
    throw error;
  }

  context.opsEngine.startMonitoring();

  return {
    success: true,
    status: 'monitoring_started',
    intervalMs: context.opsEngine.monitoringIntervalMs,
  };
}

async function postOpsStop(request, response, context) {
  if (!context.opsEngine) {
    const error = new Error('Ops engine not available');
    error.statusCode = 503;
    error.code = 'SERVICE_NOT_CONFIGURED';
    throw error;
  }

  context.opsEngine.stopMonitoring();

  return {
    success: true,
    status: 'monitoring_stopped',
  };
}

module.exports = {
  getOpsSnapshot,
  getOpsReport,
  getOpsEnergy,
  postOpsStart,
  postOpsStop,
};
