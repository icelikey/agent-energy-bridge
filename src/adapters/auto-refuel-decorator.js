const { GatewayAdapter } = require('./gateway-adapter');
const { isInQuietHours } = require('../utils/quiet-hours');

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
    this.notificationService = options.notificationService || null;
    this.notifyTargets = options.notifyTargets || null;
    this.quietHours = options.quietHours || null;
    this.refuelCodes = Array.isArray(options.refuelCodes) ? [...options.refuelCodes] : [];

    // 激活码消耗策略：true = FIFO 消耗（一次性码），false = 循环复用（套餐码）
    // 默认 FIFO，因为大多数生产环境（NewAPI、One-API 等）的激活码是一次性的
    this.consumeCode = options.consumeCode !== false;

    // 是否允许在激活码池为空时生成"合成"激活码（AUTO-REFUEL-{amount}-{timestamp}）
    // 这种码大多数 Gateway 不识别，仅用于 MemoryAdapter 演示。生产环境默认关闭
    this.enableSyntheticCode = options.enableSyntheticCode === true;

    this._refuelCount = 0;
    this._lastRefuelAt = 0;
    this._totalRefueledUsd = 0;
    this._alertLog = [];
    this._maxAlertLog = Number(options.maxAlertLog ?? 1000);

    // 滑动窗口时间戳数组，记录最近 1 小时内的成功加油时间（修复 maxRefuelsPerHour 计数不重置 bug）
    this._refuelTimestamps = [];
    this._refuelWindowMs = Number(options.refuelWindowMs ?? 3600_000);  // 默认 1 小时

    // Promise lock to prevent concurrent refuel races (CONC-01)
    this._refuelLock = Promise.resolve();
  }

  async getBalance(identity = {}) {
    let balance = await this.wrappedAdapter.getBalance(identity);
    const availableUsd = Number(balance.availableUsd ?? balance.balanceUsd ?? 0);

    if (this.autoRefuelEnabled && availableUsd < this.lowBalanceThresholdUsd) {
      const refueled = await this._withRefuelLock(async () => {
        // Re-check balance inside lock to prevent stale-read race (CONC-04)
        const fresh = await this.wrappedAdapter.getBalance(identity);
        const freshUsd = Number(fresh.availableUsd ?? fresh.balanceUsd ?? 0);
        if (freshUsd >= this.lowBalanceThresholdUsd) return false;
        return this._tryAutoRefuel(identity, freshUsd);
      });
      if (refueled) {
        balance = await this.wrappedAdapter.getBalance(identity);
      }
    }

    return balance;
  }

  /** Acquire a Promise lock to serialize refuel attempts (CONC-01) */
  async _withRefuelLock(fn) {
    const prev = this._refuelLock;
    let release;
    this._refuelLock = new Promise((r) => { release = r; });
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  async _tryAutoRefuel(identity, availableUsd) {
    const now = Date.now();
    if (now - this._lastRefuelAt < this.cooldownMs) {
      this._logAlert('refuel_cooldown', { availableUsd, cooldownRemaining: this.cooldownMs - (now - this._lastRefuelAt) });
      return false;
    }

    // 滑动窗口检查：清理过期时间戳，确保 maxRefuelsPerHour 真的"按小时"重置
    // (修复 bug：原 _refuelCount 只增不减，运行超过 1 小时后自动加油永久失效)
    const windowStart = now - this._refuelWindowMs;
    this._refuelTimestamps = this._refuelTimestamps.filter((ts) => ts > windowStart);

    if (this._refuelTimestamps.length >= this.maxRefuelsPerHour) {
      this._logAlert('refuel_limit_exceeded', {
        availableUsd,
        maxRefuelsPerHour: this.maxRefuelsPerHour,
        windowMs: this._refuelWindowMs,
        recentRefuels: this._refuelTimestamps.length,
      });
      return false;
    }

    const amount = this._calculateRefuelAmount(availableUsd);
    if (amount <= 0) {
      return false;
    }

    try {
      let result;
      let consumedCode = null;  // 记录本次实际使用的码，用于失败回滚

      if (typeof this.wrappedAdapter.topUp === 'function') {
        result = await this.wrappedAdapter.topUp({ amount, identity, reason: 'auto_refuel' });
      } else if (typeof this.wrappedAdapter.redeemCode === 'function') {
        let code;
        if (this.refuelCodes.length > 0) {
          if (this.consumeCode) {
            // FIFO 消耗：取出第一个码（成功失败都会从池移除，避免无效码反复重试）
            code = this.refuelCodes.shift();
            consumedCode = code;
          } else {
            // 循环复用：适用于套餐码等可重复兑换的场景
            code = this.refuelCodes[this._refuelCount % this.refuelCodes.length];
          }
        } else if (this.enableSyntheticCode) {
          // 仅在显式启用时才生成合成码（默认关闭 — 大多数 Gateway 不识别）
          code = this._generateTopUpCode(amount);
        } else {
          this._logAlert('refuel_no_codes', { availableUsd, hint: 'configure refuelCodes or set enableSyntheticCode:true' });
          return false;
        }
        result = await this.wrappedAdapter.redeemCode({ code, amount, identity });

        // 检查 Gateway 显式返回的失败（NewAPI 返回 { ok: false }，不抛错）
        if (result && result.ok === false) {
          this._logAlert('refuel_failed', {
            amount,
            availableUsd,
            error: result.message || result.error || 'redeem returned ok:false',
          });
          return false;
        }
      } else {
        this._logAlert('refuel_no_method', { availableUsd });
        return false;
      }

      // 成功后：累计计数 + 滑动窗口时间戳 + lastRefuelAt
      this._refuelCount++;
      this._refuelTimestamps.push(now);
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
    // Prevent unbounded memory growth (CONC-03)
    if (this._alertLog.length > this._maxAlertLog) {
      this._alertLog = this._alertLog.slice(-this._maxAlertLog);
    }
    if (typeof this.onAlert === 'function') {
      this.onAlert(alert);
    }

    // NOTF-01: 控制台告警
    const isCritical = type === 'refuel_failed' || (meta && meta.availableUsd === 0);
    if (isCritical) {
      console.error('[AEB CRITICAL]', type, meta);
    } else {
      console.warn('[AEB WARN]', type, meta);
    }

    // NOTF-02~04: 多渠道通知（fire-and-forget，不阻塞主流程）
    if (this.notificationService && !isInQuietHours(this.quietHours)) {
      this._emitNotification(type, meta).catch(() => {});
    }
  }

  async _emitNotification(type, meta) {
    const levelMap = {
      refuel_failed: 'critical',
      balance_exhausted: 'critical',
      refuel_success: 'info',
    };
    const level = levelMap[type] || 'warn';

    const titleMap = {
      refuel_failed: 'Auto-refuel failed',
      refuel_success: 'Auto-refuel succeeded',
      balance_exhausted: 'Balance exhausted',
      refuel_cooldown: 'Refuel on cooldown',
      refuel_limit_exceeded: 'Refuel limit reached',
      refuel_no_method: 'No refuel method available',
    };
    const title = titleMap[type] || type;
    const message = meta
      ? Object.entries(meta).map(([k, v]) => `${k}: ${v}`).join(' | ')
      : '';

    const notification = { type, level, title, message, meta };

    if (this.notifyTargets) {
      return this.notificationService.send({ ...notification, targets: this.notifyTargets });
    }
    return this.notificationService.sendFromEnv(notification);
  }

  getAlertLog(limit = 100) {
    return this._alertLog.slice(-limit);
  }

  getRefuelStats() {
    // 实时清理过期时间戳后再统计当前窗口内的次数
    const now = Date.now();
    const windowStart = now - this._refuelWindowMs;
    const recentRefuels = this._refuelTimestamps.filter((ts) => ts > windowStart).length;
    return {
      refuelCount: this._refuelCount,         // 累计加油次数（进程生命周期）
      recentRefuels,                          // 滑动窗口内的加油次数（用于配额判断）
      totalRefueledUsd: this._totalRefueledUsd,
      lastRefuelAt: this._lastRefuelAt ? new Date(this._lastRefuelAt).toISOString() : null,
      maxRefuelsPerHour: this.maxRefuelsPerHour,
      cooldownMs: this.cooldownMs,
      remainingRefuelCodes: this.refuelCodes.length,  // FIFO 模式下的剩余码数
      consumeCode: this.consumeCode,
    };
  }

  resetStats() {
    this._refuelCount = 0;
    this._refuelTimestamps = [];
    this._totalRefueledUsd = 0;
    this._lastRefuelAt = 0;
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
