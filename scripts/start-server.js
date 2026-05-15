const {
  BudgetGuard,
  ModelSelector,
  EnergyEngine,
  CompatibilityGuard,
  ReferralEngine,
  MemoryAdapter,
  NewAPIGatewayAdapter,
  GenericOpenAIGatewayAdapter,
  AutoRefuelDecorator,
  FailoverAdapter,
  SessionStore,
  OpsEngine,
  Logger,
  RouteHealthChecker,
  NotificationService,
  startServer,
} = require('../src');

function createPrimaryAdapter({ notificationService } = {}) {
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
      // 默认 FIFO 消耗（一次性激活码），可通过 AUTO_REFUEL_CONSUME_CODE=false 切换为循环模式
      consumeCode: process.env.AUTO_REFUEL_CONSUME_CODE !== 'false',
      refuelCodes: process.env.AUTO_REFUEL_CODES !== undefined
        ? process.env.AUTO_REFUEL_CODES.split(',').filter(Boolean)
        : [],
      // 注入多渠道通知服务（FUEL-04 + NOTF-02~04，修复生产环境通知不生效 bug）
      notificationService: notificationService || null,
      quietHours: parseQuietHours(process.env.AEB_NOTIFY_QUIET_HOURS),
      onRefuel: (event) => {
        console.log('[AutoRefuel]', `+$${event.amount} refueled. Balance was $${event.availableUsd}`);
      },
      onAlert: (alert) => {
        console.log('[AutoRefuel Alert]', alert.type, alert.message || '');
      },
    });

    console.log(`Primary adapter: NewAPI (${process.env.NEWAPI_BASE_URL})`);
    console.log(`Auto-refuel: ${autoRefuel.autoRefuelEnabled ? 'ON' : 'OFF'} (threshold $${autoRefuel.lowBalanceThresholdUsd}, FIFO=${autoRefuel.consumeCode})`);
    if (notificationService) {
      console.log('Auto-refuel notifications: ON (linked to NotificationService)');
    }

    return autoRefuel;
  }

  console.log('Primary adapter: Memory (demo mode)');
  const memoryAdapter = new MemoryAdapter({
    balanceUsd: Number(process.env.DEMO_BALANCE_USD || 5),
    dailySpentUsd: Number(process.env.DEMO_DAILY_SPENT_USD || 2),
    hourlyTokensUsed: Number(process.env.DEMO_HOURLY_TOKENS || 12000),
    codes: process.env.AEB_DEMO_MODE === '1' ? { 'DEMO-2026': 10, 'OPENCLAW-TEST-10': 10 } : {},
  });

  const demoAutoRefuel = new AutoRefuelDecorator(memoryAdapter, {
    lowBalanceThresholdUsd: Number(process.env.AUTO_REFUEL_THRESHOLD_USD || 3),
    refuelAmountUsd: Number(process.env.AUTO_REFUEL_AMOUNT_USD || 10),
    refuelStrategy: process.env.AUTO_REFUEL_STRATEGY || 'fixed',
    autoRefuelEnabled: process.env.AUTO_REFUEL_ENABLED !== 'false',
    maxRefuelsPerHour: Number(process.env.AUTO_REFUEL_MAX_PER_HOUR || 3),
    cooldownMs: Number(process.env.AUTO_REFUEL_COOLDOWN_MS || 60000),
    consumeCode: process.env.AUTO_REFUEL_CONSUME_CODE !== 'false',
    refuelCodes: process.env.AUTO_REFUEL_CODES !== undefined
      ? process.env.AUTO_REFUEL_CODES.split(',').filter(Boolean)
      : process.env.AEB_DEMO_MODE === '1' ? ['DEMO-2026'] : [],
    // demo 模式启用合成码（MemoryAdapter 不需要真实激活码池也能加油）
    enableSyntheticCode: process.env.AEB_DEMO_MODE === '1',
    notificationService: notificationService || null,
    quietHours: parseQuietHours(process.env.AEB_NOTIFY_QUIET_HOURS),
    onRefuel: (event) => {
      console.log('[AutoRefuel]', `+$${event.amount} refueled. Balance was $${event.availableUsd}`);
    },
    onAlert: (alert) => {
      console.log('[AutoRefuel Alert]', alert.type, alert.message || '');
    },
  });

  console.log(`Auto-refuel: ${demoAutoRefuel.autoRefuelEnabled ? 'ON' : 'OFF'} (threshold $${demoAutoRefuel.lowBalanceThresholdUsd}, FIFO=${demoAutoRefuel.consumeCode})`);
  if (notificationService) {
    console.log('Auto-refuel notifications: ON (linked to NotificationService)');
  }
  return demoAutoRefuel;
}

// 解析 AEB_NOTIFY_QUIET_HOURS="22-8" 为 { start: 22, end: 8 }
function parseQuietHours(raw) {
  if (!raw) return null;
  const match = /^(\d{1,2})\s*-\s*(\d{1,2})$/.exec(raw);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > 23 || end < 0 || end > 23) {
    return null;
  }
  return { start, end };
}

function createEmergencyAdapter() {
  const emergencyBaseUrl = process.env.EMERGENCY_BASE_URL;
  if (!emergencyBaseUrl) return null;

  const adapter = new GenericOpenAIGatewayAdapter({
    baseUrl: emergencyBaseUrl,
    apiKey: process.env.EMERGENCY_API_KEY || null,
  });

  console.log(`Emergency adapter: ${emergencyBaseUrl}`);
  return adapter;
}

function createNotificationService() {
  const hasAnyTarget = [
    process.env.AEB_NOTIFY_WEBHOOK_URL,
    process.env.AEB_NOTIFY_FEISHU_URL,
    process.env.AEB_NOTIFY_DINGTALK_URL,
    process.env.AEB_NOTIFY_SLACK_URL,
    process.env.AEB_NOTIFY_WECOM_URL,
    process.env.AEB_NOTIFY_EMAIL_API_URL && process.env.AEB_NOTIFY_EMAIL_TO,
  ].some(Boolean);

  if (!hasAnyTarget) {
    console.log('Notifications: OFF (no AEB_NOTIFY_* URLs configured)');
    return null;
  }

  const svc = new NotificationService({ dedupWindowMs: Number(process.env.AEB_NOTIFY_DEDUP_MS || 300_000) });

  const channels = [];
  if (process.env.AEB_NOTIFY_WEBHOOK_URL) channels.push('webhook');
  if (process.env.AEB_NOTIFY_FEISHU_URL) channels.push('feishu');
  if (process.env.AEB_NOTIFY_DINGTALK_URL) channels.push('dingtalk');
  if (process.env.AEB_NOTIFY_SLACK_URL) channels.push('slack');
  if (process.env.AEB_NOTIFY_WECOM_URL) channels.push('wecom');
  if (process.env.AEB_NOTIFY_EMAIL_API_URL && process.env.AEB_NOTIFY_EMAIL_TO) channels.push('email');

  console.log(`Notifications: ON (${channels.join(', ')})`);
  return svc;
}

// Build adapters
// 重要：notificationService 必须在 primaryAdapter 之前创建，以便注入到 AutoRefuelDecorator
// (修复 bug：Phase 6 实现了多渠道通知但 start-server.js 未注入到 AutoRefuelDecorator)
const notificationService = createNotificationService();
const primaryAdapter = createPrimaryAdapter({ notificationService });
const emergencyAdapter = createEmergencyAdapter();

let adapter = primaryAdapter;

// Wrap with FailoverAdapter if emergency provider is configured
if (emergencyAdapter) {
  adapter = new FailoverAdapter(primaryAdapter, emergencyAdapter, {
    balanceThresholdUsd: Number(process.env.FAILOVER_BALANCE_THRESHOLD_USD || 0.01),
    recoveryCheckIntervalMs: Number(process.env.FAILOVER_RECOVERY_INTERVAL_MS || 60_000),
    maxConsecutiveFailures: Number(process.env.FAILOVER_MAX_FAILURES || 3),
    onSwitch: (event) => {
      console.log(`[Failover] ${event.from} → ${event.to}: ${event.reason}`);
      if (notificationService) {
        notificationService.sendFromEnv({
          type: 'failover_switched',
          level: event.to === 'emergency' ? 'critical' : 'warn',
          title: `Provider switched to ${event.to}`,
          message: `Primary adapter ${event.from} is no longer healthy. ` +
            `Reason: ${event.reason}. ` +
            `Switched to ${event.to} provider to maintain service continuity.`,
          meta: event,
        }).catch(() => { /* ignore notification errors */ });
      }
    },
    onAlert: (alert) => {
      console.log(`[Failover Alert] ${alert.type}`, alert.consecutiveFailures || '');
      if (notificationService && alert.type === 'refuel_limit_exceeded') {
        notificationService.sendFromEnv({
          type: 'failover_alert',
          level: 'warn',
          title: 'Failover Alert',
          message: `${alert.type}: ${JSON.stringify(alert)}`,
          meta: alert,
        }).catch(() => { /* ignore */ });
      }
    },
  });
  console.log(`Failover: ON (threshold $${adapter.opts.balanceThresholdUsd}, recovery every ${adapter.opts.recoveryCheckIntervalMs}ms)`);
} else {
  console.log('Failover: OFF (set EMERGENCY_BASE_URL to enable)');
}

const budgetGuard = new BudgetGuard({
  dailyBudgetUsd: 12,
  hourlyTokenLimit: 120000,
  autoPurchaseEnabled: true,
  maxAutoRefuelsPerDay: 2,
  maxRefuelAmountUsd: 8,
  maxAutoPurchasedUsdPerDay: 16,
  fallbackModel: 'all-protocol-router',
  freeFallbackModel: 'gemini-2.5-flash-free',
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
    if (notificationService) {
      notificationService.sendFromEnv({
        type: 'route_status_change',
        level: event.toStatus === 'unhealthy' ? 'critical' : 'warn',
        title: `Route ${event.routeName} is ${event.toStatus}`,
        message: `Route health changed from ${event.fromStatus} to ${event.toStatus}`,
        meta: event,
      }).catch(() => { /* ignore */ });
    }
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
  notificationService,  // 注入到 context，供 /notify/* 端点和 RefuelOrchestrator 使用
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
