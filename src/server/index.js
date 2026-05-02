const http = require('http');
const { handleRequest } = require('./router');
const { sendError } = require('./middleware/error-handler');

function buildContext(options = {}) {
  return {
    adapter: options.adapter || null,
    budgetGuard: options.budgetGuard || null,
    modelSelector: options.modelSelector || null,
    energyEngine: options.energyEngine || null,
    sessionStore: options.sessionStore || null,
    compatibilityGuard: options.compatibilityGuard || null,
    referralEngine: options.referralEngine || null,
    opsEngine: options.opsEngine || null,
    routeHealthChecker: options.routeHealthChecker || null,
  };
}

function createServer(options = {}) {
  const context = buildContext(options);

  const server = http.createServer(async (req, res) => {
    res.setHeader('x-service', 'agent-energy-bridge');

    try {
      await handleRequest(req, res, context);
    } catch (error) {
      sendError(res, error);
    }
  });

  return server;
}

function startServer(options = {}) {
  const port = Number(options.port || process.env.AEB_PORT || 3100);
  const host = options.host || process.env.AEB_HOST || '127.0.0.1';
  const server = createServer(options);

  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      if (typeof options.onReady === 'function') {
        options.onReady({ port, host });
      }
      resolve(server);
    });

    server.on('error', (error) => {
      if (typeof options.onError === 'function') {
        options.onError(error);
      }
      reject(error);
    });
  });
}

module.exports = {
  createServer,
  startServer,
  buildContext,
};
