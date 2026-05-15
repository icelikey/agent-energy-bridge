const test = require('node:test');
const assert = require('node:assert/strict');
const { AutoRefuelDecorator } = require('../src');

function makeMockAdapter(overrides = {}) {
  let balance = overrides.balance ?? { availableUsd: 10, balanceUsd: 10 };
  return {
    getBalance: overrides.getBalance || (async () => balance),
    setBalance: (b) => { balance = b; },
    listModels: overrides.listModels || (async () => ({ models: ['m1'] })),
    getUsage: overrides.getUsage || (async () => ({ dailySpentUsd: 1 })),
    topUp: overrides.topUp || null,
    redeemCode: overrides.redeemCode || null,
    issueKey: overrides.issueKey || (async () => ({ apiKey: 'ak-test' })),
    rotateKey: overrides.rotateKey || (async () => ({ apiKey: 'ak-rotated' })),
    renderDocs: overrides.renderDocs || (async () => ({ markdown: '# Docs' })),
  };
}

test('AutoRefuelDecorator passes through when balance is above threshold', async () => {
  const adapter = makeMockAdapter({ balance: { availableUsd: 10 } });
  const decorator = new AutoRefuelDecorator(adapter, { lowBalanceThresholdUsd: 5 });

  const balance = await decorator.getBalance();
  assert.equal(balance.availableUsd, 10);
  assert.equal(decorator._refuelCount, 0);
});

test('AutoRefuelDecorator triggers refuel when balance is below threshold', async () => {
  let topUpCalled = false;
  const adapter = makeMockAdapter({
    balance: { availableUsd: 2, balanceUsd: 2 },
    topUp: async ({ amount }) => {
      topUpCalled = true;
      adapter.setBalance({ availableUsd: 2 + amount, balanceUsd: 2 + amount });
      return { ok: true };
    },
  });

  const decorator = new AutoRefuelDecorator(adapter, {
    lowBalanceThresholdUsd: 5,
    refuelAmountUsd: 10,
    cooldownMs: 0,
  });

  const balance = await decorator.getBalance();
  assert.equal(topUpCalled, true);
  assert.equal(balance.availableUsd, 12);
  assert.equal(decorator._refuelCount, 1);
});

test('AutoRefuelDecorator respects cooldown between refuels', async () => {
  let topUpCount = 0;
  const adapter = makeMockAdapter({
    balance: { availableUsd: 2, balanceUsd: 2 },
    topUp: async () => {
      topUpCount++;
      return { ok: true };
    },
  });

  const decorator = new AutoRefuelDecorator(adapter, {
    lowBalanceThresholdUsd: 5,
    refuelAmountUsd: 10,
    cooldownMs: 60000,
  });

  await decorator.getBalance();
  assert.equal(topUpCount, 1);

  // Second call within cooldown should not trigger
  await decorator.getBalance();
  assert.equal(topUpCount, 1);
});

test('AutoRefuelDecorator respects maxRefuelsPerHour limit', async () => {
  let topUpCount = 0;
  const adapter = makeMockAdapter({
    balance: { availableUsd: 2, balanceUsd: 2 },
    topUp: async () => {
      topUpCount++;
      return { ok: true };
    },
  });

  const decorator = new AutoRefuelDecorator(adapter, {
    lowBalanceThresholdUsd: 5,
    refuelAmountUsd: 10,
    cooldownMs: 0,
    maxRefuelsPerHour: 2,
  });

  await decorator.getBalance();
  await decorator.getBalance();
  await decorator.getBalance();

  assert.equal(topUpCount, 2);
  assert.equal(decorator._refuelCount, 2);
});

test('AutoRefuelDecorator uses redeemCode when topUp is unavailable', async () => {
  let redeemedCode = null;
  const adapter = makeMockAdapter({
    balance: { availableUsd: 2, balanceUsd: 2 },
    redeemCode: async ({ code }) => {
      redeemedCode = code;
      adapter.setBalance({ availableUsd: 12, balanceUsd: 12 });
      return { ok: true, creditUsd: 10 };
    },
  });

  const decorator = new AutoRefuelDecorator(adapter, {
    lowBalanceThresholdUsd: 5,
    refuelAmountUsd: 10,
    cooldownMs: 0,
    refuelCodes: ['CODE-A', 'CODE-B'],
  });

  const balance = await decorator.getBalance();
  assert.equal(redeemedCode, 'CODE-A');
  assert.equal(balance.availableUsd, 12);
});

test('AutoRefuelDecorator consumes refuelCodes FIFO by default (single-use code)', async () => {
  const redeemedCodes = [];
  const adapter = makeMockAdapter({
    balance: { availableUsd: 2, balanceUsd: 2 },
    redeemCode: async ({ code }) => {
      redeemedCodes.push(code);
      return { ok: true };
    },
  });

  const decorator = new AutoRefuelDecorator(adapter, {
    lowBalanceThresholdUsd: 5,
    refuelAmountUsd: 10,
    cooldownMs: 0,
    maxRefuelsPerHour: 3,
    refuelCodes: ['CODE-A', 'CODE-B'],
  });

  // 默认 FIFO 消耗：用完池就停止（不会回头复用 CODE-A）
  await decorator.getBalance();
  await decorator.getBalance();
  await decorator.getBalance();  // 池已空，触发 refuel_no_codes

  assert.deepEqual(redeemedCodes, ['CODE-A', 'CODE-B']);
  assert.equal(decorator.refuelCodes.length, 0);
  assert.ok(decorator.getAlertLog().some((a) => a.type === 'refuel_no_codes'));
});

test('AutoRefuelDecorator cycles codes when consumeCode is false (backward compat for reusable codes)', async () => {
  const redeemedCodes = [];
  const adapter = makeMockAdapter({
    balance: { availableUsd: 2, balanceUsd: 2 },
    redeemCode: async ({ code }) => {
      redeemedCodes.push(code);
      return { ok: true };
    },
  });

  const decorator = new AutoRefuelDecorator(adapter, {
    lowBalanceThresholdUsd: 5,
    refuelAmountUsd: 10,
    cooldownMs: 0,
    maxRefuelsPerHour: 3,
    refuelCodes: ['CODE-A', 'CODE-B'],
    consumeCode: false,  // 显式启用循环模式（适用于套餐码等可重复兑换的场景）
  });

  await decorator.getBalance();
  await decorator.getBalance();
  await decorator.getBalance();

  assert.deepEqual(redeemedCodes, ['CODE-A', 'CODE-B', 'CODE-A']);
  // 循环模式下池不消耗
  assert.equal(decorator.refuelCodes.length, 2);
});

test('AutoRefuelDecorator does not synthesize code by default (most gateways reject synthetic codes)', async () => {
  const adapter = makeMockAdapter({
    balance: { availableUsd: 2, balanceUsd: 2 },
    redeemCode: async () => ({ ok: true }),
  });

  const decorator = new AutoRefuelDecorator(adapter, {
    lowBalanceThresholdUsd: 5,
    refuelAmountUsd: 10,
    cooldownMs: 0,
    refuelCodes: [],  // 没有配置码
  });

  await decorator.getBalance();
  // 默认 enableSyntheticCode:false → refuel_no_codes 告警
  assert.ok(decorator.getAlertLog().some((a) => a.type === 'refuel_no_codes'));
  assert.equal(decorator._refuelCount, 0);
});

test('AutoRefuelDecorator generates auto-refuel code when enableSyntheticCode is true (MemoryAdapter demo)', async () => {
  let redeemedCode = null;
  const adapter = makeMockAdapter({
    balance: { availableUsd: 2, balanceUsd: 2 },
    redeemCode: async ({ code }) => {
      redeemedCode = code;
      return { ok: true };
    },
  });

  const decorator = new AutoRefuelDecorator(adapter, {
    lowBalanceThresholdUsd: 5,
    refuelAmountUsd: 10,
    cooldownMs: 0,
    enableSyntheticCode: true,
  });

  await decorator.getBalance();
  assert.ok(redeemedCode.startsWith('AUTO-REFUEL-10-'));
});

// ----------------------------------------------------------------
// Bug fix: maxRefuelsPerHour sliding window (replaces broken "lifetime counter")
// ----------------------------------------------------------------

test('AutoRefuelDecorator sliding window resets maxRefuelsPerHour as old timestamps expire', async () => {
  let topUpCount = 0;
  const adapter = makeMockAdapter({
    balance: { availableUsd: 2, balanceUsd: 2 },
    topUp: async () => {
      topUpCount++;
      return { ok: true };
    },
  });

  // 使用 200ms 窗口模拟"1 小时"，便于测试
  const decorator = new AutoRefuelDecorator(adapter, {
    lowBalanceThresholdUsd: 5,
    refuelAmountUsd: 10,
    cooldownMs: 0,
    maxRefuelsPerHour: 2,
    refuelWindowMs: 200,  // 200ms 窗口
  });

  // 第 1 次窗口：用尽 2 次配额
  await decorator.getBalance();
  await decorator.getBalance();
  assert.equal(topUpCount, 2);
  assert.equal(decorator.getRefuelStats().recentRefuels, 2);

  // 第 3 次应被限流
  await decorator.getBalance();
  assert.equal(topUpCount, 2, '应被滑动窗口限流');

  // 等待窗口过期
  await new Promise((r) => setTimeout(r, 250));

  // 旧时间戳应被清理，配额恢复，第 4 次可以加油
  await decorator.getBalance();
  assert.equal(topUpCount, 3, '滑动窗口过期后配额必须恢复');
  assert.equal(decorator.getRefuelStats().recentRefuels, 1, 'recentRefuels 应只统计窗口内的次数');
  // refuelCount 是累计计数（生命周期内），不重置
  assert.equal(decorator._refuelCount, 3);
});

test('AutoRefuelDecorator getRefuelStats exposes recentRefuels and remainingRefuelCodes', async () => {
  const adapter = makeMockAdapter({
    balance: { availableUsd: 2, balanceUsd: 2 },
    redeemCode: async () => ({ ok: true }),
  });

  const decorator = new AutoRefuelDecorator(adapter, {
    lowBalanceThresholdUsd: 5,
    refuelAmountUsd: 10,
    cooldownMs: 0,
    refuelCodes: ['A', 'B', 'C'],
  });

  await decorator.getBalance();
  await decorator.getBalance();
  const stats = decorator.getRefuelStats();
  assert.equal(stats.refuelCount, 2);
  assert.equal(stats.recentRefuels, 2);
  assert.equal(stats.remainingRefuelCodes, 1);  // FIFO 消耗后剩 1 个
  assert.equal(stats.consumeCode, true);
});

test('AutoRefuelDecorator handles redeem ok:false (NewAPI failure mode) gracefully', async () => {
  const alerts = [];
  const adapter = makeMockAdapter({
    balance: { availableUsd: 2, balanceUsd: 2 },
    redeemCode: async () => ({ ok: false, message: 'invalid code' }),  // NewAPI 返回失败但不抛错
  });

  const decorator = new AutoRefuelDecorator(adapter, {
    lowBalanceThresholdUsd: 5,
    refuelAmountUsd: 10,
    cooldownMs: 0,
    refuelCodes: ['BAD-CODE'],
    onAlert: (a) => alerts.push(a),
  });

  await decorator.getBalance();
  assert.ok(alerts.some((a) => a.type === 'refuel_failed'), '应记录 refuel_failed 告警');
  assert.equal(decorator._refuelCount, 0, '失败不应计入 refuel_count');
});

test('AutoRefuelDecorator proportional strategy calculates amount correctly', async () => {
  let lastAmount = 0;
  const adapter = makeMockAdapter({
    balance: { availableUsd: 2, balanceUsd: 2 },
    topUp: async ({ amount }) => {
      lastAmount = amount;
      return { ok: true };
    },
  });

  const decorator = new AutoRefuelDecorator(adapter, {
    lowBalanceThresholdUsd: 5,
    refuelAmountUsd: 3,
    refuelStrategy: 'proportional',
    cooldownMs: 0,
  });

  await decorator.getBalance();
  // deficit = 5 - 2 = 3, amount = max(3, 3 * 2) = 6
  assert.equal(lastAmount, 6);
});

test('AutoRefuelDecorator dynamic strategy calculates amount correctly', async () => {
  let lastAmount = 0;
  const adapter = makeMockAdapter({
    balance: { availableUsd: 2, balanceUsd: 2 },
    topUp: async ({ amount }) => {
      lastAmount = amount;
      return { ok: true };
    },
  });

  const decorator = new AutoRefuelDecorator(adapter, {
    lowBalanceThresholdUsd: 5,
    refuelAmountUsd: 3,
    refuelStrategy: 'dynamic',
    cooldownMs: 0,
  });

  await decorator.getBalance();
  // base = 5 * 2 = 10, amount = max(3, 10 - 2) = 8
  assert.equal(lastAmount, 8);
});

test('AutoRefuelDecorator onRefuel callback fires on successful refuel', async () => {
  const refuelEvents = [];
  const adapter = makeMockAdapter({
    balance: { availableUsd: 2, balanceUsd: 2 },
    topUp: async () => ({ ok: true }),
  });

  const decorator = new AutoRefuelDecorator(adapter, {
    lowBalanceThresholdUsd: 5,
    refuelAmountUsd: 10,
    cooldownMs: 0,
    onRefuel: (event) => refuelEvents.push(event),
  });

  await decorator.getBalance();
  assert.equal(refuelEvents.length, 1);
  assert.equal(refuelEvents[0].amount, 10);
  assert.equal(refuelEvents[0].availableUsd, 2);
  assert.ok(refuelEvents[0].timestamp);
});

test('AutoRefuelDecorator onAlert callback fires on alert conditions', async () => {
  const alerts = [];
  const adapter = makeMockAdapter({
    balance: { availableUsd: 2, balanceUsd: 2 },
    topUp: async () => ({ ok: true }),
  });

  const decorator = new AutoRefuelDecorator(adapter, {
    lowBalanceThresholdUsd: 5,
    refuelAmountUsd: 10,
    cooldownMs: 60000,
    maxRefuelsPerHour: 1,
    onAlert: (alert) => alerts.push(alert),
  });

  await decorator.getBalance();
  assert.ok(alerts.some((a) => a.type === 'refuel_success'));

  // Trigger cooldown alert
  await decorator.getBalance();
  assert.ok(alerts.some((a) => a.type === 'refuel_cooldown'));
});

test('AutoRefuelDecorator getRefuelStats returns correct metrics', async () => {
  const adapter = makeMockAdapter({
    balance: { availableUsd: 2, balanceUsd: 2 },
    topUp: async () => ({ ok: true }),
  });

  const decorator = new AutoRefuelDecorator(adapter, {
    lowBalanceThresholdUsd: 5,
    refuelAmountUsd: 10,
    cooldownMs: 0,
  });

  await decorator.getBalance();
  const stats = decorator.getRefuelStats();
  assert.equal(stats.refuelCount, 1);
  assert.equal(stats.totalRefueledUsd, 10);
  assert.ok(stats.lastRefuelAt);
  assert.equal(stats.maxRefuelsPerHour, 3);
});

test('AutoRefuelDecorator resetStats clears all metrics', async () => {
  const adapter = makeMockAdapter({
    balance: { availableUsd: 2, balanceUsd: 2 },
    topUp: async () => ({ ok: true }),
  });

  const decorator = new AutoRefuelDecorator(adapter, {
    lowBalanceThresholdUsd: 5,
    refuelAmountUsd: 10,
    cooldownMs: 0,
  });

  await decorator.getBalance();
  decorator.resetStats();

  const stats = decorator.getRefuelStats();
  assert.equal(stats.refuelCount, 0);
  assert.equal(stats.totalRefueledUsd, 0);
  assert.equal(stats.lastRefuelAt, null);
});

test('AutoRefuelDecorator getAlertLog returns recent alerts', async () => {
  const adapter = makeMockAdapter({
    balance: { availableUsd: 2, balanceUsd: 2 },
    topUp: async () => ({ ok: true }),
  });

  const decorator = new AutoRefuelDecorator(adapter, {
    lowBalanceThresholdUsd: 5,
    refuelAmountUsd: 10,
    cooldownMs: 0,
  });

  await decorator.getBalance();
  const alerts = decorator.getAlertLog();
  assert.ok(alerts.length >= 1);
  assert.ok(alerts[0].type);
  assert.ok(alerts[0].timestamp);
});

test('AutoRefuelDecorator delegates other methods to wrapped adapter', async () => {
  const adapter = makeMockAdapter();
  const decorator = new AutoRefuelDecorator(adapter, {});

  const models = await decorator.listModels();
  assert.deepEqual(models, { models: ['m1'] });

  const usage = await decorator.getUsage();
  assert.deepEqual(usage, { dailySpentUsd: 1 });

  const key = await decorator.issueKey({ owner: 'test' });
  assert.equal(key.apiKey, 'ak-test');

  const rotated = await decorator.rotateKey({ keyId: 'k1' });
  assert.equal(rotated.apiKey, 'ak-rotated');

  const docs = await decorator.renderDocs({ template: 'quickstart' });
  assert.equal(docs.markdown, '# Docs');
});

test('AutoRefuelDecorator handles refuel failure gracefully', async () => {
  const adapter = makeMockAdapter({
    balance: { availableUsd: 2, balanceUsd: 2 },
    topUp: async () => { throw new Error('topup failed'); },
  });

  const decorator = new AutoRefuelDecorator(adapter, {
    lowBalanceThresholdUsd: 5,
    refuelAmountUsd: 10,
    cooldownMs: 0,
  });

  // Should not throw; returns original balance
  const balance = await decorator.getBalance();
  assert.equal(balance.availableUsd, 2);
});

test('AutoRefuelDecorator disabled when autoRefuelEnabled is false', async () => {
  let topUpCalled = false;
  const adapter = makeMockAdapter({
    balance: { availableUsd: 2, balanceUsd: 2 },
    topUp: async () => {
      topUpCalled = true;
      return { ok: true };
    },
  });

  const decorator = new AutoRefuelDecorator(adapter, {
    lowBalanceThresholdUsd: 5,
    autoRefuelEnabled: false,
  });

  await decorator.getBalance();
  assert.equal(topUpCalled, false);
});

test('AutoRefuelDecorator logs refuel_no_method when neither topUp nor redeemCode available', async () => {
  const alerts = [];
  const adapter = makeMockAdapter({
    balance: { availableUsd: 2, balanceUsd: 2 },
  });
  delete adapter.topUp;
  delete adapter.redeemCode;

  const decorator = new AutoRefuelDecorator(adapter, {
    lowBalanceThresholdUsd: 5,
    refuelAmountUsd: 10,
    cooldownMs: 0,
    onAlert: (alert) => alerts.push(alert),
  });

  await decorator.getBalance();
  assert.ok(alerts.some((a) => a.type === 'refuel_no_method'));
});

// ----------------------------------------------------------------
// Phase 6: NotificationService 集成 (FUEL-02, FUEL-04, FUEL-05, NOTF-01)
// ----------------------------------------------------------------

test('_logAlert calls notificationService.sendFromEnv on low balance event', async () => {
  const sent = [];
  const mockNotify = {
    sendFromEnv: async (n) => { sent.push(n); return { sent: true }; },
    send: async (n) => { sent.push(n); return { sent: true }; },
  };
  const adapter = {
    getBalance: async () => ({ availableUsd: 1 }),
    listModels: async () => [],
    getUsage: async () => ({}),
    redeemCode: async () => ({}),
    issueKey: async () => ({}),
    rotateKey: async () => ({}),
    renderDocs: async () => '',
  };
  const dec = new AutoRefuelDecorator(adapter, {
    notificationService: mockNotify,
    lowBalanceThresholdUsd: 5,
    autoRefuelEnabled: false,
  });
  dec._logAlert('refuel_cooldown', { availableUsd: 1 });
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(sent.length > 0, 'notification should have been sent');
  assert.equal(sent[0].type, 'refuel_cooldown');
});

test('_logAlert skips notification during quiet hours', async () => {
  const sent = [];
  const mockNotify = {
    sendFromEnv: async (n) => { sent.push(n); return { sent: true }; },
  };
  const adapter = {
    getBalance: async () => ({ availableUsd: 10 }),
    listModels: async () => [],
    getUsage: async () => ({}),
    redeemCode: async () => ({}),
    issueKey: async () => ({}),
    rotateKey: async () => ({}),
    renderDocs: async () => '',
  };
  // quietHours covers all 24 hours (start === end edge case: use 0-24 workaround via start=0,end=0 → not quiet)
  // Use start=0, end=24 is invalid; instead force by using a range that always matches current hour
  const currentHour = new Date().getHours();
  const dec = new AutoRefuelDecorator(adapter, {
    notificationService: mockNotify,
    quietHours: { start: currentHour, end: (currentHour + 1) % 24 },
    autoRefuelEnabled: false,
  });
  dec._logAlert('refuel_cooldown', { availableUsd: 1 });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(sent.length, 0, 'notification should be suppressed during quiet hours');
});

test('_logAlert uses console.error for critical events', () => {
  const errors = [];
  const origError = console.error;
  console.error = (...args) => errors.push(args);
  const adapter = {
    getBalance: async () => ({ availableUsd: 10 }),
    listModels: async () => [],
    getUsage: async () => ({}),
    redeemCode: async () => ({}),
    issueKey: async () => ({}),
    rotateKey: async () => ({}),
    renderDocs: async () => '',
  };
  const dec = new AutoRefuelDecorator(adapter, { autoRefuelEnabled: false });
  dec._logAlert('refuel_failed', { availableUsd: 0 });
  console.error = origError;
  assert.ok(errors.length > 0, 'console.error should be called for refuel_failed');
});

test('_logAlert uses console.warn for non-critical events', () => {
  const warns = [];
  const origWarn = console.warn;
  console.warn = (...args) => warns.push(args);
  const adapter = {
    getBalance: async () => ({ availableUsd: 10 }),
    listModels: async () => [],
    getUsage: async () => ({}),
    redeemCode: async () => ({}),
    issueKey: async () => ({}),
    rotateKey: async () => ({}),
    renderDocs: async () => '',
  };
  const dec = new AutoRefuelDecorator(adapter, { autoRefuelEnabled: false });
  dec._logAlert('refuel_cooldown', { availableUsd: 3 });
  console.warn = origWarn;
  assert.ok(warns.length > 0, 'console.warn should be called for refuel_cooldown');
});
