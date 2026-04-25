const TASK_MULTIPLIERS = Object.freeze({
  coding: 1.12,
  reasoning: 1.1,
  research: 1.08,
  automation: 1.06,
  routing: 1.02,
  chat: 0.98,
  support: 1,
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

class EnergyEngine {
  scoreSession(session = {}) {
    const inputTokens = Number(session.inputTokens ?? 0);
    const outputTokens = Number(session.outputTokens ?? 0);
    const totalTokens = Number(session.totalTokens ?? inputTokens + outputTokens);
    const qualityScore = clamp(Number(session.qualityScore ?? 0.65), 0, 1);
    const successScore = clamp(Number(session.success ?? session.successRate ?? 1), 0, 1);
    const latencyMs = Number(session.latencyMs ?? 1500);
    const costUsd = Number(session.costUsd ?? 0);
    const tokenBudget = Number(session.tokenBudget ?? 250000);
    const costBudgetUsd = Number(session.costBudgetUsd ?? 25);
    const taskMultiplier = TASK_MULTIPLIERS[session.taskType] ?? 1;
    const firstPassBoost = session.firstPassSuccess === false ? 0.92 : 1.08;

    const latencyScore = clamp(1 - (latencyMs - 250) / 32000, 0.25, 1);
    const tokenScore = clamp(1 - totalTokens / tokenBudget, 0.2, 1);
    const costScore = clamp(1 - costUsd / costBudgetUsd, 0.1, 1);

    const baseScore =
      qualityScore * 0.34 +
      successScore * 0.24 +
      latencyScore * 0.12 +
      tokenScore * 0.15 +
      costScore * 0.15;

    const energyScore = clamp(baseScore * firstPassBoost * taskMultiplier * 100, 1, 100);

    return {
      taskType: session.taskType ?? 'chat',
      model: session.model ?? 'unknown-model',
      totalTokens,
      costUsd: round(costUsd),
      qualityScore: round(qualityScore),
      successScore: round(successScore),
      latencyScore: round(latencyScore),
      energyScore: round(energyScore),
    };
  }

  summarizeSession(sessions = []) {
    const scored = sessions.map((session) =>
      typeof session.energyScore === 'number' ? session : this.scoreSession(session),
    );

    if (!scored.length) {
      return {
        sessions: 0,
        totalTokens: 0,
        totalCostUsd: 0,
        avgEnergyScore: 0,
        trend: 'flat',
        suggestions: ['collect more sessions before making routing changes'],
      };
    }

    const totalTokens = scored.reduce((sum, item) => sum + Number(item.totalTokens ?? 0), 0);
    const totalCostUsd = round(scored.reduce((sum, item) => sum + Number(item.costUsd ?? 0), 0));
    const avgEnergyScore = round(average(scored.map((item) => Number(item.energyScore ?? 0))));
    const avgSuccessScore = round(average(scored.map((item) => Number(item.successScore ?? 0))));
    const splitIndex = Math.max(1, Math.floor(scored.length / 2));
    const firstHalf = scored.slice(0, splitIndex);
    const secondHalf = scored.slice(splitIndex);
    const leadingAverage = average(firstHalf.map((item) => Number(item.energyScore ?? 0)));
    const trailingAverage = average((secondHalf.length ? secondHalf : firstHalf).map((item) => Number(item.energyScore ?? 0)));
    const delta = trailingAverage - leadingAverage;
    const trend = delta > 5 ? 'up' : delta < -5 ? 'down' : 'flat';
    const suggestions = [];

    if (trend === 'down') {
      suggestions.push('energy efficiency is trending down; tighten routing and budget policies');
    }

    if (avgEnergyScore < 65) {
      suggestions.push('prefer mixed or all-protocol routing for low-risk tasks to improve token value');
    }

    if (avgSuccessScore < 0.85) {
      suggestions.push('raise model quality tier for failure-prone workflows');
    }

    if (!suggestions.length) {
      suggestions.push('current routing looks healthy; keep monitoring daily usage and failures');
    }

    return {
      sessions: scored.length,
      totalTokens,
      totalCostUsd,
      avgEnergyScore,
      avgSuccessScore,
      trend,
      suggestions,
    };
  }
}

module.exports = {
  EnergyEngine,
  TASK_MULTIPLIERS,
};
