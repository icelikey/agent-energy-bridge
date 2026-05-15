const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { AutoRefuelDecorator, FailoverAdapter, OpsEngine, RouteHealthChecker, createServer, MemoryAdapter } = require('../src');

// ------------------------------------------------------------------
// CONC-01: Concurrent refuel only triggers once
// ------------------------------------------------------------------

test('AutoRefuelDecorator serializes concurrent refuel attempts', async () => {
  let topUpCount = 0;
  let balance = 2;

  const adapter = {
    getBalance: async () => ({ availableUsd: balance, balanceUsd: balance }),
    topUp: async ({ amount }) => {
      topUpCount++;
      // Simulate async I/O delay to expose race window
      await new Promise((r) => setTimeout(r, 20));
      balance += amount;
      return { ok: true };
    },
    listModels: async () => ({ models: ['m1'] }),
  };

  const decorator = new AutoRefuelDecorator(adapter, {
    lowBalanceThresholdUsd: 5,
    refuelAmountUsd: 10,
    cooldownMs: 0,
    maxRefuelsPerHour: 10,
  });

  // Launch 10 concurrent getBalance calls
  await Promise.all(Array.from({ length: 10 }, () => decorator.getBalance()));

  // Only one refuel should have executed due to Promise lock
  assert.equal(topUpCount, 1, 'concurrent refuel should be serialized to single call');
  assert.equal(balance, 12, 'balance should reflect exactly one top-up');
});

test('AutoRefuelDecorator alert log is bounded and auto-trims', async () => {
  const adapter = {
    getBalance: async () => ({ availableUsd: 2, balanceUsd: 2 }),
    topUp: async () => ({ ok: true }),
    listModels: async () => ({ models: ['m1'] }),
  };

  const decorator = new AutoRefuelDecorator(adapter, {
    lowBalanceThresholdUsd: 5,
    refuelAmountUsd: 10,
    cooldownMs: 0,
    maxRefuelsPerHour: 2000,
    maxAlertLog: 50,
  });

  for (let i = 0; i < 100; i++) {
    await decorator.getBalance();
  }

  const alerts = decorator.getAlertLog(1000);
  assert.ok(alerts.length <= 50, 'alert log should not exceed maxAlertLog');
});

// ------------------------------------------------------------------
// CONC-01: FailoverAdapter switch serialization
// ------------------------------------------------------------------

test('FailoverAdapter serializes concurrent switch operations', async () => {
  const switches = [];
  const primary = {
    getBalance: async () => ({ availableUsd: 0, balanceUsd: 0 }),
    listModels: async () => { throw new Error('down'); },
  };
  const emergency = {
    getBalance: async () => ({ availableUsd: 999, balanceUsd: 999 }),
    listModels: async () => ({ models: ['emergency'] }),
  };

  const failover = new FailoverAdapter(primary, emergency, {
    onSwitch: (entry) => switches.push(entry),
  });

  // Concurrent calls that should all trigger the same switch
  await Promise.all([
    failover.getBalance(),
    failover.getBalance(),
    failover.getBalance(),
    failover.listModels(),
    failover.listModels(),
  ]);

  // Only one switch-to-emergency entry should exist
  const emergencySwitches = switches.filter((s) => s.to === 'emergency');
  assert.equal(emergencySwitches.length, 1, 'only one switch-to-emergency should be recorded');
});

test('FailoverAdapter switch log is bounded and auto-trims', async () => {
  let balance = 0;
  const primary = {
    getBalance: async () => ({ availableUsd: balance, balanceUsd: balance }),
  };
  const emergency = {
    getBalance: async () => ({ availableUsd: 5, balanceUsd: 5 }),
  };

  const failover = new FailoverAdapter(primary, emergency, {
    balanceThresholdUsd: 0.01,
  });

  // Rapidly oscillate balance to generate many switch entries
  for (let i = 0; i < 1200; i++) {
    balance = balance > 0.01 ? 0 : 5;
    await failover.getBalance();
  }

  const log = failover.getSwitchLog(2000);
  assert.ok(log.length <= 1000, 'switch log should not exceed hard limit of 1000');
});

test('FailoverAdapter forceRecover is safe under concurrent calls', async () => {
  const primary = {
    getBalance: async () => ({ availableUsd: 0, balanceUsd: 0 }),
    listModels: async () => ({ models: ['p'] }),
  };
  const emergency = {
    getBalance: async () => ({ availableUsd: 5, balanceUsd: 5 }),
    listModels: async () => ({ models: ['e'] }),
  };

  const failover = new FailoverAdapter(primary, emergency);
  await failover.getBalance();
  assert.equal(failover.getStatus().active, 'emergency');

  // Concurrent forceRecover calls should be safe
  await Promise.all([
    failover.forceRecover(),
    failover.forceRecover(),
    failover.forceRecover(),
  ]);

  assert.equal(failover.getStatus().active, 'primary');
  assert.equal(failover.getSwitchLog().filter((s) => s.reason === 'manual_recovery').length, 1);
});

// ------------------------------------------------------------------
// CONC-02: Resource cleanup on process exit / destroy
// ------------------------------------------------------------------

test('OpsEngine destroy stops monitoring and clears references', () => {
  const ops = new OpsEngine({
    adapter: { getBalance: async () => ({}) },
    monitoringIntervalMs: 50,
  });

  ops.startMonitoring();
  assert.ok(ops._intervalId);

  ops.destroy();
  assert.equal(ops._intervalId, null);
  assert.equal(ops.metrics.length, 0);
  assert.equal(ops.adapter, null);
});

test('RouteHealthChecker destroy stops interval and clears state', () => {
  const checker = new RouteHealthChecker({
    routes: [{ name: 'test', url: 'http://127.0.0.1:1' }],
    checkIntervalMs: 50,
  });

  checker.start();
  assert.ok(checker._intervalId);
  checker._history.push({ t: 1 });

  checker.destroy();
  assert.equal(checker._intervalId, null);
  assert.equal(checker._history.length, 0);
  assert.equal(checker._statusMap.size, 0);
});

test('Server destroy closes connections and cleans up resources', async () => {
  const adapter = new MemoryAdapter({ balanceUsd: 5 });
  const ops = new OpsEngine({ adapter, monitoringIntervalMs: 50 });
  const checker = new RouteHealthChecker({ routes: [], checkIntervalMs: 50 });
  ops.startMonitoring();

  const server = createServer({ adapter, opsEngine: ops, routeHealthChecker: checker });

  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      fetch(`http://127.0.0.1:${port}/agent/v1/health`)
        .then(async (res) => {
          assert.equal(res.status, 200);
          server.destroy(() => {
            assert.equal(ops._intervalId, null);
            assert.equal(checker._intervalId, null);
            resolve();
          });
        })
        .catch(reject);
    });
  });
});

test('RouteHealthChecker start is safe when runCheck throws', async () => {
  const checker = new RouteHealthChecker({
    routes: [{ name: 'bad', url: 'http://127.0.0.1:1' }],
    checkIntervalMs: 50,
  });

  // Should not throw even though the route is unreachable
  checker.start();
  assert.ok(checker._intervalId);

  // Wait for at least one interval tick
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(checker._history.length >= 1);

  checker.stop();
});

// ------------------------------------------------------------------
// CONC-04: Consistent reads under concurrent requests
// ------------------------------------------------------------------

test('SessionStore maintains consistency under concurrent addSession', () => {
  const store = require('../src').SessionStore ? new (require('../src').SessionStore)() : null;
  if (!store) return; // skip if not exported

  const promises = [];
  for (let i = 0; i < 100; i++) {
    promises.push(Promise.resolve(store.addSession({ taskType: 'test', energyScore: i })));
  }

  // In single-threaded event loop this is synchronous, but verify state is correct
  assert.equal(store.size(), 100);
  const recent = store.getRecentSessions(100);
  assert.equal(recent.length, 100);
});
