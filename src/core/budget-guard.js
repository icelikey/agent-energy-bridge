const DEFAULT_POLICY = Object.freeze({
  dailyBudgetUsd: Number.POSITIVE_INFINITY,
  hourlyTokenLimit: Number.POSITIVE_INFINITY,
  maxAutoRefuelsPerDay: 0,
  maxRefuelAmountUsd: 0,
  maxAutoPurchasedUsdPerDay: 0,
  expensiveModelAllowlist: [],
  expensiveModelPriceThresholdUsdPer1k: 0.02,
  fallbackModel: null,
  freeFallbackModel: null,
  autoPurchaseEnabled: false,
  enableFreeFallback: true,
});

function round(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

function mergeAction(currentAction, nextAction) {
  const priorities = { allow: 0, downgrade: 1, block: 2 };
  return priorities[nextAction] > priorities[currentAction] ? nextAction : currentAction;
}

class BudgetGuard {
  constructor(policy = {}) {
    this.policy = {
      ...DEFAULT_POLICY,
      ...policy,
      expensiveModelAllowlist: [...(policy.expensiveModelAllowlist || DEFAULT_POLICY.expensiveModelAllowlist)],
    };
  }

  evaluateUsage(input = {}) {
    const requestedTokens = Number(input.requestedTokens ?? 0);
    const estimatedCostUsd = Number(input.estimatedCostUsd ?? 0);
    const dailySpentUsd = Number(input.dailySpentUsd ?? 0);
    const hourlyTokensUsed = Number(input.hourlyTokensUsed ?? 0);
    const availableUsd = Number(input.availableUsd ?? 0);
    const modelPricePer1kUsd = Number(input.modelPricePer1kUsd ?? 0);
    const model = input.model ?? 'unknown-model';
    const fallbackModel = input.fallbackModel ?? this.policy.fallbackModel ?? null;
    const freeFallbackModel = input.freeFallbackModel ?? this.policy.freeFallbackModel ?? null;
    const projectedSpendUsd = round(dailySpentUsd + estimatedCostUsd);
    const projectedHourlyTokens = round(hourlyTokensUsed + requestedTokens);
    const reasons = [];
    let action = 'allow';

    // Zero balance or insufficient funds -> free fallback
    if (availableUsd <= 0 && this.policy.enableFreeFallback && freeFallbackModel) {
      reasons.push(`balance depleted: $${availableUsd} available, switching to free fallback`);
      action = mergeAction(action, 'free_fallback');
    }

    if (projectedHourlyTokens > this.policy.hourlyTokenLimit) {
      reasons.push(`hourly token limit exceeded: ${projectedHourlyTokens} > ${this.policy.hourlyTokenLimit}`);
      action = mergeAction(action, 'block');
    }

    if (projectedSpendUsd > this.policy.dailyBudgetUsd) {
      reasons.push(`daily budget exceeded: ${projectedSpendUsd} > ${this.policy.dailyBudgetUsd}`);
      action = mergeAction(action, fallbackModel ? 'downgrade' : 'block');
    }

    const isExpensiveModel =
      modelPricePer1kUsd > this.policy.expensiveModelPriceThresholdUsdPer1k &&
      !this.policy.expensiveModelAllowlist.includes(model);

    if (isExpensiveModel) {
      reasons.push(`expensive model requires allowlist: ${model}`);
      action = mergeAction(action, fallbackModel ? 'downgrade' : 'block');
    }

    return {
      allowed: action !== 'block',
      action,
      reasons,
      fallbackModel: action === 'downgrade' ? fallbackModel : null,
      freeFallbackModel: action === 'free_fallback' ? freeFallbackModel : null,
      projectedSpendUsd,
      projectedHourlyTokens,
      availableUsd,
      estimatedCallsRemaining: modelPricePer1kUsd > 0 ? Math.floor(availableUsd / (modelPricePer1kUsd * requestedTokens / 1000)) : Infinity,
    };
  }

  evaluateAutoRefuel(input = {}) {
    const requestedAmountUsd = Number(input.requestedAmountUsd ?? 0);
    const refuelsToday = Number(input.refuelsToday ?? 0);
    const autoPurchasedUsdToday = Number(input.autoPurchasedUsdToday ?? 0);
    const reasons = [];

    if (!this.policy.autoPurchaseEnabled) {
      return {
        allowed: false,
        approvedAmountUsd: 0,
        reasons: ['auto purchase disabled'],
        remainingAutoPurchaseUsd: 0,
      };
    }

    if (refuelsToday >= this.policy.maxAutoRefuelsPerDay) {
      return {
        allowed: false,
        approvedAmountUsd: 0,
        reasons: ['daily auto refuel count exhausted'],
        remainingAutoPurchaseUsd: round(Math.max(0, this.policy.maxAutoPurchasedUsdPerDay - autoPurchasedUsdToday)),
      };
    }

    let approvedAmountUsd = requestedAmountUsd;

    if (this.policy.maxRefuelAmountUsd > 0 && approvedAmountUsd > this.policy.maxRefuelAmountUsd) {
      approvedAmountUsd = this.policy.maxRefuelAmountUsd;
      reasons.push('single refuel amount clipped to policy maximum');
    }

    if (this.policy.maxAutoPurchasedUsdPerDay > 0) {
      const remainingAutoPurchaseUsd = Math.max(0, this.policy.maxAutoPurchasedUsdPerDay - autoPurchasedUsdToday);
      if (remainingAutoPurchaseUsd <= 0) {
        return {
          allowed: false,
          approvedAmountUsd: 0,
          reasons: ['daily auto purchase budget exhausted'],
          remainingAutoPurchaseUsd: 0,
        };
      }

      if (approvedAmountUsd > remainingAutoPurchaseUsd) {
        approvedAmountUsd = remainingAutoPurchaseUsd;
        reasons.push('refuel amount clipped to remaining daily auto purchase budget');
      }
    }

    approvedAmountUsd = round(Math.max(0, approvedAmountUsd));

    return {
      allowed: approvedAmountUsd > 0,
      approvedAmountUsd,
      reasons,
      remainingAutoPurchaseUsd: round(
        Math.max(0, this.policy.maxAutoPurchasedUsdPerDay - autoPurchasedUsdToday - approvedAmountUsd),
      ),
    };
  }

  snapshot() {
    return { ...this.policy, expensiveModelAllowlist: [...this.policy.expensiveModelAllowlist] };
  }
}

module.exports = {
  BudgetGuard,
  DEFAULT_POLICY,
};
