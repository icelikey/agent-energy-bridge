/**
 * TokenMeter — fine-grained token usage tracking.
 *
 * Tracks token consumption by model, agentId, and taskType.
 * Supports real-time accumulation and windowed history queries (7/30/90 days).
 * Zero external dependencies — pure in-memory with optional persistence hook.
 */

const WINDOW_DAYS = Object.freeze([7, 30, 90]);

function clampWindowDays(raw, defaultDays = 30) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return defaultDays;
  return Math.min(Math.floor(n), 3650);
}

class TokenMeter {
  constructor(options = {}) {
    const rawMax = Number(options.maxEntries ?? 100_000);
    this.maxEntries = Number.isFinite(rawMax) && rawMax >= 1 ? Math.floor(rawMax) : 100_000;
    this.onFlush = options.onFlush || null;
    this.onFlushError = options.onFlushError || null;

    this._records = [];
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  /**
   * Record a single usage event.
   * @param {Object} usage
   * @param {string} usage.model
   * @param {string} [usage.agentId]
   * @param {string} [usage.taskType]
   * @param {number} usage.inputTokens
   * @param {number} usage.outputTokens
   * @param {number} [usage.costUsd]
   * @param {number} [usage.latencyMs]
   */
  record(usage) {
    const now = Date.now();
    const entry = {
      ts: now,
      model: String(usage.model || 'unknown'),
      agentId: String(usage.agentId || 'default'),
      taskType: String(usage.taskType || 'general'),
      inputTokens: Math.max(0, Math.floor(Number(usage.inputTokens) || 0)),
      outputTokens: Math.max(0, Math.floor(Number(usage.outputTokens) || 0)),
      costUsd: Math.max(0, Number(usage.costUsd) || 0),
      latencyMs: Math.max(0, Number(usage.latencyMs) || 0),
    };
    entry.totalTokens = entry.inputTokens + entry.outputTokens;

    this._records.push(entry);

    // Evict oldest when over limit (CONC-03 memory bound)
    if (this._records.length > this.maxEntries) {
      this._records = this._records.slice(-this.maxEntries);
    }

    // MD-02: onFlush errors must not propagate — record is already written
    if (typeof this.onFlush === 'function') {
      try {
        this.onFlush(entry);
      } catch (flushError) {
        if (typeof this.onFlushError === 'function') {
          this.onFlushError(flushError, entry);
        }
      }
    }

    return entry;
  }

  /**
   * Get aggregated totals for a given time window.
   * @param {Object} [filters]
   * @param {number} [filters.windowDays] - any positive integer, default 30
   * @param {string} [filters.model]
   * @param {string} [filters.agentId]
   * @param {string} [filters.taskType]
   */
  getStats(filters = {}) {
    // MD-01: guard windowDays at the library level
    const windowDays = clampWindowDays(filters.windowDays, 30);
    const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;

    let records = this._records.filter((r) => r.ts >= cutoff);

    if (filters.model) records = records.filter((r) => r.model === filters.model);
    if (filters.agentId) records = records.filter((r) => r.agentId === filters.agentId);
    if (filters.taskType) records = records.filter((r) => r.taskType === filters.taskType);

    return this._aggregate(records, windowDays);
  }

  /**
   * Get per-model breakdown for a time window.
   */
  getModelBreakdown(windowDays = 30) {
    const days = clampWindowDays(windowDays, 30);
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const records = this._records.filter((r) => r.ts >= cutoff);

    const byModel = new Map();
    for (const r of records) {
      if (!byModel.has(r.model)) byModel.set(r.model, []);
      byModel.get(r.model).push(r);
    }

    const result = [];
    for (const [model, recs] of byModel) {
      result.push({ model, ...this._aggregate(recs, days) });
    }
    return result.sort((a, b) => b.totalTokens - a.totalTokens);
  }

  /**
   * Get per-agent breakdown for a time window.
   */
  getAgentBreakdown(windowDays = 30) {
    const days = clampWindowDays(windowDays, 30);
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const records = this._records.filter((r) => r.ts >= cutoff);

    const byAgent = new Map();
    for (const r of records) {
      if (!byAgent.has(r.agentId)) byAgent.set(r.agentId, []);
      byAgent.get(r.agentId).push(r);
    }

    const result = [];
    for (const [agentId, recs] of byAgent) {
      result.push({ agentId, ...this._aggregate(recs, days) });
    }
    return result.sort((a, b) => b.totalTokens - a.totalTokens);
  }

  /**
   * Get per-taskType breakdown for a time window.
   */
  getTaskTypeBreakdown(windowDays = 30) {
    const days = clampWindowDays(windowDays, 30);
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const records = this._records.filter((r) => r.ts >= cutoff);

    const byTask = new Map();
    for (const r of records) {
      if (!byTask.has(r.taskType)) byTask.set(r.taskType, []);
      byTask.get(r.taskType).push(r);
    }

    const result = [];
    for (const [taskType, recs] of byTask) {
      result.push({ taskType, ...this._aggregate(recs, days) });
    }
    return result.sort((a, b) => b.totalTokens - a.totalTokens);
  }

  /**
   * Get a full report across all supported windows.
   * @param {number} [breakdownWindowDays=30] - window for breakdown sections
   */
  getReport(breakdownWindowDays = 30) {
    const windows = {};
    for (const days of WINDOW_DAYS) {
      windows[`${days}d`] = this.getStats({ windowDays: days });
    }
    return {
      totalRecords: this._records.length,
      windows,
      modelBreakdown: this.getModelBreakdown(breakdownWindowDays),
      agentBreakdown: this.getAgentBreakdown(breakdownWindowDays),
      taskTypeBreakdown: this.getTaskTypeBreakdown(breakdownWindowDays),
    };
  }

  /**
   * Get recent raw records.
   */
  getRecentRecords(limit = 100) {
    // HR-01: guard limit=0 and negative values
    const n = Math.max(0, Math.floor(Number(limit) || 0));
    if (n === 0) return [];
    return this._records.slice(-Math.min(n, this._records.length));
  }

  /**
   * Clear all records.
   */
  clear() {
    this._records = [];
  }

  // ------------------------------------------------------------------
  // Internal helpers
  // ------------------------------------------------------------------

  _aggregate(records, windowDays) {
    if (!records.length) {
      return {
        windowDays,
        count: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: 0,
        avgLatencyMs: 0,
        avgTokensPerCall: 0,
        avgCostPerCall: 0,
      };
    }

    let inputTokens = 0;
    let outputTokens = 0;
    let costUsd = 0;
    let latencySum = 0;
    let latencyCount = 0;

    for (const r of records) {
      inputTokens += r.inputTokens;
      outputTokens += r.outputTokens;
      costUsd += r.costUsd;
      if (r.latencyMs > 0) {
        latencySum += r.latencyMs;
        latencyCount++;
      }
    }

    const totalTokens = inputTokens + outputTokens;
    const count = records.length;

    return {
      windowDays,
      count,
      inputTokens,
      outputTokens,
      totalTokens,
      costUsd: Math.round(costUsd * 1_000_000) / 1_000_000,
      avgLatencyMs: latencyCount > 0 ? Math.round(latencySum / latencyCount) : 0,
      avgTokensPerCall: count > 0 ? Math.round(totalTokens / count) : 0,
      avgCostPerCall: count > 0 ? Math.round((costUsd / count) * 1_000_000) / 1_000_000 : 0,
    };
  }
}

module.exports = {
  TokenMeter,
  WINDOW_DAYS,
};
