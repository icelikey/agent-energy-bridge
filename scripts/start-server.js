const {
  BudgetGuard,
  ModelSelector,
  EnergyEngine,
  CompatibilityGuard,
  ReferralEngine,
  MemoryAdapter,
  NewAPIGatewayAdapter,
  AutoRefuelDecorator,
  SessionStore,
  OpsEngine,
  Logger,
  RouteHealthChecker,
  startServer,
} = require('../src');

function createAdapter() {
  const useNewAPI = process.env.NEWAPI_BASE_URL;

  if (useNewAPI) {
    const newApiAdapter = new NewAPIGatewayAdapter({
      baseUrl: process.env.NEWAPI_BASE_URL,
      apiKey: process.env.NEWAPI_API_KEY,
      userId: process.env.NEWAPI_USER_ID || null,
      username: process.env.NEWAPI_USERNAME || null,
      password: process.env.NEWAPI_PASSWORD || null,
      quotaPerUnit: process.env.NEWAPI_QUOTA_PER_UNIT
        ? Number(process.env.NEWAPI_QUOTA_PER_UNIT)
        : null,
    });

    const autoRefuel = new AutoRefuelDecorator(newApiAdapter, {
      lowBalanceThresholdUsd: Number(process.env.AUTO_REFUEL_THRESHOLD_USD || 3),
      refuelAmountUsd: Number(process.env.AUTO_REFUEL_AMOUNT_USD || 10),
      refuelStrategy: process.env.AUTO_REFUEL_STRATEGY || 'fixed',
      autoRefuelEnabled: process.env.AUTO_REFUEL_ENABLED !== 'false',
      maxRefuelsPerHour: Number(process.env.AUTO_REFUEL_MAX_PER_HOUR || 3),
      cooldownMs: Number(process.env.AUTO_REFUEL_COOLDOWN_MS || 60000),
      refuelCodes: process.env.AUTO_REFUEL_CODES
        ? process.env.AUTO_REFUEL_CODES.split(',')
        : [],
      onRefuel: (event) => {
        console.log('[AutoRefuel]', `+$${event.amount} refueled. Balance was $${event.availableUsd}`);
      },
      onAlert: (alert) => {
        console.log('[AutoRefuel Alert]', alert.type, alert.message || '');
      },
    });

    console.log(`NewAPI adapter mode: ${process.env.NEWAPI_BASE_URL}`);
    console.log(`Auto-refuel: ${autoRefuel.autoRefuelEnabled ? 'ON' : 'OFF'} (threshold $${autoRefuel.lowBalanceThresholdUsd})`);

    return autoRefuel;
  }

  console.log('Memory adapter mode (demo). Set NEWAPI_BASE_URL to connect to real new-api.');
  return new MemoryAdapter({
    balanceUsd: Number(process.env.DEMO_BALANCE_USD || 5),
    dailySpentUsd: Number(process.env.DEMO_DAILY_SPENT_USD || 2),
    hourlyTokensUsed: Number(process.env.DEMO_HOURLY_TOKENS || 12000),
    codes: { 'DEMO-2026': 10, 'OPENCLAW-TEST-10': 10 },
  });
}

const adapter = createAdapter();

const budgetGuard = new BudgetGuard({
  dailyBudgetUsd: 12,
  hourlyTokenLimit: 120000,
  autoPurchaseEnabled: true,
  maxAutoRefuelsPerDay: 2,
  maxRefuelAmountUsd: 8,
  maxAutoPurchasedUsdPerDay: 16,
  fallbackModel: 'all-protocol-router',
});

const modelSelector = new ModelSelector();
const energyEngine = new EnergyEngine();
const compatibilityGuard = new CompatibilityGuard();
const referralEngine = new ReferralEngine();
const sessionStore = new SessionStore({ maxSize: 2000 });
const logger = new Logger({ namespace: 'aeb-server', level: process.env.AEB_LOG_LEVEL || 'info' });

const opsEngine = new OpsEngine({
  adapter,
  budgetGuard,
  modelSelector,
  energyEngine,
  sessionStore,
  logger,
  monitoringIntervalMs: Number(process.env.OPS_MONITOR_INTERVAL_MS || 300000),
  maxMetrics: 10000,
});

const routeHealthChecker = new RouteHealthChecker({
  routes: (process.env.HEALTH_CHECK_ROUTES || '')
    .split(',')
    .filter(Boolean)
    .map((url) => ({ name: url.replace(/^https?:\/\//, '').replace(/[:\/]/g, '-'), url })),
  checkIntervalMs: Number(process.env.HEALTH_CHECK_INTERVAL_MS || 60000),
  timeoutMs: Number(process.env.HEALTH_CHECK_TIMEOUT_MS || 10000),
  logger,
  onStatusChange: (event) => {
    logger.warn('route_status_change', event);
  },
});

if (routeHealthChecker.routes.length > 0) {
  routeHealthChecker.start();
}

startServer({
  adapter,
  budgetGuard,
  modelSelector,
  energyEngine,
  sessionStore,
  compatibilityGuard,
  referralEngine,
  opsEngine,
  routeHealthChecker,
  port: process.env.AEB_PORT,
  host: process.env.AEB_HOST,
  onReady: ({ port, host }) => {
    console.log(`Agent Energy Bridge server running at http://${host}:${port}`);
    console.log(`Health check: http://${host}:${port}/agent/v1/health`);
    console.log(`Ops report:    http://${host}:${port}/agent/v1/ops/report`);
    logger.info('server_ready', { port, host });
  },
  onError: (error) => {
    logger.error('server_start_failed', { message: error.message });
    process.exit(1);
  },
});
