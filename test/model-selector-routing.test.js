const test = require('node:test');
const assert = require('node:assert/strict');
const { ModelSelector, MODEL_CATALOG } = require('../src');

test('ModelSelector listCatalog filters by protocol', () => {
  const selector = new ModelSelector();
  const openaiModels = selector.listCatalog({ protocol: 'openai' });
  assert.ok(openaiModels.length > 0);
  assert.ok(openaiModels.every((m) => m.protocols.includes('openai')));
});

test('ModelSelector listCatalog filters by budgetTier', () => {
  const selector = new ModelSelector();
  const economyModels = selector.listCatalog({ budgetTier: 'economy' });
  assert.ok(economyModels.length > 0);
  assert.ok(economyModels.every((m) => m.budgetTier === 'economy'));
});

test('ModelSelector recommend selects free model when preferFree is set', () => {
  const selector = new ModelSelector();
  const result = selector.recommend({
    taskType: 'chat',
    budgetTier: 'free',
    preferFree: true,
  });

  assert.ok(result.primary.isFree);
  assert.ok(result.fallback.isFree || result.fallback === null);
});

test('ModelSelector recommend falls back to cheaper model', () => {
  const selector = new ModelSelector();
  const result = selector.recommend({
    taskType: 'coding',
    budgetTier: 'premium',
    protocol: 'anthropic',
  });

  assert.ok(result.primary);
  assert.ok(result.fallback);
  assert.ok(
    result.fallback.pricePer1kUsd < result.primary.pricePer1kUsd ||
      result.fallback.budgetTier === 'economy',
  );
});

test('ModelSelector recommend selects all-protocol-router for universal protocol needs', () => {
  const selector = new ModelSelector();
  const result = selector.recommend({
    taskType: 'routing',
    needsUniversalProtocol: true,
  });

  assert.equal(result.primary.id, 'all-protocol-router');
});

test('ModelSelector recommend all-protocol-router acts as universal fallback', () => {
  const selector = new ModelSelector();
  // Even with impossible protocol, all-protocol-router is always available
  const result = selector.recommend({
    taskType: 'coding',
    requiredCapabilities: ['nonexistent_capability_xyz'],
    protocol: 'nonexistent',
  });

  assert.equal(result.primary.id, 'all-protocol-router');
  assert.ok(result.candidates.length > 0);
});

test('ModelSelector recommend handles missing inputs gracefully', () => {
  const selector = new ModelSelector();
  const result = selector.recommend({});

  assert.ok(result.primary);
  assert.ok(result.candidates.length > 0);
});

test('ModelSelector scoreCandidate penalizes non-free models when preferFree', () => {
  const selector = new ModelSelector();
  const freeModel = MODEL_CATALOG.find((m) => m.id === 'gemini-2.5-flash-free');
  const paidModel = MODEL_CATALOG.find((m) => m.id === 'claude-4.7-premium');

  const freeScore = selector.scoreCandidate(freeModel, {
    budgetTier: 'free',
    requiredCapabilities: ['chat'],
    preferFree: true,
  });

  const paidScore = selector.scoreCandidate(paidModel, {
    budgetTier: 'free',
    requiredCapabilities: ['chat'],
    preferFree: true,
  });

  assert.ok(freeScore > paidScore);
});

test('ModelSelector scoreQualityFit prefers premium for high quality priority', () => {
  const selector = new ModelSelector();
  const premiumModel = MODEL_CATALOG.find((m) => m.id === 'claude-4.7-premium');
  const economyModel = MODEL_CATALOG.find((m) => m.id === 'claude-4.6-mixed');

  const premiumScore = selector.scoreQualityFit(premiumModel, 'high');
  const economyScore = selector.scoreQualityFit(economyModel, 'high');

  assert.ok(premiumScore > economyScore);
});

test('ModelSelector scoreQualityFit prefers economy for low quality priority', () => {
  const selector = new ModelSelector();
  const premiumModel = MODEL_CATALOG.find((m) => m.id === 'claude-4.7-premium');
  const economyModel = MODEL_CATALOG.find((m) => m.id === 'claude-4.6-mixed');

  const premiumScore = selector.scoreQualityFit(premiumModel, 'low');
  const economyScore = selector.scoreQualityFit(economyModel, 'low');

  assert.ok(economyScore > premiumScore);
});

test('ModelSelector recommendWorkflow handles single protocol workflow', () => {
  const selector = new ModelSelector();
  const workflow = selector.recommendWorkflow([
    { taskId: 'plan', taskType: 'coding', protocol: 'openai', budgetTier: 'premium' },
  ]);

  assert.equal(workflow.steps.length, 1);
  assert.equal(workflow.sharedRoute, null);
  assert.ok(workflow.steps[0].recommendation.primary);
});

test('ModelSelector recommendWorkflow recommends shared route for multi-protocol', () => {
  const selector = new ModelSelector();
  const workflow = selector.recommendWorkflow([
    { taskId: 'plan', taskType: 'coding', protocol: 'openai', budgetTier: 'premium' },
    { taskId: 'review', taskType: 'chat', protocol: 'anthropic', budgetTier: 'balanced' },
  ]);

  assert.equal(workflow.sharedRoute.id, 'all-protocol-router');
  assert.ok(workflow.explain.includes('all-protocol-router'));
});

test('ModelSelector recommendWorkflow aggregates requiredCapabilities', () => {
  const selector = new ModelSelector();
  const workflow = selector.recommendWorkflow([
    { taskId: 'a', taskType: 'coding', requiredCapabilities: ['coding'], protocol: 'openai' },
    { taskId: 'b', taskType: 'chat', requiredCapabilities: ['chat'], protocol: 'openai' },
  ], {
    requiredCapabilities: ['agentic'],
  });

  // Each step should have combined capabilities from shared + task-specific
  const stepA = workflow.steps.find((s) => s.taskId === 'a');
  assert.ok(stepA.recommendation.primary);
});

test('ModelSelector catalog is immutable from constructor', () => {
  const catalog = [...MODEL_CATALOG];
  const selector = new ModelSelector(catalog);

  catalog.pop();
  assert.equal(selector.catalog.length, MODEL_CATALOG.length);
});

test('ModelSelector normalizeBudgetTier handles aliases', () => {
  const { normalizeBudgetTier } = require('../src/core/model-selector');
  assert.equal(normalizeBudgetTier('low'), 'economy');
  assert.equal(normalizeBudgetTier('medium'), 'balanced');
  assert.equal(normalizeBudgetTier('high'), 'premium');
  assert.equal(normalizeBudgetTier('mixed'), 'economy');
  assert.equal(normalizeBudgetTier('adaptive'), 'balanced');
  assert.equal(normalizeBudgetTier('unknown'), 'balanced');
});

test('ModelSelector recommend with custom catalog works', () => {
  const customCatalog = [
    {
      id: 'custom-model',
      label: 'Custom',
      provider: 'test',
      budgetTier: 'balanced',
      qualityTier: 'balanced',
      pricePer1kUsd: 0.01,
      protocols: ['openai'],
      capabilities: ['chat'],
    },
  ];

  const selector = new ModelSelector(customCatalog);
  const result = selector.recommend({ taskType: 'chat' });

  assert.equal(result.primary.id, 'custom-model');
  assert.equal(result.candidates.length, 1);
});

test('ModelSelector recommend selects correct model for each task type', () => {
  const selector = new ModelSelector();

  const coding = selector.recommend({ taskType: 'coding', budgetTier: 'premium', protocol: 'openai' });
  assert.ok(coding.primary.capabilities.includes('coding'));

  const multimodal = selector.recommend({ taskType: 'multimodal', protocol: 'google' });
  assert.ok(multimodal.primary.capabilities.includes('multimodal'));

  const chat = selector.recommend({ taskType: 'chat', budgetTier: 'economy' });
  assert.ok(chat.primary.capabilities.includes('chat'));
});
