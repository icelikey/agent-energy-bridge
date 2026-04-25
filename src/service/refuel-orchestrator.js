const { CompatibilityGuard } = require('../core/compatibility-guard');

class RefuelOrchestrator {
  constructor(options = {}) {
    this.adapter = options.adapter;
    this.budgetGuard = options.budgetGuard;
    this.modelSelector = options.modelSelector;
    this.compatibilityGuard = options.compatibilityGuard ?? new CompatibilityGuard();
    this.lowBalanceThresholdUsd = Number(options.lowBalanceThresholdUsd ?? 5);
    this.defaultIssuePlan = options.defaultIssuePlan ?? 'starter';
    this.defaultDocsTemplate = options.defaultDocsTemplate ?? 'quickstart';

    if (!this.adapter || !this.budgetGuard || !this.modelSelector) {
      throw new Error('adapter, budgetGuard and modelSelector are required');
    }
  }

  async prepareSession(context = {}) {
    const identity = context.identity ?? {};
    const usage = context.usage ?? (await this.adapter.getUsage(identity));
    const balance = context.balance ?? (await this.adapter.getBalance(identity));
    const recommendation =
      context.recommendation ??
      this.modelSelector.recommend({
        taskType: context.taskType,
        requiredCapabilities: context.requiredCapabilities,
        budgetTier: context.budgetTier,
        protocol: context.protocol,
        needsUniversalProtocol: context.needsUniversalProtocol,
        qualityPriority: context.qualityPriority,
        tasks: context.tasks,
        taskWeights: context.taskWeights,
      });
    const routingPlan = this.compatibilityGuard.planRoute(context, recommendation);
    const selectedModel = context.preferredModel ?? recommendation.primary?.id ?? null;
    const selectedModelMeta =
      recommendation.candidates.find((candidate) => candidate.id === selectedModel) ?? recommendation.primary ?? {};
    const guardDecision = this.budgetGuard.evaluateUsage({
      model: selectedModel,
      estimatedCostUsd: context.estimatedCostUsd ?? 0,
      requestedTokens: context.requestedTokens ?? 0,
      dailySpentUsd: usage.dailySpentUsd ?? 0,
      hourlyTokensUsed: usage.hourlyTokensUsed ?? 0,
      modelPricePer1kUsd: selectedModelMeta.pricePer1kUsd ?? 0,
      fallbackModel: recommendation.fallback?.id ?? this.budgetGuard.snapshot().fallbackModel,
    });

    const refuel = await this.handleLowBalance({
      context,
      identity,
      usage,
      balance,
      routingPlan,
    });

    return {
      status: guardDecision.allowed ? 'ready' : 'blocked',
      selectedModel,
      recommendation,
      routingPlan,
      guardDecision,
      usage,
      balance,
      refuel,
    };
  }

  async handleLowBalance({ context, identity, usage, balance, routingPlan }) {
    const availableUsd = Number(balance.availableUsd ?? balance.balanceUsd ?? 0);
    const threshold = Number(context.lowBalanceThresholdUsd ?? this.lowBalanceThresholdUsd);

    if (availableUsd > threshold) {
      return {
        performed: false,
        action: 'none',
        reasons: [],
      };
    }

    if (context.activationCode) {
      const result = await this.adapter.redeemCode({
        code: context.activationCode,
        identity,
      });

      return {
        performed: true,
        action: 'redeem_code',
        result,
        reasons: [],
      };
    }

    const autoRefuelDecision = this.budgetGuard.evaluateAutoRefuel({
      requestedAmountUsd: context.autoRefuelAmountUsd ?? threshold,
      refuelsToday: usage.autoRefuelsToday ?? 0,
      autoPurchasedUsdToday: usage.autoPurchasedUsdToday ?? 0,
    });
    const keyPlan = this.compatibilityGuard.planKey(context, identity);

    if (autoRefuelDecision.allowed && context.issueKeyOnLowBalance !== false && keyPlan.shouldIssueKey) {
      const result = await this.adapter.issueKey({
        owner: keyPlan.owner,
        group: context.group ?? routingPlan?.activeRoute ?? 'general',
        plan: context.plan ?? this.defaultIssuePlan,
        metadata: {
          reason: 'low_balance_refuel',
          approvedAmountUsd: autoRefuelDecision.approvedAmountUsd,
          routeName: routingPlan?.activeRoute ?? context.routeName ?? 'all-protocol-router',
          shadowRecommendation: routingPlan?.shadowRecommendation ?? null,
        },
      });

      return {
        performed: true,
        action: 'issue_key',
        result,
        approvedAmountUsd: autoRefuelDecision.approvedAmountUsd,
        reasons: autoRefuelDecision.reasons,
      };
    }

    return {
      performed: false,
      action: keyPlan.action === 'reuse_existing_key' ? 'reuse_existing_key' : 'none',
      approvedAmountUsd: autoRefuelDecision.approvedAmountUsd,
      reasons: [...autoRefuelDecision.reasons, ...keyPlan.reasons],
      existingKey: keyPlan.existingKey,
    };
  }

  async provisionAccess(context = {}) {
    const keyPlan = this.compatibilityGuard.planKey(context, context.identity ?? {});
    const routingPlan = this.compatibilityGuard.planRoute(context, context.recommendation ?? {});
    const issuedKey =
      context.issuedKey ??
      (keyPlan.shouldIssueKey
        ? await this.adapter.issueKey({
            owner: keyPlan.owner,
            group: context.group ?? routingPlan.activeRoute ?? 'general',
            plan: context.plan ?? this.defaultIssuePlan,
            metadata: {
              ...(context.metadata ?? {}),
              routeName: routingPlan.activeRoute ?? null,
              shadowRecommendation: routingPlan.shadowRecommendation ?? null,
            },
          })
        : keyPlan.existingKey);

    if (context.skipDocs) {
      return { issuedKey, docs: null, routingPlan };
    }

    const docs = await this.adapter.renderDocs({
      template: context.docsTemplate ?? this.defaultDocsTemplate,
      data: {
        baseUrl: context.baseUrl ?? '',
        apiKey: issuedKey?.apiKey ?? issuedKey?.key ?? issuedKey ?? '',
        routeName: routingPlan.activeRoute ?? context.routeName ?? '全能渠道',
        shadowRecommendation: routingPlan.shadowRecommendation ?? null,
        allowedModels: context.allowedModels ?? [],
      },
    });

    return { issuedKey, docs, routingPlan };
  }
}

module.exports = {
  RefuelOrchestrator,
};
