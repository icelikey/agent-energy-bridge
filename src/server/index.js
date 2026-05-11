const http = require('http');
const { handleRequest } = require('./router');
const { sendError } = require('./middleware/error-handler');
const { createRateLimiter } = require('./middleware/rate-limiter');
const { DEFAULT_MAX_BODY_SIZE } = require('./middleware/json-body');

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
    tokenMeter: options.tokenMeter || null,
    multiProviderRouter: options.multiProviderRouter || null,
    notificationService: options.notificationService || null,
    apiKey: options.apiKey || process.env.AEB_API_KEY || null,
  };
}

function setSecurityHeaders(res) {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  res.setHeader('x-service', 'agent-energy-bridge');
  // HSTS only when running HTTPS (detected or configured)
  if (process.env.AEB_HSTS === '1') {
    res.setHeader('strict-transport-security', 'max-age=63072000; includeSubDomains');
  }
}

function createServer(options = {}) {
  const context = buildContext(options);
  const maxBodySize = Number(options.maxBodySize ?? process.env.AEB_MAX_BODY_SIZE ?? DEFAULT_MAX_BODY_SIZE);

  // Rate limiter: configurable via env or options
  const rateLimiter = createRateLimiter({
    windowMs: Number(options.rateLimitWindowMs ?? process.env.AEB_RATE_LIMIT_WINDOW_MS ?? 60_000),
    maxRequests: Number(options.rateLimitMax ?? process.env.AEB_RATE_LIMIT_MAX ?? 100),
    burstSize: Number(options.rateLimitBurst ?? process.env.AEB_RATE_LIMIT_BURST ?? 10),
  });

  const server = http.createServer(async (req, res) => {
    setSecurityHeaders(res);

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type, authorization',
        'access-control-max-age': '86400',
      });
      res.end();
      return;
    }

    // Apply rate limiting
    let rateLimitError = null;
    rateLimiter.middleware()(req, res, (err) => {
      if (err) rateLimitError = err;
    });
    if (rateLimitError) {
      sendError(res, rateLimitError);
      return;
    }

    try {
      await handleRequest(req, res, context, { maxBodySize });
    } catch (error) {
      sendError(res, error);
    }
  });

  // Attach context and graceful shutdown helper (CONC-02)
  server._aebContext = context;
  server.destroy = (callback) => {
    server.close(() => {
      if (context.opsEngine) context.opsEngine.destroy();
      if (context.routeHealthChecker) context.routeHealthChecker.destroy();
      if (context.multiProviderRouter) context.multiProviderRouter.stop();
      if (typeof callback === 'function') callback();
    });
  };

  return server;
}

function startServer(options = {}) {
  const port = Number(options.port || process.env.AEB_PORT || 3100);
  const host = options.host || process.env.AEB_HOST || '127.0.0.1';
  const server = createServer(options);

  // Graceful shutdown — clean up timers and resources (CONC-02)
  const gracefulShutdown = () => {
    server.destroy(() => {
      process.exit(0);
    });
  };
  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);

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
