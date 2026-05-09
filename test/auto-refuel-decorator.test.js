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

test('AutoRefuelDecorator cycles through refuelCodes', async () => {
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

  await decorator.getBalance();
  await decorator.getBalance();
  await decorator.getBalance();

  assert.deepEqual(redeemedCodes, ['CODE-A', 'CODE-B', 'CODE-A']);
});

test('AutoRefuelDecorator generates auto-refuel code when no codes provided', async () => {
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
  });

  await decorator.getBalance();
  assert.ok(redeemedCode.startsWith('AUTO-REFUEL-10-'));
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
