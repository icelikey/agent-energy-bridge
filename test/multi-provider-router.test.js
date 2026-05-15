const test = require('node:test');
const assert = require('node:assert/strict');
const { MultiProviderRouter } = require('../src');

function makeAdapter(overrides = {}) {
  return {
    getBalance: async () => ({ availableUsd: 10, balanceUsd: 10 }),
    listModels: async () => [],
    getUsage: async () => ({}),
    redeemCode: async () => ({}),
    issueKey: async () => ({}),
    rotateKey: async () => ({}),
    renderDocs: async () => '',
    ...overrides,
  };
}

function makeProviders() {
  return [
    { name: 'primary', weight: 2, adapter: makeAdapter(), primary: true },
    { name: 'backup', weight: 1, adapter: makeAdapter() },
  ];
}

// ----------------------------------------------------------------
// Basic construction
// ----------------------------------------------------------------

test('MultiProviderRouter constructs with empty providers', () => {
  const router = new MultiProviderRouter([]);
  const report = router.getReport();
  assert.equal(report.active, null);
  assert.deepEqual(report.providers, []);
  assert.equal(report.switchCount, 0);
});

test('MultiProviderRouter sets first provider as active', () => {
  const router = new MultiProviderRouter(makeProviders());
  assert.equal(router.getReport().active, 'primary');
});

test('MultiProviderRouter marks primary provider correctly', () => {
  const router = new MultiProviderRouter(makeProviders());
  const primary = router.getReport().providers.find((p) => p.primary);
  assert.ok(primary);
  assert.equal(primary.name, 'primary');
});

// ----------------------------------------------------------------
// selectProvider — ROUT-04 weighted load balancing
// ----------------------------------------------------------------

test('selectProvider returns null when no providers', () => {
  const router = new MultiProviderRouter([]);
  assert.equal(router.selectProvider(), null);
});

test('selectProvider skips unhealthy providers', () => {
  const router = new MultiProviderRouter(makeProviders());
  router._providers[0].status = 'unhealthy';
  const selected = router.selectProvider();
  assert.ok(selected);
  assert.equal(selected.name, 'backup');
});

test('selectProvider falls back to least-failed when all unhealthy', () => {
  const router = new MultiProviderRouter(makeProviders());
  router._providers[0].status = 'unhealthy';
  router._providers[0].consecutiveFailures = 5;
  router._providers[1].status = 'unhealthy';
  router._providers[1].consecutiveFailures = 2;
  const selected = router.selectProvider();
  assert.equal(selected.name, 'backup');
});

test('selectProvider respects weights (statistical)', () => {
  const providers = [
    { name: 'heavy', weight: 9, adapter: makeAdapter() },
    { name: 'light', weight: 1, adapter: makeAdapter() },
  ];
  const router = new MultiProviderRouter(providers);
  const counts = { heavy: 0, light: 0 };
  for (let i = 0; i < 1000; i++) {
    const p = router.selectProvider();
    counts[p.name]++;
  }
  assert.ok(counts.heavy > 800, `heavy count ${counts.heavy} should be > 800`);
  assert.ok(counts.light > 50, `light count ${counts.light} should be > 50`);
});

// ----------------------------------------------------------------
// _withRouting — ROUT-02 auto-switch on error
// ----------------------------------------------------------------

test('_withRouting delegates to active adapter', async () => {
  const adapter = makeAdapter({ getBalance: async () => ({ availableUsd: 42 }) });
  const router = new MultiProviderRouter([{ name: 'p1', weight: 1, adapter, primary: true }]);
  const result = await router.getBalance();
  assert.equal(result.availableUsd, 42);
});

test('_withRouting switches to backup on primary error', async () => {
  const failAdapter = makeAdapter({ getBalance: async () => { throw new Error('primary down'); } });
  const backupAdapter = makeAdapter({ getBalance: async () => ({ availableUsd: 5 }) });
  const router = new MultiProviderRouter([
    { name: 'primary', weight: 1, adapter: failAdapter, primary: true },
    { name: 'backup', weight: 1, adapter: backupAdapter },
  ]);
  const result = await router.getBalance();
  assert.equal(result.availableUsd, 5);
  assert.equal(router.getReport().active, 'backup');
});

test('_withRouting throws when all providers fail', async () => {
  const failAdapter = makeAdapter({ getBalance: async () => { throw new Error('down'); } });
  const router = new MultiProviderRouter([
    { name: 'p1', weight: 1, adapter: failAdapter, primary: true },
  ]);
  await assert.rejects(() => router.getBalance(), /down/);
});

test('_withRouting throws NO_PROVIDER when no providers configured', async () => {
  const router = new MultiProviderRouter([]);
  await assert.rejects(() => router.getBalance(), { code: 'NO_PROVIDER' });
});

// ----------------------------------------------------------------
// _onHealthChange — ROUT-01 detection, ROUT-02 switch, ROUT-03 recovery
// ----------------------------------------------------------------

test('_onHealthChange switches away from unhealthy active provider', async () => {
  const router = new MultiProviderRouter(makeProviders());
  router._onHealthChange({ name: 'primary', from: 'healthy', to: 'unhealthy' });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(router.getReport().active, 'backup');
});

test('_onHealthChange does not switch if non-active provider becomes unhealthy', async () => {
  const router = new MultiProviderRouter(makeProviders());
  router._onHealthChange({ name: 'backup', from: 'healthy', to: 'unhealthy' });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(router.getReport().active, 'primary');
});

test('_onHealthChange recovers to primary after debounce', async () => {
  const router = new MultiProviderRouter(makeProviders(), { recoveryDebounceMs: 20 });
  router._active = router._providers[1];
  router._providers[0].status = 'healthy';
  router._onHealthChange({ name: 'primary', from: 'degraded', to: 'healthy' });
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(router.getReport().active, 'primary');
});

// ----------------------------------------------------------------
// forceProvider — ROUT-05 manual control
// ----------------------------------------------------------------

test('forceProvider switches to named provider', async () => {
  const router = new MultiProviderRouter(makeProviders());
  await router.forceProvider('backup');
  assert.equal(router.getReport().active, 'backup');
});

test('forceProvider throws UNKNOWN_PROVIDER for invalid name', async () => {
  const router = new MultiProviderRouter(makeProviders());
  await assert.rejects(() => router.forceProvider('nonexistent'), { code: 'UNKNOWN_PROVIDER' });
});

// ----------------------------------------------------------------
// Switch log — ROUT-05 event logging
// ----------------------------------------------------------------

test('getSwitchLog returns switch history', async () => {
  const switches = [];
  const router = new MultiProviderRouter(makeProviders(), { onSwitch: (e) => switches.push(e) });
  await router.forceProvider('backup');
  await router.forceProvider('primary');
  const log = router.getSwitchLog(10);
  assert.equal(log.length, 2);
  assert.equal(log[0].to, 'backup');
  assert.equal(log[1].to, 'primary');
  assert.equal(switches.length, 2);
});

test('getSwitchLog(0) returns empty array', async () => {
  const router = new MultiProviderRouter(makeProviders());
  await router.forceProvider('backup');
  assert.deepEqual(router.getSwitchLog(0), []);
});

test('switch log caps at 1000 entries', async () => {
  const router = new MultiProviderRouter(makeProviders());
  for (let i = 0; i < 1001; i++) {
    router._switchLog.push({ from: 'a', to: 'b', timestamp: new Date().toISOString() });
  }
  await router.forceProvider('backup');
  assert.ok(router._switchLog.length <= 1000);
});

// ----------------------------------------------------------------
// onAlert callback — ROUT-05 notifications
// ----------------------------------------------------------------

test('onAlert fires on provider error', async () => {
  const alerts = [];
  const failAdapter = makeAdapter({ getBalance: async () => { throw new Error('fail'); } });
  const backupAdapter = makeAdapter();
  const router = new MultiProviderRouter([
    { name: 'primary', weight: 1, adapter: failAdapter, primary: true },
    { name: 'backup', weight: 1, adapter: backupAdapter },
  ], { onAlert: (a) => alerts.push(a) });
  await router.getBalance();
  assert.ok(alerts.some((a) => a.type === 'provider_error'));
});

test('onAlert fires on switch', async () => {
  const alerts = [];
  const router = new MultiProviderRouter(makeProviders(), { onAlert: (a) => alerts.push(a) });
  await router.forceProvider('backup');
  assert.ok(alerts.some((a) => a.type === 'switched_to_backup'));
});

// ----------------------------------------------------------------
// destroy
// ----------------------------------------------------------------

test('destroy clears providers and callbacks', () => {
  const router = new MultiProviderRouter(makeProviders());
  router.destroy();
  assert.deepEqual(router._providers, []);
  assert.equal(router._active, null);
  assert.equal(router._onSwitch, null);
  assert.equal(router._onAlert, null);
});

test('getReport after destroy returns empty state', () => {
  const router = new MultiProviderRouter(makeProviders());
  router.destroy();
  const report = router.getReport();
  assert.equal(report.active, null);
  assert.deepEqual(report.providers, []);
});
