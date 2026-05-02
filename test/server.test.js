const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer, buildContext, BudgetGuard, ModelSelector, EnergyEngine, CompatibilityGuard, ReferralEngine, MemoryAdapter } = require('../src');

function makeRequest(server, method, path, body) {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const url = `http://127.0.0.1:${port}${path}`;
      const options = {
        method,
        headers: { 'content-type': 'application/json' },
      };
      if (body !== undefined) {
        options.body = JSON.stringify(body);
      }
      fetch(url, options)
        .then(async (res) => {
          const data = await res.json();
          server.close(() => resolve({ status: res.status, data }));
        })
        .catch((err) => {
          server.close(() => reject(err));
        });
    });
  });
}

function createTestServer(options = {}) {
  const adapter = options.adapter || new MemoryAdapter({ balanceUsd: 5, codes: { 'TEST-10': 10 } });
  const context = buildContext({
    adapter,
    budgetGuard: options.budgetGuard || new BudgetGuard({ dailyBudgetUsd: 10, hourlyTokenLimit: 100000 }),
    modelSelector: options.modelSelector || new ModelSelector(),
    energyEngine: options.energyEngine || new EnergyEngine(),
    compatibilityGuard: options.compatibilityGuard || new CompatibilityGuard(),
    referralEngine: options.referralEngine || new ReferralEngine(),
  });
  return createServer(context);
}

test('GET /agent/v1/health returns ok', async () => {
  const server = createTestServer();
  const { status, data } = await makeRequest(server, 'GET', '/agent/v1/health');
  assert.equal(status, 200);
  assert.equal(data.success, true);
  assert.equal(data.status, 'ok');
  assert.equal(data.service, 'agent-energy-bridge');
});

test('GET /agent/v1/balance returns adapter balance', async () => {
  const server = createTestServer();
  const { status, data } = await makeRequest(server, 'GET', '/agent/v1/balance');
  assert.equal(status, 200);
  assert.equal(data.success, true);
  assert.equal(data.balance.availableUsd, 5);
});

test('GET /agent/v1/usage/summary returns adapter usage', async () => {
  const server = createTestServer();
  const { status, data } = await makeRequest(server, 'GET', '/agent/v1/usage/summary');
  assert.equal(status, 200);
  assert.equal(data.success, true);
  assert.ok(typeof data.usage.dailySpentUsd === 'number');
});

test('GET /agent/v1/models/capabilities returns model catalog', async () => {
  const server = createTestServer();
  const { status, data } = await makeRequest(server, 'GET', '/agent/v1/models/capabilities');
  assert.equal(status, 200);
  assert.equal(data.success, true);
  assert.ok(Array.isArray(data.models));
  assert.ok(data.count > 0);
});

test('POST /agent/v1/recommend returns model recommendation', async () => {
  const server = createTestServer();
  const { status, data } = await makeRequest(server, 'POST', '/agent/v1/recommend', {
    taskType: 'coding',
    budgetTier: 'balanced',
    protocol: 'openai',
  });
  assert.equal(status, 200);
  assert.equal(data.success, true);
  assert.ok(data.recommendation.primary);
  assert.ok(data.recommendation.candidates.length > 0);
});

test('POST /agent/v1/optimize returns guard decision and saving actions', async () => {
  const server = createTestServer();
  const { status, data } = await makeRequest(server, 'POST', '/agent/v1/optimize', {
    taskType: 'coding',
    budgetTier: 'balanced',
    estimatedCostUsd: 1.2,
    requestedTokens: 6000,
    dailySpentUsd: 2,
    hourlyTokensUsed: 10000,
  });
  assert.equal(status, 200);
  assert.equal(data.success, true);
  assert.ok(['proceed', 'downgrade_or_refuel'].includes(data.action));
  assert.ok(Array.isArray(data.savingActions));
});

test('POST /agent/v1/refuel/redeem redeems activation code', async () => {
  const server = createTestServer();
  const { status, data } = await makeRequest(server, 'POST', '/agent/v1/refuel/redeem', {
    code: 'TEST-10',
  });
  assert.equal(status, 200);
  assert.equal(data.success, true);
  assert.equal(data.redeemed, true);
  assert.equal(data.result.creditUsd, 10);
});

test('POST /agent/v1/keys/issue generates a new key', async () => {
  const server = createTestServer();
  const { status, data } = await makeRequest(server, 'POST', '/agent/v1/keys/issue', {
    owner: 'test-owner',
    group: 'test-group',
    plan: 'starter',
  });
  assert.equal(status, 200);
  assert.equal(data.success, true);
  assert.ok(data.key.apiKey.startsWith('ak-mem-'));
});

test('POST /agent/v1/docs/render returns markdown docs', async () => {
  const server = createTestServer();
  const { status, data } = await makeRequest(server, 'POST', '/agent/v1/docs/render', {
    template: 'quickstart',
    data: { baseUrl: 'https://gateway.example.com', apiKey: 'ak-test', routeName: '全能渠道' },
  });
  assert.equal(status, 200);
  assert.equal(data.success, true);
  assert.match(data.docs.markdown, /gateway.example.com/);
});

test('POST /agent/v1/session/report scores a session', async () => {
  const server = createTestServer();
  const { status, data } = await makeRequest(server, 'POST', '/agent/v1/session/report', {
    session: {
      taskType: 'coding',
      inputTokens: 2000,
      outputTokens: 1500,
      qualityScore: 0.9,
      successRate: 1,
      latencyMs: 800,
      costUsd: 0.5,
    },
  });
  assert.equal(status, 200);
  assert.equal(data.success, true);
  assert.ok(typeof data.scored.energyScore === 'number');
  assert.ok(data.scored.energyScore > 0);
});

test('Server returns 404 for unknown routes', async () => {
  const server = createTestServer();
  const { status, data } = await makeRequest(server, 'GET', '/agent/v1/unknown');
  assert.equal(status, 404);
  assert.equal(data.success, false);
  assert.equal(data.error, 'NOT_FOUND');
});

test('Server returns 400 for invalid JSON body', async () => {
  const server = createTestServer();
  const result = await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      fetch(`http://127.0.0.1:${port}/agent/v1/recommend`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not-json',
      })
        .then(async (res) => {
          const data = await res.json();
          server.close(() => resolve({ status: res.status, data }));
        })
        .catch((err) => {
          server.close(() => reject(err));
        });
    });
  });
  assert.equal(result.status, 400);
  assert.equal(result.data.error, 'INVALID_JSON');
});
