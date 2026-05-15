const { validateBody } = require('../../utils/validator');

const FORCE_SCHEMA = {
  name: { type: 'string', maxLength: 100, required: true },
};

function requireRouter(context) {
  if (!context.multiProviderRouter) {
    const error = new Error('Multi-provider router not available');
    error.statusCode = 503;
    error.code = 'SERVICE_NOT_CONFIGURED';
    throw error;
  }
}

function parseLogLimit(query) {
  const raw = Number(query.limit ?? 100);
  return Number.isFinite(raw) ? Math.max(1, Math.min(1000, Math.floor(raw))) : 100;
}

async function getRoutingStatus(request, response, context) {
  requireRouter(context);
  return {
    success: true,
    report: context.multiProviderRouter.getReport(),
  };
}

async function getRoutingLog(request, response, context) {
  requireRouter(context);
  const query = request.query || {};
  const limit = parseLogLimit(query);
  return {
    success: true,
    limit,
    log: context.multiProviderRouter.getSwitchLog(limit),
  };
}

async function postRoutingForce(request, response, context) {
  requireRouter(context);
  const body = request.body || {};
  const validation = validateBody(body, FORCE_SCHEMA);
  if (!validation.valid) {
    const error = new Error(`Invalid request: ${validation.errors.map((e) => `${e.field}: ${e.message}`).join('; ')}`);
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    error.details = validation.errors;
    throw error;
  }
  await context.multiProviderRouter.forceProvider(validation.sanitized.name);
  return {
    success: true,
    active: validation.sanitized.name,
  };
}

module.exports = {
  getRoutingStatus,
  getRoutingLog,
  postRoutingForce,
};
