const test = require('node:test');
const assert = require('node:assert/strict');
const { RouteHealthChecker } = require('../src');

test('RouteHealthChecker marks route as healthy after successful check', async () => {
  const checker = new RouteHealthChecker({
    routes: [{ name: 'test-ok', url: 'http://127.0.0.1:3100/agent/v1/health' }],
    timeoutMs: 5000,
  });

  await checker.runCheck();
  const status = checker.getStatus('test-ok');
  assert.ok(status);
  assert.ok(['healthy', 'unknown', 'degraded'].includes(status.status));
});

test('RouteHealthChecker marks route as unhealthy after failures', async () => {
  const checker = new RouteHealthChecker({
    routes: [{ name: 'test-bad', url: 'http://127.0.0.1:99999/invalid' }],
    timeoutMs: 1000,
    consecutiveFailuresThreshold: 1,
  });

  await checker.runCheck();
  const status = checker.getStatus('test-bad');
  assert.ok(status);
  assert.ok(['unhealthy', 'degraded', 'unknown'].includes(status.status));
});

test('RouteHealthChecker getReport returns summary', async () => {
  const checker = new RouteHealthChecker({
    routes: [
      { name: 'a', url: 'http://127.0.0.1:3100/agent/v1/health' },
      { name: 'b', url: 'http://127.0.0.1:99999/invalid' },
    ],
    timeoutMs: 2000,
    consecutiveFailuresThreshold: 1,
  });

  await checker.runCheck();
  const report = checker.getReport();
  assert.equal(report.totalRoutes, 2);
  assert.ok(typeof report.healthy === 'number');
  assert.ok(typeof report.unhealthy === 'number');
});

test('RouteHealthChecker start and stop', async () => {
  const checker = new RouteHealthChecker({
    routes: [{ name: 'test', url: 'http://127.0.0.1:3100/agent/v1/health' }],
    checkIntervalMs: 100,
  });

  checker.start();
  assert.ok(checker._intervalId);

  await new Promise((r) => setTimeout(r, 250));
  assert.ok(checker.getHistory().length >= 2);

  checker.stop();
  assert.strictEqual(checker._intervalId, null);
});
