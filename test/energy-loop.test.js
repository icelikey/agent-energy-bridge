const test = require('node:test');
const assert = require('node:assert/strict');
const {
  BudgetGuard,
  ModelSelector,
  EnergyEngine,
  CompatibilityGuard,
  MemoryAdapter,
  SessionStore,
  RefuelOrchestrator,
} = require('../src');

function createTestOrchestrator(options = {}) {
  const adapter = options.adapter || new MemoryAdapter({ balanceUsd: 5, codes: { 'TEST-10': 10 } });
  return new RefuelOrchestrator({
    adapter,
    budgetGuard: options.budgetGuard || new BudgetGuard({ dailyBudgetUsd: 10, hourlyTokenLimit: 100000 }),
    modelSelector: options.modelSelector || new ModelSelector(),
    compatibilityGuard: options.compatibilityGuard || new CompatibilityGuard(),
    energyEngine: options.energyEngine || new EnergyEngine(),
    sessionStore: options.sessionStore || new SessionStore(),
  });
}

test('RefuelOrchestrator.reportSession scores and stores a session', () => {
  const orchestrator = createTestOrchestrator();
  const scored = orchestrator.reportSession({
    taskType: 'coding',
    inputTokens: 2000,
    outputTokens: 1500,
    qualityScore: 0.9,
    successRate: 1,
    latencyMs: 800,
    costUsd: 0.5,
  });

  assert.ok(typeof scored.energyScore === 'number');
  assert.ok(scored.energyScore > 0);
  assert.equal(orchestrator.sessionStore.size(), 1);
});

test('RefuelOrchestrator.getSessionSummary returns trend analysis', () => {
  const orchestrator = createTestOrchestrator();

  for (let i = 0; i < 5; i++) {
    orchestrator.reportSession({
      taskType: 'coding',
      inputTokens: 2000 + i * 100,
      outputTokens: 1500,
      qualityScore: 0.85 - i * 0.02,
      successRate: 1,
      latencyMs: 800 + i * 200,
      costUsd: 0.5 + i * 0.1,
    });
  }

  const summary = orchestrator.getSessionSummary();
  assert.equal(summary.sessions, 5);
  assert.ok(typeof summary.avgEnergyScore === 'number');
  assert.ok(Array.isArray(summary.suggestions));
});

test('RefuelOrchestrator.getSessionSummary filters by taskType', () => {
  const orchestrator = createTestOrchestrator();

  orchestrator.reportSession({ taskType: 'coding', inputTokens: 1000, outputTokens: 500, costUsd: 0.2 });
  orchestrator.reportSession({ taskType: 'chat', inputTokens: 1000, outputTokens: 500, costUsd: 0.1 });
  orchestrator.reportSession({ taskType: 'coding', inputTokens: 1000, outputTokens: 500, costUsd: 0.3 });

  const codingSummary = orchestrator.getSessionSummary({ taskType: 'coding' });
  assert.equal(codingSummary.sessions, 2);

  const chatSummary = orchestrator.getSessionSummary({ taskType: 'chat' });
  assert.equal(chatSummary.sessions, 1);
});

test('RefuelOrchestrator.prepareSession includes energyInsights when available', async () => {
  const orchestrator = createTestOrchestrator();

  orchestrator.reportSession({
    taskType: 'coding',
    inputTokens: 2000,
    outputTokens: 1500,
    qualityScore: 0.9,
    successRate: 1,
    latencyMs: 800,
    costUsd: 0.5,
  });

  const result = await orchestrator.prepareSession({
    taskType: 'coding',
    protocol: 'openai',
    budgetTier: 'balanced',
    estimatedCostUsd: 1.2,
    requestedTokens: 6000,
  });

  assert.ok(result.energyInsights);
  assert.equal(result.energyInsights.overall.sessions, 1);
  assert.ok(Array.isArray(result.energyInsights.recommendations));
});

test('RefuelOrchestrator.prepareSession returns null energyInsights when no engine/store', async () => {
  const orchestrator = new RefuelOrchestrator({
    adapter: new MemoryAdapter(),
    budgetGuard: new BudgetGuard(),
    modelSelector: new ModelSelector(),
  });

  const result = await orchestrator.prepareSession({
    taskType: 'coding',
    protocol: 'openai',
    budgetTier: 'balanced',
    estimatedCostUsd: 1.2,
    requestedTokens: 6000,
  });

  assert.strictEqual(result.energyInsights, null);
});

test('RefuelOrchestrator energyInsights detects downward trend', async () => {
  const orchestrator = createTestOrchestrator();

  for (let i = 0; i < 8; i++) {
    orchestrator.reportSession({
      taskType: 'coding',
      inputTokens: 8000 + i * 2000,
      outputTokens: 4000 + i * 1000,
      qualityScore: 0.72 - i * 0.06,
      successRate: 0.92 - i * 0.08,
      latencyMs: 2000 + i * 1500,
      costUsd: 1.5 + i * 0.5,
      tokenBudget: 50000,
      costBudgetUsd: 20,
    });
  }

  const result = await orchestrator.prepareSession({
    taskType: 'coding',
    protocol: 'openai',
    budgetTier: 'balanced',
    estimatedCostUsd: 1.2,
    requestedTokens: 6000,
  });

  assert.ok(result.energyInsights);
  assert.equal(result.energyInsights.overall.trend, 'down');
  assert.ok(
    result.energyInsights.recommendations.some((r) => r.includes('trending down')),
    'should warn about downward trend',
  );
});

test('reportSession throws when energyEngine is missing', () => {
  const orchestrator = new RefuelOrchestrator({
    adapter: new MemoryAdapter(),
    budgetGuard: new BudgetGuard(),
    modelSelector: new ModelSelector(),
  });

  assert.throws(() => {
    orchestrator.reportSession({ taskType: 'coding', inputTokens: 1000, outputTokens: 500 });
  }, /energyEngine is required/);
});

test('getSessionSummary throws when energyEngine is missing', () => {
  const orchestrator = new RefuelOrchestrator({
    adapter: new MemoryAdapter(),
    budgetGuard: new BudgetGuard(),
    modelSelector: new ModelSelector(),
  });

  assert.throws(() => {
    orchestrator.getSessionSummary();
  }, /energyEngine is required/);
});
