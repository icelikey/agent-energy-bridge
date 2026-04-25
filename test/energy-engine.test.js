const test = require('node:test');
const assert = require('node:assert/strict');
const { EnergyEngine } = require('../src');

test('EnergyEngine scores efficient high-quality sessions higher', () => {
  const engine = new EnergyEngine();

  const efficient = engine.scoreSession({
    taskType: 'coding',
    qualityScore: 0.93,
    success: 1,
    firstPassSuccess: true,
    latencyMs: 1200,
    inputTokens: 3000,
    outputTokens: 2200,
    costUsd: 0.8,
  });

  const wasteful = engine.scoreSession({
    taskType: 'coding',
    qualityScore: 0.58,
    success: 0.72,
    firstPassSuccess: false,
    latencyMs: 12000,
    inputTokens: 38000,
    outputTokens: 24000,
    costUsd: 8.1,
  });

  assert.ok(efficient.energyScore > wasteful.energyScore);
});

test('EnergyEngine identifies a downward efficiency trend', () => {
  const engine = new EnergyEngine();
  const summary = engine.summarizeSession([
    { taskType: 'coding', qualityScore: 0.95, success: 1, firstPassSuccess: true, latencyMs: 900, inputTokens: 2500, outputTokens: 1800, costUsd: 0.7 },
    { taskType: 'coding', qualityScore: 0.9, success: 1, firstPassSuccess: true, latencyMs: 1100, inputTokens: 3200, outputTokens: 2400, costUsd: 0.9 },
    { taskType: 'coding', qualityScore: 0.72, success: 0.84, firstPassSuccess: false, latencyMs: 8000, inputTokens: 18000, outputTokens: 13000, costUsd: 4.6 },
    { taskType: 'coding', qualityScore: 0.61, success: 0.75, firstPassSuccess: false, latencyMs: 13000, inputTokens: 28000, outputTokens: 21000, costUsd: 7.2 },
  ]);

  assert.equal(summary.trend, 'down');
  assert.ok(summary.suggestions.length >= 1);
});
