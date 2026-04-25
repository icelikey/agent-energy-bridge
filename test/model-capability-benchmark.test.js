const test = require('node:test');
const assert = require('node:assert/strict');
const { ModelCapabilityBenchmark, MODEL_CATALOG } = require('../src');

test('ModelCapabilityBenchmark ranks premium coding models above economy chat models for hard coding tasks', () => {
  const benchmark = new ModelCapabilityBenchmark();
  const codex = MODEL_CATALOG.find((model) => model.id === 'gpt-5-codex');
  const kimi = MODEL_CATALOG.find((model) => model.id === 'kimi-k2');

  const codexScore = benchmark.evaluateModel(codex, {
    taskType: 'coding',
    requiredCapabilities: ['coding', 'agentic', 'toolUse'],
    protocol: 'openai',
    budgetTier: 'premium',
    qualityPriority: 'high',
  });
  const kimiScore = benchmark.evaluateModel(kimi, {
    taskType: 'coding',
    requiredCapabilities: ['coding', 'agentic', 'toolUse'],
    protocol: 'openai',
    budgetTier: 'premium',
    qualityPriority: 'high',
  });

  assert.ok(codexScore.weightedScore > kimiScore.weightedScore);
  assert.ok(codexScore.dimensionScores.coding > kimiScore.dimensionScores.coding);
});

test('ModelCapabilityBenchmark can evaluate a mixed workflow portfolio', () => {
  const benchmark = new ModelCapabilityBenchmark();
  const workflow = benchmark.recommendWorkflow(MODEL_CATALOG, [
    { taskId: 'search', taskType: 'research', requiredCapabilities: ['search'], protocol: 'kimi', weight: 1 },
    {
      taskId: 'build',
      taskType: 'coding',
      requiredCapabilities: ['coding', 'agentic'],
      protocol: 'openai',
      budgetTier: 'premium',
      qualityPriority: 'high',
      weight: 1,
    },
    { taskId: 'vision', taskType: 'multimodal', requiredCapabilities: ['multimodal'], protocol: 'google', weight: 1 },
  ], {
    needsUniversalProtocol: true,
  });

  assert.equal(workflow.sharedRoute.id, 'all-protocol-router');
  assert.equal(workflow.steps.length, 3);
  assert.equal(workflow.steps.find((step) => step.taskId === 'build').primary.id, 'gpt-5-codex');
});
