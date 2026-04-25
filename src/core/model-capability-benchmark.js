const DEFAULT_MODEL_BENCHMARKS = Object.freeze({
  'all-protocol-router': Object.freeze({
    routing: 0.98,
    chat: 0.86,
    coding: 0.84,
    reasoning: 0.87,
    analysis: 0.85,
    multimodal: 0.83,
    search: 0.8,
    toolUse: 0.86,
    agentic: 0.88,
    speed: 0.82,
    stability: 0.9,
    costEfficiency: 0.88,
    longContext: 0.85,
  }),
  'claude-4.7-premium': Object.freeze({
    chat: 0.9,
    coding: 0.96,
    reasoning: 0.95,
    analysis: 0.93,
    multimodal: 0.72,
    search: 0.46,
    toolUse: 0.92,
    agentic: 0.93,
    speed: 0.72,
    stability: 0.88,
    costEfficiency: 0.55,
    longContext: 0.94,
  }),
  'claude-4.6-mixed': Object.freeze({
    chat: 0.86,
    coding: 0.88,
    reasoning: 0.84,
    analysis: 0.82,
    multimodal: 0.65,
    search: 0.42,
    toolUse: 0.82,
    agentic: 0.81,
    speed: 0.82,
    stability: 0.82,
    costEfficiency: 0.78,
    longContext: 0.86,
  }),
  'o3-premium': Object.freeze({
    chat: 0.8,
    coding: 0.92,
    reasoning: 0.97,
    analysis: 0.96,
    multimodal: 0.58,
    search: 0.42,
    toolUse: 0.85,
    agentic: 0.84,
    speed: 0.68,
    stability: 0.86,
    costEfficiency: 0.5,
    longContext: 0.92,
  }),
  'gpt-5-codex': Object.freeze({
    chat: 0.76,
    coding: 0.98,
    reasoning: 0.92,
    analysis: 0.9,
    multimodal: 0.6,
    search: 0.36,
    toolUse: 0.96,
    agentic: 0.95,
    speed: 0.78,
    stability: 0.89,
    costEfficiency: 0.58,
    longContext: 0.9,
  }),
  'gemini-2.5-pro': Object.freeze({
    chat: 0.87,
    coding: 0.78,
    reasoning: 0.88,
    analysis: 0.86,
    multimodal: 0.96,
    search: 0.74,
    toolUse: 0.8,
    agentic: 0.78,
    speed: 0.83,
    stability: 0.84,
    costEfficiency: 0.8,
    longContext: 0.9,
  }),
  'kimi-k2': Object.freeze({
    chat: 0.89,
    coding: 0.72,
    reasoning: 0.82,
    analysis: 0.78,
    multimodal: 0.58,
    search: 0.9,
    toolUse: 0.68,
    agentic: 0.66,
    speed: 0.91,
    stability: 0.8,
    costEfficiency: 0.94,
    longContext: 0.86,
  }),
  'minimax-m1': Object.freeze({
    chat: 0.86,
    coding: 0.69,
    reasoning: 0.8,
    analysis: 0.78,
    multimodal: 0.83,
    search: 0.62,
    toolUse: 0.72,
    agentic: 0.7,
    speed: 0.9,
    stability: 0.81,
    costEfficiency: 0.93,
    longContext: 0.84,
  }),
});

const TASK_PROFILES = Object.freeze({
  routing: Object.freeze({ routing: 0.45, stability: 0.2, speed: 0.2, costEfficiency: 0.15 }),
  chat: Object.freeze({ chat: 0.42, speed: 0.22, costEfficiency: 0.2, stability: 0.16 }),
  coding: Object.freeze({ coding: 0.38, reasoning: 0.18, toolUse: 0.2, agentic: 0.12, stability: 0.12 }),
  reasoning: Object.freeze({ reasoning: 0.42, analysis: 0.16, longContext: 0.2, stability: 0.12, speed: 0.1 }),
  analysis: Object.freeze({ analysis: 0.3, reasoning: 0.26, longContext: 0.2, stability: 0.12, costEfficiency: 0.12 }),
  research: Object.freeze({ search: 0.32, reasoning: 0.22, longContext: 0.2, speed: 0.12, costEfficiency: 0.14 }),
  multimodal: Object.freeze({ multimodal: 0.46, reasoning: 0.18, longContext: 0.12, speed: 0.12, stability: 0.12 }),
  automation: Object.freeze({ toolUse: 0.34, stability: 0.22, coding: 0.16, speed: 0.14, costEfficiency: 0.14 }),
  search: Object.freeze({ search: 0.46, reasoning: 0.18, speed: 0.14, costEfficiency: 0.1, longContext: 0.12 }),
  agentic: Object.freeze({ agentic: 0.32, toolUse: 0.22, coding: 0.16, reasoning: 0.14, stability: 0.16 }),
});

const BUDGET_RANK = Object.freeze({
  economy: 1,
  balanced: 2,
  premium: 3,
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

function average(values) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeBudgetTier(value) {
  const map = {
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

function normalizeCapabilityName(name) {
  const map = {
    vision: 'multimodal',
    tools: 'toolUse',
    tool_use: 'toolUse',
    tooluse: 'toolUse',
    long_context: 'longContext',
    longcontext: 'longContext',
    planning: 'agentic',
  };

  return map[name] || name;
}

function mergeTaskWeights(taskWeights = {}) {
  const normalized = {};

  Object.entries(taskWeights).forEach(([taskType, weight]) => {
    const safeWeight = Number(weight ?? 0);
    if (!taskType || safeWeight <= 0) {
      return;
    }

    normalized[taskType] = (normalized[taskType] || 0) + safeWeight;
  });

  if (!Object.keys(normalized).length) {
    normalized.chat = 1;
  }

  return normalized;
}

function buildFallbackProfile(model = {}) {
  const capabilities = new Set(model.capabilities || []);
  const pricePer1kUsd = Number(model.pricePer1kUsd ?? 0.02);
  const inferredCostEfficiency = clamp(1 - pricePer1kUsd / 0.08, 0.3, 0.94);
  const base = {
    chat: capabilities.has('chat') ? 0.78 : 0.58,
    coding: capabilities.has('coding') ? 0.8 : 0.54,
    reasoning: capabilities.has('reasoning') ? 0.8 : 0.58,
    analysis: capabilities.has('analysis') ? 0.78 : 0.56,
    multimodal: capabilities.has('multimodal') || capabilities.has('vision') ? 0.8 : 0.48,
    search: capabilities.has('search') ? 0.8 : 0.44,
    toolUse: capabilities.has('agentic') ? 0.8 : 0.58,
    agentic: capabilities.has('agentic') ? 0.82 : 0.56,
    routing: capabilities.has('routing') ? 0.88 : 0.55,
    speed: 0.78,
    stability: 0.8,
    costEfficiency: inferredCostEfficiency,
    longContext: 0.78,
  };

  return base;
}

class ModelCapabilityBenchmark {
  constructor(benchmarkMap = DEFAULT_MODEL_BENCHMARKS) {
    this.benchmarkMap = Object.fromEntries(
      Object.entries(benchmarkMap).map(([modelId, profile]) => [modelId, { ...profile }]),
    );
  }

  getProfile(model) {
    const modelObject = typeof model === 'string' ? { id: model } : model || {};
    const seededProfile = this.benchmarkMap[modelObject.id] || {};
    return {
      ...buildFallbackProfile(modelObject),
      ...seededProfile,
    };
  }

  normalizeTaskWeights(workload = {}) {
    if (Array.isArray(workload.tasks) && workload.tasks.length) {
      return mergeTaskWeights(
        workload.tasks.reduce((accumulator, task) => {
          const taskType = task.taskType || task.type || 'chat';
          accumulator[taskType] = (accumulator[taskType] || 0) + Number(task.weight ?? 1);
          return accumulator;
        }, {}),
      );
    }

    if (workload.taskWeights && typeof workload.taskWeights === 'object') {
      return mergeTaskWeights(workload.taskWeights);
    }

    return mergeTaskWeights({ [workload.taskType || 'chat']: 1 });
  }

  scoreTaskFit(profile, taskWeights) {
    const weightedScores = [];

    Object.entries(taskWeights).forEach(([taskType, weight]) => {
      const dimensions = TASK_PROFILES[taskType] || TASK_PROFILES.chat;
      const taskScore = Object.entries(dimensions).reduce((sum, [dimension, dimensionWeight]) => {
        return sum + Number(profile[dimension] ?? 0.55) * dimensionWeight;
      }, 0);

      weightedScores.push(taskScore * weight);
    });

    const totalWeight = Object.values(taskWeights).reduce((sum, value) => sum + Number(value || 0), 0) || 1;
    return weightedScores.reduce((sum, value) => sum + value, 0) / totalWeight;
  }

  scoreCapabilityCoverage(model, profile, requiredCapabilities = []) {
    if (!requiredCapabilities.length) {
      return average([profile.chat, profile.reasoning, profile.stability].filter((value) => typeof value === 'number'));
    }

    return average(
      requiredCapabilities.map((capability) => {
        const normalizedCapability = normalizeCapabilityName(capability);
        if (typeof profile[normalizedCapability] === 'number') {
          return profile[normalizedCapability];
        }

        if ((model.capabilities || []).includes(capability) || (model.capabilities || []).includes(normalizedCapability)) {
          return 0.82;
        }

        return 0.35;
      }),
    );
  }

  scoreProtocolFit(model, protocol) {
    if (!protocol) {
      return 0.8;
    }

    if ((model.protocols || []).includes(protocol)) {
      return 1;
    }

    if (model.id === 'all-protocol-router') {
      return 0.94;
    }

    return 0.3;
  }

  scoreBudgetFit(model, budgetTier) {
    const normalizedBudget = normalizeBudgetTier(budgetTier);
    const modelRank = BUDGET_RANK[model.budgetTier] || BUDGET_RANK.balanced;
    const expectedRank = BUDGET_RANK[normalizedBudget] || BUDGET_RANK.balanced;
    const distance = Math.abs(modelRank - expectedRank);
    return clamp(1 - distance * 0.28, 0.32, 1);
  }

  scoreQualityComposite(profile) {
    return average(
      [profile.coding, profile.reasoning, profile.analysis, profile.agentic, profile.multimodal].filter(
        (value) => typeof value === 'number',
      ),
    );
  }

  evaluateModel(model, workload = {}) {
    const profile = this.getProfile(model);
    const taskWeights = this.normalizeTaskWeights(workload);
    const requiredCapabilities = [...new Set((workload.requiredCapabilities || []).map(normalizeCapabilityName))];
    const taskFitScore = this.scoreTaskFit(profile, taskWeights);
    const capabilityCoverage = this.scoreCapabilityCoverage(model, profile, requiredCapabilities);
    const protocolFit = this.scoreProtocolFit(model, workload.protocol);
    const budgetFit = this.scoreBudgetFit(model, workload.budgetTier);
    const costEfficiency = clamp(Number(profile.costEfficiency ?? 0.65), 0, 1);
    const speed = clamp(Number(profile.speed ?? 0.72), 0, 1);
    const stability = clamp(Number(profile.stability ?? 0.78), 0, 1);
    const qualityComposite = this.scoreQualityComposite(profile);
    const priority = workload.qualityPriority ?? workload.priority ?? 'balanced';
    const latencySensitive = Boolean(workload.latencySensitive);

    const weightedInputs = [
      [taskFitScore, 0.36],
      [capabilityCoverage, 0.18],
      [stability, 0.12],
      [budgetFit, 0.1],
      [protocolFit, 0.08],
      [costEfficiency, 0.08],
      [speed, 0.08],
    ];

    if (priority === 'high' || priority === 'premium') {
      weightedInputs.push([qualityComposite, 0.12]);
    } else if (priority === 'low' || priority === 'economy') {
      weightedInputs.push([costEfficiency, 0.12]);
    } else {
      weightedInputs.push([qualityComposite, 0.06], [costEfficiency, 0.06]);
    }

    if (latencySensitive) {
      weightedInputs.push([speed, 0.06]);
    }

    const weightTotal = weightedInputs.reduce((sum, [, weight]) => sum + weight, 0);
    const weightedScore =
      weightedInputs.reduce((sum, [value, weight]) => sum + clamp(value, 0, 1) * weight, 0) / weightTotal;

    return {
      modelId: model.id,
      taskWeights,
      taskFitScore: round(taskFitScore * 100),
      capabilityCoverage: round(capabilityCoverage * 100),
      protocolFit: round(protocolFit * 100),
      budgetFit: round(budgetFit * 100),
      speedScore: round(speed * 100),
      stabilityScore: round(stability * 100),
      costEfficiencyScore: round(costEfficiency * 100),
      qualityComposite: round(qualityComposite * 100),
      weightedScore: round(weightedScore * 100),
      dimensionScores: Object.fromEntries(
        Object.entries(profile).map(([dimension, score]) => [dimension, round(Number(score || 0) * 100)]),
      ),
    };
  }

  evaluatePortfolio(models = [], workload = {}) {
    return models
      .map((model) => ({
        model,
        assessment: this.evaluateModel(model, workload),
      }))
      .sort((left, right) => right.assessment.weightedScore - left.assessment.weightedScore);
  }

  recommendWorkflow(models = [], tasks = [], sharedContext = {}) {
    const steps = tasks.map((task, index) => {
      const ranked = this.evaluatePortfolio(models, {
        ...sharedContext,
        ...task,
      });

      return {
        taskId: task.taskId || `task-${index + 1}`,
        taskType: task.taskType || task.type || 'chat',
        ranked,
        primary: ranked[0]?.model || null,
        fallback: ranked[1]?.model || null,
      };
    });

    const protocols = new Set(tasks.map((task) => task.protocol).filter(Boolean));
    const sharedRoute =
      sharedContext.needsUniversalProtocol || protocols.size > 1
        ? models.find((model) => model.id === 'all-protocol-router') || null
        : null;

    return {
      sharedRoute,
      steps,
      explain: sharedRoute
        ? `Shared route ${sharedRoute.id} is recommended because the workflow spans multiple protocols or entry styles.`
        : 'No shared universal route is required for this workflow.',
    };
  }
}

module.exports = {
  ModelCapabilityBenchmark,
  DEFAULT_MODEL_BENCHMARKS,
  TASK_PROFILES,
};
