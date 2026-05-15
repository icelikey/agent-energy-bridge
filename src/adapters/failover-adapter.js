const { GatewayAdapter } = require('./gateway-adapter');

const DEFAULT_OPTIONS = Object.freeze({
  balanceThresholdUsd: 0.01,
  recoveryCheckIntervalMs: 60_000,
  maxConsecutiveFailures: 3,
  failureCooldownMs: 10_000,
});

/**
 * FailoverAdapter wraps a primary and emergency adapter.
 * When the primary is unhealthy or out of balance, requests transparently
 * fall through to the emergency adapter. Recovery is checked periodically.
 *
 * Pattern inspired by Claude Code multi-provider routing (cc-switch):
 * primary -> fallback chain -> free tier, with health monitoring and
 * automatic recovery.
 */
class FailoverAdapter extends GatewayAdapter {
  constructor(primaryAdapter, emergencyAdapter, options = {}) {
    super();
    this.primaryAdapter = primaryAdapter;
    this.emergencyAdapter = emergencyAdapter;
    this.opts = { ...DEFAULT_OPTIONS, ...options };

    this._active = 'primary';
    this._primaryHealthy = true;
    this._consecutiveFailures = 0;
    this._lastFailureAt = 0;
    this._lastRecoveryCheck = 0;
    this._switchLog = [];
    this._onSwitch = options.onSwitch || null;
    this._onAlert = options.onAlert || null;

    // Promise lock to prevent concurrent switch races (CONC-01)
    this._switchLock = Promise.resolve();
    this._recovering = false;
  }

  // ------------------------------------------------------------------
  // Core failover wrapper
  // ------------------------------------------------------------------

  async _withFailover(methodName, ...args) {
    // Try primary first if it's marked active
    if (this._active === 'primary') {
      try {
        const result = await this.primaryAdapter[methodName](...args);
        this._consecutiveFailures = 0;
        return result;
      } catch (error) {
        this._recordFailure(error);
        // If primary failed and we have an emergency adapter, switch
        if (this.emergencyAdapter) {
          await this._withSwitchLock(async () => {
            this._switchTo('emergency', { reason: 'primary_failure', method: methodName, error: error.message });
          });
          return this.emergencyAdapter[methodName](...args);
        }
        throw error;
      }
    }

    // Currently on emergency — try it
    try {
      const result = await this.emergencyAdapter[methodName](...args);
      // Opportunistically check if primary recovered (non-blocking)
      this._tryRecoverAsync();
      return result;
    } catch (error) {
      // Emergency also failed — propagate
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // Balance-aware switching
  // ------------------------------------------------------------------

  async getBalance(identity = {}) {
    // Always try primary balance first to know its state
    let primaryBalance = null;
    let primaryError = null;
    try {
      primaryBalance = await this.primaryAdapter.getBalance(identity);
    } catch (error) {
      primaryError = error;
      this._recordFailure(error);
    }

    const availableUsd = primaryBalance
      ? Number(primaryBalance.availableUsd ?? primaryBalance.balanceUsd ?? 0)
      : 0;

    const primaryDepleted = availableUsd <= this.opts.balanceThresholdUsd;
    const primaryFailed = primaryError !== null;

    // If primary is depleted or failed, switch to emergency
    if ((primaryDepleted || primaryFailed) && this.emergencyAdapter) {
      const reason = primaryDepleted ? 'balance_depleted' : 'primary_failure';
      if (this._active !== 'emergency') {
        await this._withSwitchLock(async () => {
          this._switchTo('emergency', { reason, availableUsd, error: primaryError?.message });
        });
      }

      // Return emergency balance if available, else synthetic zero
      try {
        const emergencyBalance = await this.emergencyAdapter.getBalance(identity);
        return {
          ...emergencyBalance,
          _source: 'emergency',
          _primaryAvailableUsd: availableUsd,
        };
      } catch {
        return {
          availableUsd: 0,
          balanceUsd: 0,
          _source: 'emergency',
          _primaryAvailableUsd: availableUsd,
        };
      }
    }

    // Primary is healthy — if we were on emergency, recover
    if (this._active === 'emergency' && !primaryDepleted && !primaryFailed) {
      await this._withSwitchLock(async () => {
        this._switchTo('primary', { reason: 'recovered', availableUsd });
      });
    }

    this._consecutiveFailures = 0;
    return { ...primaryBalance, _source: 'primary' };
  }

  // ------------------------------------------------------------------
  // Adapter method delegates
  // ------------------------------------------------------------------

  async listModels(...args) {
    return this._withFailover('listModels', ...args);
  }

  async getUsage(...args) {
    return this._withFailover('getUsage', ...args);
  }

  async redeemCode(...args) {
    return this._withFailover('redeemCode', ...args);
  }

  async issueKey(...args) {
    return this._withFailover('issueKey', ...args);
  }

  async rotateKey(...args) {
    return this._withFailover('rotateKey', ...args);
  }

  async renderDocs(...args) {
    return this._withFailover('renderDocs', ...args);
  }

  // ------------------------------------------------------------------
  // Recovery
  // ------------------------------------------------------------------

  _tryRecoverAsync() {
    const now = Date.now();
    if (now - this._lastRecoveryCheck < this.opts.recoveryCheckIntervalMs) return;
    if (this._recovering) return;
    this._lastRecoveryCheck = now;
    this._recovering = true;

    // Fire-and-forget recovery probe with guard against concurrent recovery (CONC-01)
    Promise.resolve().then(async () => {
      try {
        const balance = await this.primaryAdapter.getBalance({});
        const availableUsd = Number(balance?.availableUsd ?? balance?.balanceUsd ?? 0);
        if (availableUsd > this.opts.balanceThresholdUsd) {
          await this._withSwitchLock(async () => {
            this._switchTo('primary', { reason: 'recovered_async', availableUsd });
          });
        }
      } catch {
        // Still down — remain on emergency
      } finally {
        this._recovering = false;
      }
    });
  }

  // ------------------------------------------------------------------
  // Internal helpers
  // ------------------------------------------------------------------

  _recordFailure(error) {
    this._consecutiveFailures++;
    this._lastFailureAt = Date.now();
    if (this._consecutiveFailures >= this.opts.maxConsecutiveFailures) {
      this._primaryHealthy = false;
    }
    if (typeof this._onAlert === 'function') {
      this._onAlert({
        type: 'primary_failure',
        consecutiveFailures: this._consecutiveFailures,
        error: error?.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /** Acquire a Promise lock to serialize switch operations (CONC-01) */
  async _withSwitchLock(fn) {
    const prev = this._switchLock;
    let release;
    this._switchLock = new Promise((r) => { release = r; });
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  _switchTo(target, meta = {}) {
    if (this._active === target) return;
    const from = this._active;
    this._active = target;
    const entry = {
      from,
      to: target,
      timestamp: new Date().toISOString(),
      ...meta,
    };
    // Prevent unbounded switch log growth (CONC-03)
    if (this._switchLog.length >= 1000) {
      this._switchLog = this._switchLog.slice(-500);
    }
    this._switchLog.push(entry);
    if (typeof this._onSwitch === 'function') {
      this._onSwitch(entry);
    }
    if (typeof this._onAlert === 'function') {
      this._onAlert({
        type: `switched_to_${target}`,
        ...meta,
        timestamp: entry.timestamp,
      });
    }
  }

  // ------------------------------------------------------------------
  // Public introspection
  // ------------------------------------------------------------------

  getStatus() {
    return {
      active: this._active,
      primaryHealthy: this._primaryHealthy,
      consecutiveFailures: this._consecutiveFailures,
      lastFailureAt: this._lastFailureAt ? new Date(this._lastFailureAt).toISOString() : null,
      switchCount: this._switchLog.length,
      lastSwitch: this._switchLog.length > 0 ? this._switchLog[this._switchLog.length - 1] : null,
    };
  }

  getSwitchLog(limit = 100) {
    return this._switchLog.slice(-limit);
  }

  async forceRecover() {
    this._primaryHealthy = true;
    this._consecutiveFailures = 0;
    if (this._active === 'emergency') {
      await this._withSwitchLock(async () => {
        this._switchTo('primary', { reason: 'manual_recovery' });
      });
    }
  }
}

module.exports = {
  FailoverAdapter,
  DEFAULT_OPTIONS,
};
