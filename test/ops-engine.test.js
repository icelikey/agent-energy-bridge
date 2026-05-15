const test = require('node:test');
const assert = require('node:assert/strict');
const { OpsEngine, MemoryAdapter, BudgetGuard, ModelSelector, EnergyEngine, SessionStore, Logger } = require('../src');

function makeMockAdapter(overrides = {}) {
  return {
    getBalance: overrides.getBalance || (async () => ({ availableUsd: 10, balanceUsd: 10 })),
    getUsage: overrides.getUsage || (async () => ({ dailySpentUsd: 2, hourlyTokensUsed: 5000 })),
    listModels: overrides.listModels || (async () => ({ models: ['m1'] })),
  };
}

test('OpsEngine captureSnapshot returns balance and usage', async () => {
  const adapter = makeMockAdapter();
  const ops = new OpsEngine({ adapter });

  const snapshot = await ops.captureSnapshot('test');
  assert.ok(snapshot.timestamp);
  assert.equal(snapshot.label, 'test');
  assert.equal(snapshot.balance.availableUsd, 10);
  assert.equal(snapshot.usage.dailySpentUsd, 2);
});

test('OpsEngine captureSnapshot handles balance fetch failure', async () => {
  const adapter = makeMockAdapter({
    getBalance: async () => { throw new Error('balance down'); },
  });
  const ops = new OpsEngine({ adapter });

  const snapshot = await ops.captureSnapshot('test');
  assert.equal(snapshot.balance, null);
  assert.equal(snapshot.usage.dailySpentUsd, 2);
});

test('OpsEngine captureSnapshot handles usage fetch failure', async () => {
  const adapter = makeMockAdapter({
    getUsage: async () => { throw new Error('usage down'); },
  });
  const ops = new OpsEngine({ adapter });

  const snapshot = await ops.captureSnapshot('test');
  assert.equal(snapshot.balance.availableUsd, 10);
  assert.equal(snapshot.usage, null);
});

test('OpsEngine captureSnapshot throws when adapter is missing', async () => {
  const ops = new OpsEngine({});
  await assert.rejects(() => ops.captureSnapshot(), /adapter is required/);
});

test('OpsEngine captureSnapshot stores metrics with max limit', async () => {
  const adapter = makeMockAdapter();
  const ops = new OpsEngine({ adapter, maxMetrics: 3 });

  await ops.captureSnapshot('1');
  await ops.captureSnapshot('2');
  await ops.captureSnapshot('3');
  await ops.captureSnapshot('4');

  assert.equal(ops.metrics.length, 3);
  assert.equal(ops.metrics[0].label, '2');
  assert.equal(ops.metrics[2].label, '4');
});

test('OpsEngine startMonitoring and stopMonitoring work', async () => {
  const adapter = makeMockAdapter();
  const ops = new OpsEngine({ adapter, monitoringIntervalMs: 50 });

  ops.startMonitoring();
  assert.ok(ops._intervalId);

  // Wait for at least one auto snapshot
  await new Promise((r) => setTimeout(r, 120));
  assert.ok(ops.metrics.length >= 1);

  ops.stopMonitoring();
  assert.equal(ops._intervalId, null);
});

test('OpsEngine startMonitoring is idempotent', async () => {
  const adapter = makeMockAdapter();
  const ops = new OpsEngine({ adapter, monitoringIntervalMs: 50 });

  ops.startMonitoring();
  const firstId = ops._intervalId;
  ops.startMonitoring();
  assert.equal(ops._intervalId, firstId);

  ops.stopMonitoring();
});

test('OpsEngine generateReport returns no-data when empty', () => {
  const ops = new OpsEngine({});
  const report = ops.generateReport();
  assert.equal(report.period, 'no data');
  assert.equal(report.snapshots, 0);
  assert.equal(report.avgBalanceUsd, 0);
});

test('OpsEngine generateReport calculates averages and trend', async () => {
  let balance = 10;
  const adapter = makeMockAdapter({
    getBalance: async () => ({ availableUsd: balance, balanceUsd: balance }),
  });
  const ops = new OpsEngine({ adapter });

  await ops.captureSnapshot();
  balance = 8;
  await ops.captureSnapshot();
  balance = 5;
  await ops.captureSnapshot();

  const report = ops.generateReport();
  assert.equal(report.snapshots, 3);
  assert.ok(report.avgBalanceUsd > 0);
  assert.equal(report.minBalanceUsd, 5);
  assert.equal(report.trend, 'down');
});

test('OpsEngine generateReport detects upward trend', async () => {
  let balance = 5;
  const adapter = makeMockAdapter({
    getBalance: async () => ({ availableUsd: balance, balanceUsd: balance }),
  });
  const ops = new OpsEngine({ adapter });

  await ops.captureSnapshot();
  balance = 8;
  await ops.captureSnapshot();
  balance = 12;
  await ops.captureSnapshot();

  const report = ops.generateReport();
  assert.equal(report.trend, 'up');
});

test('OpsEngine generateReport generates critical alert for low balance', async () => {
  const adapter = makeMockAdapter({
    getBalance: async () => ({ availableUsd: 1, balanceUsd: 1 }),
  });
  const ops = new OpsEngine({ adapter });

  await ops.captureSnapshot();
  const report = ops.generateReport();
  assert.ok(report.alerts.some((a) => a.severity === 'critical'));
});

test('OpsEngine generateReport generates warning alert for medium-low balance', async () => {
  const adapter = makeMockAdapter({
    getBalance: async () => ({ availableUsd: 3, balanceUsd: 3 }),
  });
  const ops = new OpsEngine({ adapter });

  await ops.captureSnapshot();
  const report = ops.generateReport();
  assert.ok(report.alerts.some((a) => a.severity === 'warning'));
});

test('OpsEngine generateReport generates info alert for high spend', async () => {
  const adapter = makeMockAdapter({
    getUsage: async () => ({ dailySpentUsd: 60 }),
  });
  const ops = new OpsEngine({ adapter });

  await ops.captureSnapshot();
  const report = ops.generateReport();
  assert.ok(report.alerts.some((a) => a.severity === 'info'));
});

test('OpsEngine generateReport respects limit option', async () => {
  const adapter = makeMockAdapter();
  const ops = new OpsEngine({ adapter });

  for (let i = 0; i < 5; i++) {
    await ops.captureSnapshot();
  }

  const report = ops.generateReport({ limit: 2 });
  assert.equal(report.snapshots, 2);
});

test('OpsEngine getEnergyReport returns null when engine or store missing', () => {
  const ops = new OpsEngine({});
  assert.equal(ops.getEnergyReport(), null);

  const opsWithEngine = new OpsEngine({ energyEngine: new EnergyEngine() });
  assert.equal(opsWithEngine.getEnergyReport(), null);
});

test('OpsEngine getEnergyReport delegates to energyEngine', () => {
  const engine = new EnergyEngine();
  const store = new SessionStore();
  const ops = new OpsEngine({ energyEngine: engine, sessionStore: store });

  store.addSession({
    taskType: 'coding',
    inputTokens: 1000,
    outputTokens: 500,
    qualityScore: 0.9,
    successRate: 1,
    latencyMs: 500,
    costUsd: 0.3,
    energyScore: 85,
  });

  const report = ops.getEnergyReport();
  assert.ok(report);
  assert.ok(typeof report.avgEnergyScore === 'number');
});

test('OpsEngine logger integration works', async () => {
  const logs = [];
  const logger = new Logger({
    namespace: 'test',
    level: 'debug',
    sink: { write: (line) => logs.push(line) },
  });

  const adapter = makeMockAdapter();
  const ops = new OpsEngine({ adapter, logger });
  await ops.captureSnapshot('logged');
  assert.ok(logs.some((l) => l.includes('ops.snapshot_captured')));
});
