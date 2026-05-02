const test = require('node:test');
const assert = require('node:assert/strict');
const {
  NewAPIGatewayAdapter,
  AutoRefuelDecorator,
  OpsEngine,
  MemoryAdapter,
  BudgetGuard,
  ModelSelector,
  EnergyEngine,
  SessionStore,
  Logger,
} = require('../src');

function createMockTransport(responseMap) {
  return async ({ method, url, headers, body }) => {
    const path = new URL(url).pathname;
    const handler = responseMap[path];
    if (!handler) {
      const error = new Error(`Mock transport: no handler for ${path}`);
      error.status = 404;
      throw error;
    }
    return handler({ method, path, headers, body, url });
  };
}

test('NewAPIGatewayAdapter extracts balance from /api/user/self', async () => {
  const adapter = new NewAPIGatewayAdapter({
    baseUrl: 'http://test.example.com',
    apiKey: 'test-key',
    transport: createMockTransport({
      '/api/user/self': () => ({ success: true, data: { balance: 12.5, quota: 1000000 } }),
    }),
  });

  const balance = await adapter.getBalance();
  assert.equal(balance.availableUsd, 12.5);
});

test('NewAPIGatewayAdapter extracts balance from quota field', async () => {
  const adapter = new NewAPIGatewayAdapter({
    baseUrl: 'http://test.example.com',
    apiKey: 'test-key',
    transport: createMockTransport({
      '/api/user/self': () => ({ data: { quota: 500000 } }),
    }),
  });

  const balance = await adapter.getBalance();
  assert.equal(balance.availableUsd, 5);
});

test('NewAPIGatewayAdapter extracts usage from /api/usage/token', async () => {
  const adapter = new NewAPIGatewayAdapter({
    baseUrl: 'http://test.example.com',
    apiKey: 'test-key',
    transport: createMockTransport({
      '/api/usage/token/': () => ({ data: { daily_cost: 3.2, hourly_tokens: 18000 } }),
    }),
  });

  const usage = await adapter.getUsage();
  assert.equal(usage.dailySpentUsd, 3.2);
  assert.equal(usage.hourlyTokensUsed, 18000);
});

test('NewAPIGatewayAdapter delegates model list to generic adapter', async () => {
  const adapter = new NewAPIGatewayAdapter({
    baseUrl: 'http://test.example.com',
    apiKey: 'test-key',
    transport: createMockTransport({
      '/v1/models': () => ({ data: [{ id: 'gpt-4' }] }),
    }),
  });

  const models = await adapter.listModels();
  assert.ok(Array.isArray(models.data));
});

test('AutoRefuelDecorator triggers refuel when balance is low', async () => {
  const refuelEvents = [];
  const baseAdapter = new MemoryAdapter({ balanceUsd: 1, codes: { 'AUTO-10': 10 } });

  const decorator = new AutoRefuelDecorator(baseAdapter, {
    lowBalanceThresholdUsd: 5,
    refuelAmountUsd: 10,
    autoRefuelEnabled: true,
    refuelCodes: ['AUTO-10'],
    onRefuel: (event) => refuelEvents.push(event),
  });

  const balance = await decorator.getBalance();
  assert.equal(balance.availableUsd, 11);
  assert.equal(refuelEvents.length, 1);
  assert.equal(refuelEvents[0].amount, 10);
});

test('AutoRefuelDecorator respects cooldown', async () => {
  const baseAdapter = new MemoryAdapter({ balanceUsd: 1, codes: { 'AUTO-10': 10 } });

  const decorator = new AutoRefuelDecorator(baseAdapter, {
    lowBalanceThresholdUsd: 5,
    refuelAmountUsd: 10,
    autoRefuelEnabled: true,
    refuelCodes: ['AUTO-10'],
    cooldownMs: 60000,
  });

  await decorator.getBalance();
  const stats1 = decorator.getRefuelStats();
  assert.equal(stats1.refuelCount, 1);

  await decorator.getBalance();
  const stats2 = decorator.getRefuelStats();
  assert.equal(stats2.refuelCount, 1);
});

test('AutoRefuelDecorator alert log captures refuel_no_method', async () => {
  const dummyAdapter = {
    async getBalance() { return { availableUsd: 1 }; },
    async listModels() { return {}; },
    async getUsage() { return {}; },
    async issueKey() { return {}; },
    async rotateKey() { return {}; },
    async renderDocs() { return {}; },
  };

  const decorator = new AutoRefuelDecorator(dummyAdapter, {
    lowBalanceThresholdUsd: 5,
    autoRefuelEnabled: true,
  });

  await decorator.getBalance();
  const alerts = decorator.getAlertLog();
  assert.ok(alerts.length >= 1);
  assert.ok(alerts.some((a) => a.type === 'refuel_no_method'));
});

test('AutoRefuelDecorator proportional strategy', async () => {
  const refuelEvents = [];
  const baseAdapter = new MemoryAdapter({ balanceUsd: 1, codes: { 'AUTO-10': 10 } });

  const decorator = new AutoRefuelDecorator(baseAdapter, {
    lowBalanceThresholdUsd: 10,
    refuelAmountUsd: 5,
    refuelStrategy: 'proportional',
    autoRefuelEnabled: true,
    refuelCodes: ['AUTO-10'],
    onRefuel: (event) => refuelEvents.push(event),
  });

  await decorator.getBalance();
  assert.ok(refuelEvents[0].amount >= 5);
});

test('OpsEngine captures snapshot', async () => {
  const adapter = new MemoryAdapter({ balanceUsd: 8, dailySpentUsd: 2.5, hourlyTokensUsed: 12000 });
  const ops = new OpsEngine({ adapter, maxMetrics: 100 });

  const snapshot = await ops.captureSnapshot('test');
  assert.ok(snapshot.timestamp);
  assert.equal(snapshot.label, 'test');
  assert.equal(snapshot.balance.availableUsd, 8);
});

test('OpsEngine generates report with trend', async () => {
  const adapter = new MemoryAdapter({ balanceUsd: 8 });
  const ops = new OpsEngine({ adapter, maxMetrics: 100 });

  for (let i = 0; i < 5; i++) {
    ops.metrics.push({
      timestamp: new Date().toISOString(),
      label: 'test',
      balance: { availableUsd: 10 - i * 0.5 },
      usage: { dailySpentUsd: 1 + i * 0.2 },
    });
  }

  const report = ops.generateReport();
  assert.equal(report.snapshots, 5);
  assert.ok(['up', 'down', 'flat'].includes(report.trend));
  assert.ok(Array.isArray(report.alerts));
});

test('OpsEngine startMonitoring and stopMonitoring', async () => {
  const adapter = new MemoryAdapter({ balanceUsd: 8 });
  const ops = new OpsEngine({ adapter, monitoringIntervalMs: 100, maxMetrics: 100 });

  ops.startMonitoring();
  assert.ok(ops._intervalId);

  await new Promise((r) => setTimeout(r, 250));
  assert.ok(ops.metrics.length >= 2);

  ops.stopMonitoring();
  assert.strictEqual(ops._intervalId, null);
});

test('OpsEngine getEnergyReport delegates to energyEngine', () => {
  const energyEngine = new EnergyEngine();
  const sessionStore = new SessionStore();
  const ops = new OpsEngine({ energyEngine, sessionStore });

  sessionStore.addSession(energyEngine.scoreSession({ taskType: 'coding', inputTokens: 1000, outputTokens: 500, costUsd: 0.2 }));

  const report = ops.getEnergyReport();
  assert.ok(report);
  assert.equal(report.sessions, 1);
});
