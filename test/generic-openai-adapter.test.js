const test = require('node:test');
const assert = require('node:assert/strict');
const { GenericOpenAIGatewayAdapter } = require('../src');

test('GenericOpenAIGatewayAdapter forwards auth, query, body and configured paths', async () => {
  const calls = [];
  const adapter = new GenericOpenAIGatewayAdapter({
    baseUrl: 'https://gateway.example.com/',
    apiKey: 'sk-demo',
    transport: async (request) => {
      calls.push(request);
      return { ok: true };
    },
    paths: {
      usage: '/agent/v1/usage',
      redeem: '/agent/v1/refuel/redeem',
    },
  });

  await adapter.getUsage({ owner: 'brave' });
  await adapter.redeemCode({ code: 'DEMO-2026' });

  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /agent\/v1\/usage\?owner=brave/);
  assert.equal(calls[0].headers.authorization, 'Bearer sk-demo');
  assert.equal(calls[1].body.code, 'DEMO-2026');
  assert.match(calls[1].url, /agent\/v1\/refuel\/redeem/);
});
