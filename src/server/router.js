const { parseJsonBody } = require('./middleware/json-body');
const { getHealth } = require('./handlers/health');
const { getBalance } = require('./handlers/balance');
const { getUsageSummary } = require('./handlers/usage');
const { getCapabilities } = require('./handlers/capabilities');
const { postRecommend } = require('./handlers/recommend');
const { postOptimize } = require('./handlers/optimize');
const { postRefuelRedeem } = require('./handlers/refuel');
const { postIssueKey } = require('./handlers/keys');
const { postRenderDocs } = require('./handlers/docs');
const { postSessionReport } = require('./handlers/session-report');
const { getSessionSummary } = require('./handlers/session-summary');
const { getOpsSnapshot, getOpsReport, getOpsEnergy, postOpsStart, postOpsStop } = require('./handlers/ops');
const { postMeterRecord, getMeterStats, getMeterReport, getMeterBreakdown } = require('./handlers/meter');
const { getRoutingStatus, getRoutingLog, postRoutingForce } = require('./handlers/routing');
const { getNotifyConfig, postNotifyTest } = require('./handlers/notify');
const { getRefuelStatus } = require('./handlers/refuel-status');
const { getDashboard } = require('./handlers/dashboard');

const ROUTES = [
  { method: 'GET',  path: '/agent/v1/health',            handler: getHealth },
  { method: 'GET',  path: '/agent/v1/balance',            handler: getBalance },
  { method: 'GET',  path: '/agent/v1/usage/summary',      handler: getUsageSummary },
  { method: 'GET',  path: '/agent/v1/models/capabilities', handler: getCapabilities },
  { method: 'POST', path: '/agent/v1/recommend',          handler: postRecommend },
  { method: 'POST', path: '/agent/v1/optimize',           handler: postOptimize },
  { method: 'POST', path: '/agent/v1/refuel/redeem',      handler: postRefuelRedeem },
  { method: 'POST', path: '/agent/v1/keys/issue',         handler: postIssueKey },
  { method: 'POST', path: '/agent/v1/docs/render',        handler: postRenderDocs },
  { method: 'POST', path: '/agent/v1/session/report',     handler: postSessionReport },
  { method: 'GET',  path: '/agent/v1/session/summary',    handler: getSessionSummary },
  { method: 'GET',  path: '/agent/v1/ops/snapshot',       handler: getOpsSnapshot },
  { method: 'GET',  path: '/agent/v1/ops/report',         handler: getOpsReport },
  { method: 'GET',  path: '/agent/v1/ops/energy',         handler: getOpsEnergy },
  { method: 'POST', path: '/agent/v1/ops/start',          handler: postOpsStart },
  { method: 'POST', path: '/agent/v1/ops/stop',           handler: postOpsStop },
  // Token metering (METR-01~05)
  { method: 'POST', path: '/agent/v1/meter/record',       handler: postMeterRecord },
  { method: 'GET',  path: '/agent/v1/meter/stats',        handler: getMeterStats },
  { method: 'GET',  path: '/agent/v1/meter/report',       handler: getMeterReport },
  { method: 'GET',  path: '/agent/v1/meter/breakdown',    handler: getMeterBreakdown },
  // Multi-provider routing (ROUT-01~05)
  { method: 'GET',  path: '/agent/v1/routing/status',     handler: getRoutingStatus },
  { method: 'GET',  path: '/agent/v1/routing/log',        handler: getRoutingLog },
  { method: 'POST', path: '/agent/v1/routing/force',      handler: postRoutingForce },
  // Auto-refuel notifications (NOTF-01~05, FUEL-01~05)
  { method: 'GET',  path: '/agent/v1/notify/config',      handler: getNotifyConfig },
  { method: 'POST', path: '/agent/v1/notify/test',        handler: postNotifyTest },
  { method: 'GET',  path: '/agent/v1/refuel/status',      handler: getRefuelStatus },
  // Dashboard (Phase 7 extension)
  { method: 'GET',  path: '/dashboard',                    handler: getDashboard },
];

function parseQuery(url) {
  const queryIndex = url.indexOf('?');
  if (queryIndex === -1) return {};
  const params = new URLSearchParams(url.slice(queryIndex + 1));
  const result = {};
  for (const [key, value] of params) {
    result[key] = value;
  }
  return result;
}

function normalizePath(path) {
  const queryIndex = path.indexOf('?');
  return queryIndex === -1 ? path : path.slice(0, queryIndex);
}

function createRequestObject(req) {
  const url = req.url || '/';
  return {
    method: req.method,
    url,
    path: normalizePath(url),
    query: parseQuery(url),
    headers: req.headers,
    body: null,
  };
}

async function handleRequest(req, res, context, options = {}) {
  const request = createRequestObject(req);

  if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
    request.body = await parseJsonBody(req, { maxBodySize: options.maxBodySize });
  }

  const route = ROUTES.find((r) => r.method === request.method && r.path === request.path);

  if (!route) {
    const error = new Error(`Not found: ${request.method} ${request.path}`);
    error.statusCode = 404;
    error.code = 'NOT_FOUND';
    throw error;
  }

  const result = await route.handler(request, res, context);

  if (!res.headersSent) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(result));
  }
}

module.exports = {
  handleRequest,
  ROUTES,
};
