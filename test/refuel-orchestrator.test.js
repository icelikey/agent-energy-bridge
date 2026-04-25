const test = require('node:test');
const assert = require('node:assert/strict');
const { BudgetGuard, CompatibilityGuard, ModelSelector, RefuelOrchestrator } = require('../src');

test('RefuelOrchestrator prefers activation-code redemption before issuing a new key', async () => {
  const calls = [];
  const adapter = {
    async getUsage() {
      return { dailySpentUsd: 3.5, hourlyTokensUsed: 18000, autoRefuelsToday: 0, autoPurchasedUsdToday: 0 };
    },
    async getBalance() {
      return { availableUsd: 1.2 };
    },
    async redeemCode({ code }) {
      calls.push(['redeem', code]);
      return { ok: true, code, creditUsd: 10 };
    },
    async issueKey() {
      calls.push(['issue']);
      return { apiKey: 'ak-generated' };
    },
    async renderDocs() {
      return { markdown: 'ok' };
    },
  };

  const orchestrator = new RefuelOrchestrator({
    adapter,
    budgetGuard: new BudgetGuard({
      dailyBudgetUsd: 10,
      hourlyTokenLimit: 120000,
      autoPurchaseEnabled: true,
      maxAutoRefuelsPerDay: 2,
      maxRefuelAmountUsd: 10,
      maxAutoPurchasedUsdPerDay: 20,
      fallbackModel: 'all-protocol-router',
    }),
    compatibilityGuard: new CompatibilityGuard(),
    modelSelector: new ModelSelector(),
  });

  const result = await orchestrator.prepareSession({
    activationCode: 'DEMO-2026',
    taskType: 'coding',
    protocol: 'openai',
    budgetTier: 'balanced',
    estimatedCostUsd: 1.2,
    requestedTokens: 6000,
    routeName: '全能渠道',
  });

  assert.equal(result.status, 'ready');
  assert.equal(result.refuel.action, 'redeem_code');
  assert.deepEqual(calls, [['redeem', 'DEMO-2026']]);
});

test('RefuelOrchestrator keeps existing route and existing key untouched by default', async () => {
  const calls = [];
  const adapter = {
    async getUsage() {
      return { dailySpentUsd: 4.5, hourlyTokensUsed: 22000, autoRefuelsToday: 0, autoPurchasedUsdToday: 0 };
    },
    async getBalance() {
      return { availableUsd: 1.1 };
    },
    async redeemCode() {
      throw new Error('not used');
    },
    async issueKey() {
      calls.push('issue');
      return { apiKey: 'ak-generated' };
    },
    async renderDocs() {
      return { markdown: 'ok' };
    },
  };

  const orchestrator = new RefuelOrchestrator({
    adapter,
    budgetGuard: new BudgetGuard({
      dailyBudgetUsd: 10,
      hourlyTokenLimit: 120000,
      autoPurchaseEnabled: true,
      maxAutoRefuelsPerDay: 2,
      maxRefuelAmountUsd: 10,
      maxAutoPurchasedUsdPerDay: 20,
      fallbackModel: 'all-protocol-router',
    }),
    compatibilityGuard: new CompatibilityGuard(),
    modelSelector: new ModelSelector(),
  });

  const result = await orchestrator.prepareSession({
    currentRoute: 'legacy-premium-route',
    existingKey: { apiKey: 'ak-existing', group: 'legacy-premium-route' },
    taskType: 'coding',
    protocol: 'openai',
    budgetTier: 'premium',
    qualityPriority: 'high',
    estimatedCostUsd: 1.5,
    requestedTokens: 7000,
  });

  assert.equal(result.routingPlan.activeRoute, 'legacy-premium-route');
  assert.equal(result.routingPlan.shadowRecommendation, 'gpt-5-codex');
  assert.equal(result.refuel.action, 'reuse_existing_key');
  assert.equal(result.refuel.existingKey.apiKey, 'ak-existing');
  assert.deepEqual(calls, []);
});

test('RefuelOrchestrator can provision docs after issuing a key', async () => {
  const adapter = {
    async getUsage() {
      return { dailySpentUsd: 0, hourlyTokensUsed: 0, autoRefuelsToday: 0, autoPurchasedUsdToday: 0 };
    },
    async getBalance() {
      return { availableUsd: 99 };
    },
    async redeemCode() {
      throw new Error('not used');
    },
    async issueKey() {
      return { apiKey: 'ak-docs', group: 'all-protocol-router' };
    },
    async renderDocs({ data }) {
      return { markdown: `Base URL: ${data.baseUrl}\nAPI Key: ${data.apiKey}` };
    },
  };

  const orchestrator = new RefuelOrchestrator({
    adapter,
    budgetGuard: new BudgetGuard(),
    compatibilityGuard: new CompatibilityGuard(),
    modelSelector: new ModelSelector(),
  });

  const provisioned = await orchestrator.provisionAccess({
    baseUrl: 'https://gateway.example.com',
    routeName: '全能渠道',
    allowedModels: ['Claude', 'Kimi'],
  });

  assert.equal(provisioned.issuedKey.apiKey, 'ak-docs');
  assert.match(provisioned.docs.markdown, /https:\/\/gateway.example.com/);
});

test('RefuelOrchestrator reuses an existing key when rendering docs', async () => {
  const calls = [];
  const adapter = {
    async getUsage() {
      return { dailySpentUsd: 0, hourlyTokensUsed: 0, autoRefuelsToday: 0, autoPurchasedUsdToday: 0 };
    },
    async getBalance() {
      return { availableUsd: 99 };
    },
    async redeemCode() {
      throw new Error('not used');
    },
    async issueKey() {
      calls.push('issue');
      return { apiKey: 'ak-docs' };
    },
    async renderDocs({ data }) {
      return { markdown: `Route: ${data.routeName}\nAPI Key: ${data.apiKey}` };
    },
  };

  const orchestrator = new RefuelOrchestrator({
    adapter,
    budgetGuard: new BudgetGuard(),
    compatibilityGuard: new CompatibilityGuard(),
    modelSelector: new ModelSelector(),
  });

  const provisioned = await orchestrator.provisionAccess({
    currentRoute: 'legacy-premium-route',
    existingKey: { apiKey: 'ak-existing', group: 'legacy-premium-route' },
  });

  assert.equal(provisioned.issuedKey.apiKey, 'ak-existing');
  assert.equal(provisioned.routingPlan.activeRoute, 'legacy-premium-route');
  assert.match(provisioned.docs.markdown, /legacy-premium-route/);
  assert.deepEqual(calls, []);
});
