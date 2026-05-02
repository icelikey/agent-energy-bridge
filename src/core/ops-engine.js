class OpsEngine {
  constructor(options = {}) {
    this.adapter = options.adapter;
    this.budgetGuard = options.budgetGuard || null;
    this.modelSelector = options.modelSelector || null;
    this.energyEngine = options.energyEngine || null;
    this.sessionStore = options.sessionStore || null;
    this.logger = options.logger || null;

    this.metrics = [];
    this.maxMetrics = Number(options.maxMetrics ?? 10000);
    this.monitoringIntervalMs = Number(options.monitoringIntervalMs ?? 300000);
    this._intervalId = null;
  }

  async captureSnapshot(label = 'manual') {
    if (!this.adapter) {
      throw new Error('adapter is required for ops monitoring');
    }

    const timestamp = new Date().toISOString();
    let balance = null;
    let usage = null;

    try {
      balance = await this.adapter.getBalance();
    } catch (error) {
      this._log('warn', 'ops.balance_fetch_failed', { error: error.message });
    }

    try {
      usage = await this.adapter.getUsage();
    } catch (error) {
      this._log('warn', 'ops.usage_fetch_failed', { error: error.message });
    }

    const snapshot = {
      timestamp,
      label,
      balance,
      usage,
    };

    this.metrics.push(snapshot);
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }

    this._log('info', 'ops.snapshot_captured', { timestamp, label });
    return snapshot;
  }

  startMonitoring() {
    if (this._intervalId) {
      return;
    }

    this._intervalId = setInterval(() => {
      this.captureSnapshot('auto').catch((error) => {
        this._log('error', 'ops.auto_snapshot_failed', { error: error.message });
      });
    }, this.monitoringIntervalMs);

    this._log('info', 'ops.monitoring_started', { intervalMs: this.monitoringIntervalMs });
  }

  stopMonitoring() {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
      this._log('info', 'ops.monitoring_stopped');
    }
  }

  generateReport(options = {}) {
    const limit = Number(options.limit ?? 168);
    const recent = this.metrics.slice(-limit);

    if (!recent.length) {
      return {
        period: 'no data',
        snapshots: 0,
        avgBalanceUsd: 0,
        minBalanceUsd: 0,
        totalSpentUsd: 0,
        trend: 'flat',
        alerts: [],
      };
    }

    const balances = recent
      .map((m) => Number(m.balance?.availableUsd ?? m.balance?.balanceUsd ?? 0))
      .filter((v) => typeof v === 'number');

    const avgBalanceUsd = balances.length ? balances.reduce((a, b) => a + b, 0) / balances.length : 0;
    const minBalanceUsd = balances.length ? Math.min(...balances) : 0;

    const spent = recent
      .map((m) => Number(m.usage?.dailySpentUsd ?? 0))
      .filter((v) => typeof v === 'number');
    const totalSpentUsd = spent.length ? spent.reduce((a, b) => a + b, 0) : 0;

    const firstBalance = balances[0] || 0;
    const lastBalance = balances[balances.length - 1] || 0;
    const trend = lastBalance > firstBalance * 1.05 ? 'up' : lastBalance < firstBalance * 0.95 ? 'down' : 'flat';

    const alerts = [];
    if (minBalanceUsd < 2) {
      alerts.push({ severity: 'critical', message: `Balance dropped to $${minBalanceUsd.toFixed(2)}` });
    } else if (minBalanceUsd < 5) {
      alerts.push({ severity: 'warning', message: `Balance dropped to $${minBalanceUsd.toFixed(2)}` });
    }

    if (totalSpentUsd > 50) {
      alerts.push({ severity: 'info', message: `High spend detected: $${totalSpentUsd.toFixed(2)}` });
    }

    return {
      period: `${recent.length} snapshots`,
      snapshots: recent.length,
      avgBalanceUsd: Math.round(avgBalanceUsd * 100) / 100,
      minBalanceUsd: Math.round(minBalanceUsd * 100) / 100,
      totalSpentUsd: Math.round(totalSpentUsd * 100) / 100,
      trend,
      alerts,
      lastSnapshot: recent[recent.length - 1],
    };
  }

  getEnergyReport() {
    if (!this.energyEngine || !this.sessionStore) {
      return null;
    }

    const sessions = this.sessionStore.getRecentSessions(100);
    return this.energyEngine.summarizeSession(sessions);
  }

  _log(level, message, meta) {
    if (this.logger) {
      this.logger[level](message, meta);
    }
  }
}

module.exports = {
  OpsEngine,
};
