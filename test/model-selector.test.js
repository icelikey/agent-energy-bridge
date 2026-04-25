const test = require('node:test');
const assert = require('node:assert/strict');
const { ModelSelector } = require('../src');

test('ModelSelector promotes a multimodal specialist for multimodal workloads', () => {
  const selector = new ModelSelector();
  const result = selector.recommend({
    taskType: 'multimodal',
    requiredCapabilities: ['multimodal'],
    protocol: 'google',
    budgetTier: 'balanced',
    qualityPriority: 'balanced',
  });

  assert.equal(result.primary.id, 'gemini-2.5-pro');
  assert.ok(result.primary.capabilityAssessment.weightedScore >= result.fallback.capabilityAssessment.weightedScore);
});

test('ModelSelector can produce a multi-task workflow plan with a shared universal route', () => {
  const selector = new ModelSelector();
  const workflow = selector.recommendWorkflow([
    { taskId: 'plan', taskType: 'research', requiredCapabilities: ['search'], protocol: 'kimi', budgetTier: 'economy' },
    { taskId: 'build', taskType: 'coding', requiredCapabilities: ['coding', 'agentic'], protocol: 'openai', budgetTier: 'premium', qualityPriority: 'high' },
    { taskId: 'review', taskType: 'multimodal', requiredCapabilities: ['multimodal'], protocol: 'google', budgetTier: 'balanced' },
  ], {
    needsUniversalProtocol: true,
  });

  assert.equal(workflow.sharedRoute.id, 'all-protocol-router');
  assert.equal(workflow.steps.length, 3);
  assert.equal(workflow.steps.find((step) => step.taskId === 'build').recommendation.primary.id, 'gpt-5-codex');
});
