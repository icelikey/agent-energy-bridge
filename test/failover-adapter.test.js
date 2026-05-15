const test = require('node:test');
const assert = require('node:assert/strict');
const { FailoverAdapter } = require('../src');

function makeMockAdapter(overrides = {}) {
  return {
    listModels: overrides.listModels || (async () => ({ models: ['primary-model'] })),
    getUsage: overrides.getUsage || (async () => ({ dailySpentUsd: 1 })),
    getBalance: overrides.getBalance || (async () => ({ availableUsd: 10, balanceUsd: 10 })),
    redeemCode: overrides.redeemCode || (async () => ({ ok: true })),
    issueKey: overrides.issueKey || (async () => ({ apiKey: 'pk-primary' })),
    rotateKey: overrides.rotateKey || (async () => ({ apiKey: 'pk-rotated' })),
    renderDocs: overrides.renderDocs || (async () => ({ markdown: '# Primary' })),
  };
}

test('FailoverAdapter uses primary when healthy', async () => {
  const primary = makeMockAdapter();
  const emergency = makeMockAdapter({
    getBalance: async () => ({ availableUsd: 0 }),
    listModels: async () => ({ models: ['emergency-model'] }),
  });

  const failover = new FailoverAdapter(primary, emergency);
  const balance = await failover.getBalance();
  assert.equal(balance.availableUsd, 10);
  assert.equal(balance._source, 'primary');

  const models = await failover.listModels();
  assert.deepEqual(models.models, ['primary-model']);
});

test('FailoverAdapter switches to emergency when primary balance is depleted', async () => {
  const primary = makeMockAdapter({
    getBalance: async () => ({ availableUsd: 0, balanceUsd: 0 }),
  });
  const emergency = makeMockAdapter({
    getBalance: async () => ({ availableUsd: 999, balanceUsd: 999 }),
    listModels: async () => ({ models: ['emergency-model'] }),
  });

  const failover = new FailoverAdapter(primary, emergency, { balanceThresholdUsd: 0.01 });

  // First getBalance detects depletion and switches
  const balance = await failover.getBalance();
  assert.equal(balance._source, 'emergency');
  assert.equal(balance.availableUsd, 999);
  assert.equal(balance._primaryAvailableUsd, 0);

  // Subsequent calls use emergency
  const models = await failover.listModels();
  assert.deepEqual(models.models, ['emergency-model']);

  // Switch log recorded
  const log = failover.getSwitchLog();
  assert.equal(log.length, 1);
  assert.equal(log[0].from, 'primary');
  assert.equal(log[0].to, 'emergency');
  assert.equal(log[0].reason, 'balance_depleted');
});

test('FailoverAdapter switches to emergency when primary throws', async () => {
  const primary = makeMockAdapter({
    listModels: async () => { throw new Error('primary down'); },
  });
  const emergency = makeMockAdapter({
    listModels: async () => ({ models: ['emergency-model'] }),
  });

  const failover = new FailoverAdapter(primary, emergency);
  const models = await failover.listModels();
  assert.deepEqual(models.models, ['emergency-model']);

  const status = failover.getStatus();
  assert.equal(status.active, 'emergency');
});

test('FailoverAdapter recovers to primary when balance restored', async () => {
  let primaryBalance = 0;
  const primary = makeMockAdapter({
    getBalance: async () => ({ availableUsd: primaryBalance, balanceUsd: primaryBalance }),
  });
  const emergency = makeMockAdapter({
    getBalance: async () => ({ availableUsd: 5, balanceUsd: 5 }),
  });

  const failover = new FailoverAdapter(primary, emergency, { balanceThresholdUsd: 0.01 });

  // Deplete primary
  await failover.getBalance();
  assert.equal(failover.getStatus().active, 'emergency');

  // Restore primary balance
  primaryBalance = 10;
  const balance = await failover.getBalance();
  assert.equal(balance._source, 'primary');
  assert.equal(failover.getStatus().active, 'primary');

  const log = failover.getSwitchLog();
  assert.equal(log.length, 2);
  assert.equal(log[1].reason, 'recovered');
});

test('FailoverAdapter propagates error when both adapters fail', async () => {
  const primary = makeMockAdapter({
    listModels: async () => { throw new Error('primary down'); },
  });
  const emergency = makeMockAdapter({
    listModels: async () => { throw new Error('emergency down'); },
  });

  const failover = new FailoverAdapter(primary, emergency);
  await assert.rejects(() => failover.listModels(), /emergency down/);
});

test('FailoverAdapter getStatus reports correct state', async () => {
  const primary = makeMockAdapter();
  const emergency = makeMockAdapter();
  const failover = new FailoverAdapter(primary, emergency);

  const status = failover.getStatus();
  assert.equal(status.active, 'primary');
  assert.equal(status.primaryHealthy, true);
  assert.equal(status.consecutiveFailures, 0);
  assert.equal(status.switchCount, 0);
});

test('FailoverAdapter forceRecover switches back to primary', async () => {
  const primary = makeMockAdapter({
    getBalance: async () => ({ availableUsd: 0, balanceUsd: 0 }),
  });
  const emergency = makeMockAdapter();

  const failover = new FailoverAdapter(primary, emergency);
  await failover.getBalance();
  assert.equal(failover.getStatus().active, 'emergency');

  await failover.forceRecover();
  assert.equal(failover.getStatus().active, 'primary');
  assert.equal(failover.getStatus().consecutiveFailures, 0);

  const log = failover.getSwitchLog();
  assert.equal(log[log.length - 1].reason, 'manual_recovery');
});

test('FailoverAdapter onSwitch callback fires on every switch', async () => {
  const switches = [];
  const primary = makeMockAdapter({
    getBalance: async () => ({ availableUsd: 0 }),
  });
  const emergency = makeMockAdapter();

  const failover = new FailoverAdapter(primary, emergency, {
    onSwitch: (entry) => switches.push(entry),
  });

  await failover.getBalance();
  assert.equal(switches.length, 1);
  assert.equal(switches[0].from, 'primary');
  assert.equal(switches[0].to, 'emergency');
});

test('FailoverAdapter onAlert callback fires on failures and switches', async () => {
  const alerts = [];
  const primary = makeMockAdapter({
    listModels: async () => { throw new Error('boom'); },
  });
  const emergency = makeMockAdapter();

  const failover = new FailoverAdapter(primary, emergency, {
    maxConsecutiveFailures: 1,
    onAlert: (alert) => alerts.push(alert),
  });

  await failover.listModels();
  assert.ok(alerts.some((a) => a.type === 'primary_failure'));
  assert.ok(alerts.some((a) => a.type === 'switched_to_emergency'));
});

test('FailoverAdapter redeemCode and issueKey failover correctly', async () => {
  const primary = makeMockAdapter({
    redeemCode: async () => { throw new Error('primary redeem failed'); },
    issueKey: async () => { throw new Error('primary issue failed'); },
  });
  const emergency = makeMockAdapter({
    redeemCode: async () => ({ ok: true, source: 'emergency' }),
    issueKey: async () => ({ apiKey: 'ek-123', source: 'emergency' }),
  });

  const failover = new FailoverAdapter(primary, emergency);

  const redeemed = await failover.redeemCode({ code: 'TEST' });
  assert.equal(redeemed.source, 'emergency');

  const key = await failover.issueKey({ owner: 'test' });
  assert.equal(key.source, 'emergency');
});

test('FailoverAdapter handles emergency balance when emergency getBalance throws', async () => {
  const primary = makeMockAdapter({
    getBalance: async () => ({ availableUsd: 0 }),
  });
  const emergency = makeMockAdapter({
    getBalance: async () => { throw new Error('emergency balance unavailable'); },
  });

  const failover = new FailoverAdapter(primary, emergency);
  const balance = await failover.getBalance();
  assert.equal(balance.availableUsd, 0);
  assert.equal(balance._source, 'emergency');
});

test('FailoverAdapter consecutiveFailures threshold marks primary unhealthy', async () => {
  const primary = makeMockAdapter({
    getBalance: async () => { throw new Error('unavailable'); },
  });
  const emergency = makeMockAdapter();

  const failover = new FailoverAdapter(primary, emergency, { maxConsecutiveFailures: 2 });

  // getBalance always probes primary first regardless of active state
  await failover.getBalance();
  assert.equal(failover.getStatus().consecutiveFailures, 1);
  assert.equal(failover.getStatus().primaryHealthy, true);

  await failover.getBalance();
  assert.equal(failover.getStatus().consecutiveFailures, 2);
  assert.equal(failover.getStatus().primaryHealthy, false);
});
