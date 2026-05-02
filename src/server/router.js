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

async function handleRequest(req, res, context) {
  const request = createRequestObject(req);

  if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
    request.body = await parseJsonBody(req);
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
