const { GatewayAdapter } = require('./gateway-adapter');

class AutoRefuelDecorator extends GatewayAdapter {
  constructor(wrappedAdapter, options = {}) {
    super();
    this.wrappedAdapter = wrappedAdapter;
    this.lowBalanceThresholdUsd = Number(options.lowBalanceThresholdUsd ?? 5);
    this.refuelAmountUsd = Number(options.refuelAmountUsd ?? 10);
    this.refuelStrategy = options.refuelStrategy || 'fixed';
    this.autoRefuelEnabled = options.autoRefuelEnabled !== false;
    this.maxRefuelsPerHour = Number(options.maxRefuelsPerHour ?? 3);
    this.cooldownMs = Number(options.cooldownMs ?? 60000);
    this.onRefuel = options.onRefuel || null;
    this.onAlert = options.onAlert || null;
    this.refuelCodes = options.refuelCodes || [];

    this._refuelCount = 0;
    this._lastRefuelAt = 0;
    this._totalRefueledUsd = 0;
    this._alertLog = [];
  }

  async getBalance(identity = {}) {
    let balance = await this.wrappedAdapter.getBalance(identity);
    const availableUsd = Number(balance.availableUsd ?? balance.balanceUsd ?? 0);

    if (this.autoRefuelEnabled && availableUsd < this.lowBalanceThresholdUsd) {
      const refueled = await this._tryAutoRefuel(identity, availableUsd);
      if (refueled) {
        balance = await this.wrappedAdapter.getBalance(identity);
      }
    }

    return balance;
  }

  async _tryAutoRefuel(identity, availableUsd) {
    const now = Date.now();
    if (now - this._lastRefuelAt < this.cooldownMs) {
      this._logAlert('refuel_cooldown', { availableUsd, cooldownRemaining: this.cooldownMs - (now - this._lastRefuelAt) });
      return false;
    }

    if (this._refuelCount >= this.maxRefuelsPerHour) {
      this._logAlert('refuel_limit_exceeded', { availableUsd, maxRefuelsPerHour: this.maxRefuelsPerHour });
      return false;
    }

    const amount = this._calculateRefuelAmount(availableUsd);
    if (amount <= 0) {
      return false;
    }

    try {
      let result;

      if (typeof this.wrappedAdapter.topUp === 'function') {
        result = await this.wrappedAdapter.topUp({ amount, identity, reason: 'auto_refuel' });
      } else if (typeof this.wrappedAdapter.redeemCode === 'function') {
        const code = this.refuelCodes.length
          ? this.refuelCodes[this._refuelCount % this.refuelCodes.length]
          : this._generateTopUpCode(amount);
        result = await this.wrappedAdapter.redeemCode({ code, amount, identity });
      } else {
        this._logAlert('refuel_no_method', { availableUsd });
        return false;
      }

      this._refuelCount++;
      this._lastRefuelAt = now;
      this._totalRefueledUsd += amount;

      if (typeof this.onRefuel === 'function') {
        this.onRefuel({ amount, result, availableUsd, timestamp: new Date().toISOString() });
      }

      this._logAlert('refuel_success', { amount, availableUsd, result });
      return true;
    } catch (error) {
      this._logAlert('refuel_failed', { amount, availableUsd, error: error.message });
      return false;
    }
  }

  _calculateRefuelAmount(availableUsd) {
    if (this.refuelStrategy === 'fixed') {
      return this.refuelAmountUsd;
    }

    if (this.refuelStrategy === 'proportional') {
      const deficit = Math.max(0, this.lowBalanceThresholdUsd - availableUsd);
      return Math.max(this.refuelAmountUsd, deficit * 2);
    }

    if (this.refuelStrategy === 'dynamic') {
      const base = this.lowBalanceThresholdUsd * 2;
      return Math.max(this.refuelAmountUsd, base - availableUsd);
    }

    return this.refuelAmountUsd;
  }

  _generateTopUpCode(amount) {
    return `AUTO-REFUEL-${amount}-${Date.now()}`;
  }

  _logAlert(type, meta) {
    const alert = { type, timestamp: new Date().toISOString(), ...meta };
    this._alertLog.push(alert);
    if (typeof this.onAlert === 'function') {
      this.onAlert(alert);
    }
  }

  getAlertLog(limit = 100) {
    return this._alertLog.slice(-limit);
  }

  getRefuelStats() {
    return {
      refuelCount: this._refuelCount,
      totalRefueledUsd: this._totalRefueledUsd,
      lastRefuelAt: this._lastRefuelAt ? new Date(this._lastRefuelAt).toISOString() : null,
      maxRefuelsPerHour: this.maxRefuelsPerHour,
      cooldownMs: this.cooldownMs,
    };
  }

  resetStats() {
    this._refuelCount = 0;
    this._totalRefueledUsd = 0;
    this._alertLog = [];
  }

  async listModels(...args) { return this.wrappedAdapter.listModels(...args); }
  async getUsage(...args) { return this.wrappedAdapter.getUsage(...args); }
  async redeemCode(...args) { return this.wrappedAdapter.redeemCode(...args); }
  async issueKey(...args) { return this.wrappedAdapter.issueKey(...args); }
  async rotateKey(...args) { return this.wrappedAdapter.rotateKey(...args); }
  async renderDocs(...args) { return this.wrappedAdapter.renderDocs(...args); }
}

module.exports = {
  AutoRefuelDecorator,
};
