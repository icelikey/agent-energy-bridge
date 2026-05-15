const { GatewayAdapter } = require('../adapters/gateway-adapter');
const { RouteHealthChecker } = require('./route-health-checker');

const DEFAULT_ROUTER_OPTIONS = Object.freeze({
  checkIntervalMs: 5000,
  timeoutMs: 10000,
  consecutiveFailuresThreshold: 2,
  recoveryDebounceMs: 10000,
});

class MultiProviderRouter extends GatewayAdapter {
  constructor(providers = [], options = {}) {
    super();
    this.opts = { ...DEFAULT_ROUTER_OPTIONS, ...options };

    this._providers = providers.map((p) => ({
      name: String(p.name),
      weight: Math.max(0, Number(p.weight ?? 1)),
      adapter: p.adapter,
      healthUrl: p.healthUrl || null,
      primary: p.primary === true,
      status: 'unknown',
      consecutiveFailures: 0,
    }));

    this._active = this._providers[0] || null;
    this._primaryName = (this._providers.find((p) => p.primary) || this._providers[0])?.name || null;
    this._switchLog = [];
    this._switchLock = Promise.resolve();
    this._onSwitch = options.onSwitch || null;
    this._onAlert = options.onAlert || null;
    this._logger = options.logger || null;

    const healthRoutes = this._providers.filter((p) => p.healthUrl).map((p) => ({ name: p.name, url: p.healthUrl }));
    if (healthRoutes.length > 0) {
      this._healthChecker = new RouteHealthChecker({
        routes: healthRoutes,
        checkIntervalMs: this.opts.checkIntervalMs,
        timeoutMs: this.opts.timeoutMs,
        consecutiveFailuresThreshold: this.opts.consecutiveFailuresThreshold,
        onStatusChange: (event) => this._onHealthChange(event),
        logger: this._logger,
      });
    } else {
      this._healthChecker = null;
    }
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  start() {
    if (this._healthChecker) this._healthChecker.start();
  }

  stop() {
    if (this._healthChecker) this._healthChecker.stop();
  }

  destroy() {
    if (this._healthChecker) this._healthChecker.destroy();
    this._providers = [];
    this._active = null;
    this._onSwitch = null;
    this._onAlert = null;
    this._logger = null;
  }

  // ------------------------------------------------------------------
  // Provider selection (ROUT-04)
  // ------------------------------------------------------------------

  selectProvider() {
    const candidates = this._providers.filter((p) => p.status !== 'unhealthy' && p.adapter);
    if (candidates.length === 0) {
      return this._providers
        .filter((p) => p.adapter)
        .sort((a, b) => a.consecutiveFailures - b.consecutiveFailures)[0] || null;
    }
    const totalWeight = candidates.reduce((sum, p) => sum + p.weight, 0);
    if (totalWeight <= 0) return candidates[0];
    let rand = Math.random() * totalWeight;
    for (const p of candidates) {
      rand -= p.weight;
      if (rand <= 0) return p;
    }
    return candidates[candidates.length - 1];
  }

  // ------------------------------------------------------------------
  // Routing wrapper (ROUT-02)
  // ------------------------------------------------------------------

  async _withRouting(methodName, ...args) {
    const provider = this._active || this.selectProvider();
    if (!provider || !provider.adapter) {
      const err = new Error('No available provider');
      err.code = 'NO_PROVIDER';
      throw err;
    }

    try {
      const result = await provider.adapter[methodName](...args);
      provider.consecutiveFailures = 0;
      return result;
    } catch (error) {
      provider.consecutiveFailures++;
      if (typeof this._onAlert === 'function') {
        this._onAlert({ type: 'provider_error', provider: provider.name, error: error.message, timestamp: new Date().toISOString() });
      }
      const next = this._providers.find((p) => p !== provider && p.status !== 'unhealthy' && p.adapter);
      if (next) {
        await this._withSwitchLock(async () => {
          this._switchTo(next.name, { reason: 'request_error', error: error.message });
        });
        return next.adapter[methodName](...args);
      }
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // Health change handler (ROUT-01, ROUT-03)
  // ------------------------------------------------------------------

  _onHealthChange({ name, from, to }) {
    const provider = this._providers.find((p) => p.name === name);
    if (!provider) return;
    provider.status = to;

    if (to === 'unhealthy' && this._active?.name === name) {
      const next = this.selectProvider();
      if (next && next.name !== name) {
        this._withSwitchLock(async () => {
          this._switchTo(next.name, { reason: 'health_degraded', from: name });
        }).catch(() => {});
      }
    }

    if (to === 'healthy' && name === this._primaryName && this._active?.name !== name) {
      const debounce = this.opts.recoveryDebounceMs;
      setTimeout(() => {
        const primary = this._providers.find((p) => p.name === name);
        if (primary && primary.status === 'healthy') {
          this._withSwitchLock(async () => {
            this._switchTo(name, { reason: 'primary_recovered' });
          }).catch(() => {});
        }
      }, debounce);
    }
  }

  // ------------------------------------------------------------------
  // Switch helpers (ROUT-05)
  // ------------------------------------------------------------------

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

  _switchTo(targetName, meta = {}) {
    const target = this._providers.find((p) => p.name === targetName);
    if (!target) return;
    if (this._active?.name === targetName) return;

    const from = this._active?.name || null;
    this._active = target;

    const entry = { from, to: targetName, timestamp: new Date().toISOString(), ...meta };

    if (this._switchLog.length >= 1000) {
      this._switchLog = this._switchLog.slice(-500);
    }
    this._switchLog.push(entry);

    if (typeof this._onSwitch === 'function') this._onSwitch(entry);
    if (typeof this._onAlert === 'function') {
      this._onAlert({ type: `switched_to_${targetName}`, ...meta, timestamp: entry.timestamp });
    }
    if (this._logger) {
      this._logger.info('provider_switched', entry);
    }
  }

  async forceProvider(name) {
    const target = this._providers.find((p) => p.name === name);
    if (!target) {
      const err = new Error(`Unknown provider: "${name}"`);
      err.code = 'UNKNOWN_PROVIDER';
      throw err;
    }
    await this._withSwitchLock(async () => {
      this._switchTo(name, { reason: 'manual_force' });
    });
  }

  // ------------------------------------------------------------------
  // GatewayAdapter delegates
  // ------------------------------------------------------------------

  async getBalance(...args) { return this._withRouting('getBalance', ...args); }
  async listModels(...args) { return this._withRouting('listModels', ...args); }
  async getUsage(...args) { return this._withRouting('getUsage', ...args); }
  async redeemCode(...args) { return this._withRouting('redeemCode', ...args); }
  async issueKey(...args) { return this._withRouting('issueKey', ...args); }
  async rotateKey(...args) { return this._withRouting('rotateKey', ...args); }
  async renderDocs(...args) { return this._withRouting('renderDocs', ...args); }

  // ------------------------------------------------------------------
  // Introspection
  // ------------------------------------------------------------------

  getStatus() {
    return {
      active: this._active?.name || null,
      providers: this._providers.map((p) => ({
        name: p.name,
        weight: p.weight,
        primary: p.primary,
        status: p.status,
        consecutiveFailures: p.consecutiveFailures,
      })),
      switchCount: this._switchLog.length,
      lastSwitch: this._switchLog.length > 0 ? this._switchLog[this._switchLog.length - 1] : null,
    };
  }

  getReport() {
    const healthReport = this._healthChecker ? this._healthChecker.getReport() : null;
    return {
      timestamp: new Date().toISOString(),
      active: this._active?.name || null,
      providers: this._providers.map((p) => ({
        name: p.name,
        weight: p.weight,
        primary: p.primary,
        status: p.status,
        consecutiveFailures: p.consecutiveFailures,
      })),
      switchCount: this._switchLog.length,
      lastSwitch: this._switchLog.length > 0 ? this._switchLog[this._switchLog.length - 1] : null,
      healthReport,
    };
  }

  getSwitchLog(limit = 100) {
    const n = Math.max(0, Math.floor(Number(limit) || 0));
    if (n === 0) return [];
    return this._switchLog.slice(-Math.min(n, this._switchLog.length));
  }
}

module.exports = { MultiProviderRouter, DEFAULT_ROUTER_OPTIONS };
