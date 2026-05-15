const { validateBody } = require('../../utils/validator');

const RECORD_SCHEMA = {
  model: { type: 'string', maxLength: 100, required: true },
  agentId: { type: 'string', maxLength: 100, required: false },
  taskType: { type: 'string', maxLength: 50, required: false },
  inputTokens: { type: 'number', min: 0, max: 1_000_000_000, integer: true, required: true },
  outputTokens: { type: 'number', min: 0, max: 1_000_000_000, integer: true, required: true },
  costUsd: { type: 'number', min: 0, max: 100000, required: false },
  latencyMs: { type: 'number', min: 0, max: 3_600_000, required: false },
};

const VALID_DIMENSIONS = ['model', 'agent', 'taskType'];

function requireMeter(context) {
  if (!context.tokenMeter) {
    const error = new Error('Token meter not available');
    error.statusCode = 503;
    error.code = 'SERVICE_NOT_CONFIGURED';
    throw error;
  }
}

function parseWindowDays(query) {
  const raw = Number(query.windowDays ?? query.window_days ?? 30);
  const days = Number.isFinite(raw) ? Math.max(1, Math.min(90, Math.floor(raw))) : 30;
  return days;
}

// LW-01: truncate query string filter values to prevent oversized strings in responses
function truncateFilter(value, maxLen) {
  if (!value) return undefined;
  const s = String(value).slice(0, maxLen);
  return s || undefined;
}

async function postMeterRecord(request, response, context) {
  requireMeter(context);

  const body = request.body || {};
  const validation = validateBody(body, RECORD_SCHEMA);
  if (!validation.valid) {
    const error = new Error(`Invalid request: ${validation.errors.map((e) => `${e.field}: ${e.message}`).join('; ')}`);
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    error.details = validation.errors;
    throw error;
  }

  const entry = context.tokenMeter.record(validation.sanitized);

  return {
    success: true,
    entry,
  };
}

async function getMeterStats(request, response, context) {
  requireMeter(context);

  const query = request.query || {};
  const windowDays = parseWindowDays(query);

  const modelFilter = truncateFilter(query.model, 100);
  const agentFilter = truncateFilter(query.agentId, 100);
  const taskFilter = truncateFilter(query.taskType, 50);

  const stats = context.tokenMeter.getStats({
    windowDays,
    model: modelFilter,
    agentId: agentFilter,
    taskType: taskFilter,
  });

  return {
    success: true,
    stats,
    filters: {
      windowDays,
      model: modelFilter || null,
      agentId: agentFilter || null,
      taskType: taskFilter || null,
    },
  };
}

async function getMeterReport(request, response, context) {
  requireMeter(context);

  const query = request.query || {};
  const windowDays = parseWindowDays(query);
  const report = context.tokenMeter.getReport(windowDays);

  return {
    success: true,
    report,
  };
}

async function getMeterBreakdown(request, response, context) {
  requireMeter(context);

  const query = request.query || {};
  const windowDays = parseWindowDays(query);

  // HR-03: validate dimension enum, reject unknown values with 400
  const rawDimension = query.dimension || 'model';
  if (!VALID_DIMENSIONS.includes(rawDimension)) {
    const error = new Error(`Invalid dimension: "${rawDimension}". Must be one of: ${VALID_DIMENSIONS.join(', ')}`);
    error.statusCode = 400;
    error.code = 'INVALID_DIMENSION';
    throw error;
  }
  const dimension = rawDimension;

  let breakdown;
  if (dimension === 'agent') {
    breakdown = context.tokenMeter.getAgentBreakdown(windowDays);
  } else if (dimension === 'taskType') {
    breakdown = context.tokenMeter.getTaskTypeBreakdown(windowDays);
  } else {
    breakdown = context.tokenMeter.getModelBreakdown(windowDays);
  }

  return {
    success: true,
    dimension,
    windowDays,
    breakdown,
  };
}

module.exports = {
  postMeterRecord,
  getMeterStats,
  getMeterReport,
  getMeterBreakdown,
};
