const { CompatibilityGuard } = require('../core/compatibility-guard');
const { EnergyEngine } = require('../core/energy-engine');
const { SessionStore } = require('../core/session-store');

class RefuelOrchestrator {
  constructor(options = {}) {
    this.adapter = options.adapter;
    this.budgetGuard = options.budgetGuard;
    this.modelSelector = options.modelSelector;
    this.compatibilityGuard = options.compatibilityGuard ?? new CompatibilityGuard();
    this.energyEngine = options.energyEngine ?? null;
    this.sessionStore = options.sessionStore ?? null;
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

    const energyInsights = this.buildEnergyInsights(context);

    return {
      status: guardDecision.allowed ? 'ready' : 'blocked',
      selectedModel,
      recommendation,
      routingPlan,
      guardDecision,
      usage,
      balance,
      refuel,
      energyInsights,
    };
  }

  buildEnergyInsights(context) {
    if (!this.energyEngine || !this.sessionStore) {
      return null;
    }

    const recent = this.sessionStore.getRecentSessions(50);
    if (!recent.length) {
      return { trend: 'insufficient_data', suggestions: ['collect more sessions before making routing changes'] };
    }

    const summary = this.energyEngine.summarizeSession(recent);
    const taskType = context.taskType;
    const taskSpecific = taskType ? this.sessionStore.getSessionsByTaskType(taskType, 30) : [];
    const taskSummary = taskSpecific.length > 2 ? this.energyEngine.summarizeSession(taskSpecific) : null;

    return {
      overall: summary,
      byTask: taskSummary,
      recommendations: this.mergeEnergyRecommendations(summary, taskSummary, context),
    };
  }

  mergeEnergyRecommendations(overall, byTask, context) {
    const recommendations = [];

    if (overall.trend === 'down') {
      recommendations.push('energy efficiency is trending down; consider tightening routing and budget policies');
    }

    if (overall.avgEnergyScore < 65) {
      recommendations.push('overall energy score is low; prefer economy or balanced routing for low-risk tasks');
    }

    if (byTask && byTask.avgEnergyScore < 60) {
      recommendations.push(`energy score for "${context.taskType}" tasks is low; consider switching models or compressing context`);
    }

    if (overall.avgSuccessScore < 0.85) {
      recommendations.push('success rate is below threshold; raise model quality tier for failure-prone workflows');
    }

    if (!recommendations.length) {
      recommendations.push('energy profile looks healthy; keep monitoring daily usage and failures');
    }

    return recommendations;
  }

  reportSession(session) {
    if (!this.energyEngine) {
      throw new Error('energyEngine is required for session reporting');
    }

    const scored = this.energyEngine.scoreSession(session);

    if (this.sessionStore) {
      this.sessionStore.addSession(scored);
    }

    return scored;
  }

  getSessionSummary(filters = {}) {
    if (!this.energyEngine) {
      throw new Error('energyEngine is required for session summarization');
    }

    let sessions = [];
    if (this.sessionStore) {
      if (filters.taskType) {
        sessions = this.sessionStore.getSessionsByTaskType(filters.taskType, filters.limit ?? 100);
      } else if (filters.model) {
        sessions = this.sessionStore.getSessionsByModel(filters.model, filters.limit ?? 100);
      } else {
        sessions = this.sessionStore.getRecentSessions(filters.limit ?? 100);
      }
    }

    return this.energyEngine.summarizeSession(sessions);
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
