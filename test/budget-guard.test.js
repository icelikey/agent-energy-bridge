const test = require('node:test');
const assert = require('node:assert/strict');
const { BudgetGuard } = require('../src');

test('BudgetGuard suggests fallback when projected spend exceeds daily budget', () => {
  const guard = new BudgetGuard({
    dailyBudgetUsd: 5,
    fallbackModel: 'all-protocol-router',
  });

  const result = guard.evaluateUsage({
    model: 'claude-4.7-premium',
    estimatedCostUsd: 1,
    dailySpentUsd: 4.6,
    requestedTokens: 5000,
    hourlyTokensUsed: 1000,
    modelPricePer1kUsd: 0.06,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.action, 'downgrade');
  assert.equal(result.fallbackModel, 'all-protocol-router');
});

test('BudgetGuard clips auto-refuel amount and denies exhausted refuel count', () => {
  const guard = new BudgetGuard({
    autoPurchaseEnabled: true,
    maxAutoRefuelsPerDay: 2,
    maxRefuelAmountUsd: 10,
    maxAutoPurchasedUsdPerDay: 15,
  });

  const partial = guard.evaluateAutoRefuel({
    requestedAmountUsd: 20,
    refuelsToday: 1,
    autoPurchasedUsdToday: 8,
  });

  assert.equal(partial.allowed, true);
  assert.equal(partial.approvedAmountUsd, 7);
  assert.ok(partial.reasons.length >= 1);

  const denied = guard.evaluateAutoRefuel({
    requestedAmountUsd: 5,
    refuelsToday: 2,
    autoPurchasedUsdToday: 8,
  });

  assert.equal(denied.allowed, false);
});
