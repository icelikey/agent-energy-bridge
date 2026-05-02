const { ModelCapabilityBenchmark } = require('./model-capability-benchmark');

const MODEL_CATALOG = Object.freeze([
  {
    id: 'all-protocol-router',
    label: '全能渠道',
    provider: 'gateway',
    budgetTier: 'balanced',
    qualityTier: 'adaptive',
    pricePer1kUsd: 0.015,
    protocols: ['openai', 'anthropic', 'google', 'kimi', 'minimax'],
    capabilities: ['routing', 'chat', 'coding', 'reasoning', 'vision', 'multimodal'],
  },
  {
    id: 'claude-4.7-premium',
    label: 'Claude 4.7 Premium',
    provider: 'anthropic',
    budgetTier: 'premium',
    qualityTier: 'premium',
    pricePer1kUsd: 0.06,
    protocols: ['anthropic'],
    capabilities: ['coding', 'reasoning', 'chat', 'agentic'],
  },
  {
    id: 'claude-4.6-mixed',
    label: 'Claude 4.6 Mixed',
    provider: 'anthropic',
    budgetTier: 'economy',
    qualityTier: 'mixed',
    pricePer1kUsd: 0.022,
    protocols: ['anthropic'],
    capabilities: ['coding', 'chat', 'reasoning'],
  },
  {
    id: 'o3-premium',
    label: 'O3 Premium',
    provider: 'openai',
    budgetTier: 'premium',
    qualityTier: 'premium',
    pricePer1kUsd: 0.05,
    protocols: ['openai'],
    capabilities: ['reasoning', 'coding', 'analysis'],
  },
  {
    id: 'gpt-5-codex',
    label: 'GPT-5 Codex',
    provider: 'openai',
    budgetTier: 'premium',
    qualityTier: 'premium',
    pricePer1kUsd: 0.045,
    protocols: ['openai'],
    capabilities: ['coding', 'agentic', 'reasoning'],
  },
  {
    id: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    provider: 'google',
    budgetTier: 'balanced',
    qualityTier: 'balanced',
    pricePer1kUsd: 0.02,
    protocols: ['google', 'openai'],
    capabilities: ['multimodal', 'reasoning', 'chat'],
  },
  {
    id: 'kimi-k2',
    label: 'Kimi K2',
    provider: 'moonshot',
    budgetTier: 'economy',
    qualityTier: 'balanced',
    pricePer1kUsd: 0.008,
    protocols: ['kimi', 'openai'],
    capabilities: ['chat', 'reasoning', 'search'],
  },
  {
    id: 'minimax-m1',
    label: 'MiniMax M1',
    provider: 'minimax',
    budgetTier: 'economy',
    qualityTier: 'balanced',
    pricePer1kUsd: 0.009,
    protocols: ['minimax', 'openai'],
    capabilities: ['chat', 'reasoning', 'multimodal'],
  },
  // Free-tier models for zero-balance fallback
  {
    id: 'gemini-2.5-flash-free',
    label: 'Gemini 2.5 Flash (Free)',
    provider: 'google',
    budgetTier: 'free',
    qualityTier: 'balanced',
    pricePer1kUsd: 0,
    isFree: true,
    protocols: ['google', 'openai'],
    capabilities: ['chat', 'reasoning', 'coding', 'vision'],
    freeLimit: '1,500 RPM, 1M tokens/min',
  },
  {
    id: 'openrouter-free',
    label: 'OpenRouter Free Tier',
    provider: 'openrouter',
    budgetTier: 'free',
    qualityTier: 'economy',
    pricePer1kUsd: 0,
    isFree: true,
    protocols: ['openai'],
    capabilities: ['chat', 'reasoning'],
    freeLimit: '20 RPM, 200 RPD',
  },
  {
    id: 'groq-llama-free',
    label: 'Groq Llama 3 (Free)',
    provider: 'groq',
    budgetTier: 'free',
    qualityTier: 'balanced',
    pricePer1kUsd: 0,
    isFree: true,
    protocols: ['openai'],
    capabilities: ['chat', 'coding', 'reasoning'],
    freeLimit: '20 RPM, 6M tokens/min',
  },
  {
    id: 'local-ollama',
    label: 'Local Ollama',
    provider: 'local',
    budgetTier: 'free',
    qualityTier: 'economy',
    pricePer1kUsd: 0,
    isFree: true,
    protocols: ['openai'],
    capabilities: ['chat', 'coding'],
    freeLimit: 'unlimited (local compute)',
  },
]);

const BUDGET_RANK = Object.freeze({
  free: 0,
  economy: 1,
  balanced: 2,
  premium: 3,
});

function round(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

function normalizeBudgetTier(value) {
  const map = {
    free: 'free',
    low: 'economy',
    economy: 'economy',
    mixed: 'economy',
    medium: 'balanced',
    balanced: 'balanced',
    adaptive: 'balanced',
    high: 'premium',
    premium: 'premium',
  };

  return map[value] || 'balanced';
}

class ModelSelector {
  constructor(catalog = MODEL_CATALOG, options = {}) {
    if (!Array.isArray(catalog)) {
      options = catalog || {};
      catalog = options.catalog || MODEL_CATALOG;
    }

    this.catalog = [...catalog];
    this.capabilityBenchmark = options.capabilityBenchmark || new ModelCapabilityBenchmark();
  }

  listCatalog(filters = {}) {
    return this.catalog.filter((model) => {
      if (filters.protocol && !model.protocols.includes(filters.protocol)) {
        return false;
      }

      if (filters.budgetTier && normalizeBudgetTier(filters.budgetTier) !== model.budgetTier) {
        return false;
      }

      return true;
    });
  }

  recommend(input = {}) {
    const budgetTier = normalizeBudgetTier(input.budgetTier);
    const requiredCapabilities = [...new Set([input.taskType, ...(input.requiredCapabilities || [])].filter(Boolean))];
    const protocol = input.protocol ?? null;
    const needsUniversalProtocol = Boolean(input.needsUniversalProtocol);
    const preferFree = Boolean(input.preferFree) || budgetTier === 'free';

    const ranked = this.catalog
      .filter((model) => !protocol || model.protocols.includes(protocol) || model.id === 'all-protocol-router')
      .map((model) => {
        const capabilityAssessment = this.capabilityBenchmark.evaluateModel(model, {
          taskType: input.taskType,
          tasks: input.tasks,
          taskWeights: input.taskWeights,
          requiredCapabilities,
          protocol,
          budgetTier,
          qualityPriority: input.qualityPriority,
          latencySensitive: input.latencySensitive,
          needsUniversalProtocol,
        });
        const baseScore = this.scoreCandidate(model, {
          budgetTier,
          requiredCapabilities,
          protocol,
          needsUniversalProtocol,
          qualityPriority: input.qualityPriority,
          preferFree,
        });
        const score = round(baseScore * 0.42 + capabilityAssessment.weightedScore / 100 * 0.58);

        return {
          ...model,
          baseScore,
          score,
          capabilityAssessment,
        };
      })
      .sort((left, right) => right.score - left.score);

    const primary = ranked[0] || null;

    // Fallback selection logic
    let fallback = null;
    if (primary) {
      // When in free mode, fallback is any other free model with different capabilities
      if (preferFree || budgetTier === 'free') {
        fallback = ranked.find(
          (model) => model.id !== primary.id && model.isFree,
        ) || null;
      } else {
        // Normal fallback: cheaper or economy tier
        fallback = ranked.find(
          (model) =>
            model.id !== primary.id &&
            (model.budgetTier === 'economy' || model.pricePer1kUsd < primary.pricePer1kUsd),
        ) || null;
      }
    }

    return {
      primary,
      fallback,
      candidates: ranked.slice(0, 5),
      explain: primary
        ? `Selected ${primary.id} with benchmark score ${primary.capabilityAssessment.weightedScore} for ${budgetTier} budget and ${requiredCapabilities.join(', ') || 'general'} tasks.`
        : 'No candidate models matched the requested filters.',
    };
  }

  recommendWorkflow(tasks = [], sharedInput = {}) {
    const steps = tasks.map((task, index) => ({
      taskId: task.taskId || `task-${index + 1}`,
      taskType: task.taskType || task.type || 'chat',
      recommendation: this.recommend({
        ...sharedInput,
        ...task,
        requiredCapabilities: [...new Set([...(sharedInput.requiredCapabilities || []), ...(task.requiredCapabilities || [])])],
      }),
    }));

    const protocols = new Set(tasks.map((task) => task.protocol).filter(Boolean));
    const sharedRoute =
      sharedInput.needsUniversalProtocol || protocols.size > 1
        ? this.catalog.find((model) => model.id === 'all-protocol-router') || null
        : null;

    return {
      sharedRoute,
      steps,
      explain: sharedRoute
        ? `Workflow spans ${protocols.size || 1} protocol styles, so all-protocol-router is recommended as the shared entry.`
        : 'Workflow can run without a universal entry route.',
    };
  }

  scoreCandidate(model, input) {
    const requiredCapabilities = input.requiredCapabilities || [];
    const preferFree = Boolean(input.preferFree);
    const budgetDistance = Math.abs(BUDGET_RANK[model.budgetTier] - BUDGET_RANK[input.budgetTier]);
    const matchedCapabilities = requiredCapabilities.filter((capability) => model.capabilities.includes(capability)).length;
    const capabilityScore = requiredCapabilities.length ? matchedCapabilities / requiredCapabilities.length : 0.7;
    const budgetScore = 1 - budgetDistance * 0.25;
    const protocolScore = !input.protocol || model.protocols.includes(input.protocol) ? 1 : model.id === 'all-protocol-router' ? 0.94 : 0.2;
    const universalScore = input.needsUniversalProtocol && model.id === 'all-protocol-router' ? 1 : input.needsUniversalProtocol ? 0.55 : 0.65;
    const qualityScore = this.scoreQualityFit(model, input.qualityPriority);

    // Price scoring: free models get max score when preferFree is set
    let priceScore;
    if (model.isFree) {
      priceScore = preferFree ? 1.5 : 1; // Boost free models when in free mode
    } else {
      priceScore = model.pricePer1kUsd <= 0.01 ? 1 : model.pricePer1kUsd <= 0.02 ? 0.82 : model.pricePer1kUsd <= 0.04 ? 0.52 : 0.28;
    }

    // When preferFree, heavily penalize non-free models
    const freePenalty = preferFree && !model.isFree ? 0.3 : 1;

    return round(
      (capabilityScore * 0.32 +
        budgetScore * 0.16 +
        protocolScore * 0.14 +
        universalScore * 0.08 +
        qualityScore * 0.18 +
        priceScore * 0.12) *
        freePenalty,
    );
  }

  scoreQualityFit(model, qualityPriority) {
    if (qualityPriority === 'high' || qualityPriority === 'premium') {
      return model.qualityTier === 'premium' ? 1 : model.qualityTier === 'balanced' ? 0.82 : 0.74;
    }

    if (qualityPriority === 'low' || qualityPriority === 'economy') {
      return model.budgetTier === 'economy' ? 1 : model.budgetTier === 'balanced' ? 0.8 : 0.55;
    }

    return model.qualityTier === 'balanced' ? 1 : model.qualityTier === 'adaptive' ? 0.95 : model.qualityTier === 'premium' ? 0.9 : 0.82;
  }
}

module.exports = {
  ModelSelector,
  MODEL_CATALOG,
  normalizeBudgetTier,
};
