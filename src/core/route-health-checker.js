class RouteHealthChecker {
  constructor(options = {}) {
    this.routes = (options.routes || []).map((r) => (typeof r === 'string' ? { name: r, url: r } : r));
    this.checkIntervalMs = Number(options.checkIntervalMs || 60000);
    this.timeoutMs = Number(options.timeoutMs || 10000);
    this.degradedThreshold = Number(options.degradedThreshold || 0.5);
    this.unhealthyThreshold = Number(options.unhealthyThreshold || 0.2);
    this.consecutiveFailuresThreshold = Number(options.consecutiveFailuresThreshold || 3);
    this.onStatusChange = options.onStatusChange || null;
    this.logger = options.logger || null;

    this._statusMap = new Map();
    this._intervalId = null;
    this._history = [];

    this.routes.forEach((route) => {
      this._statusMap.set(route.name, {
        name: route.name,
        url: route.url,
        status: 'unknown',
        lastCheckAt: null,
        lastSuccessAt: null,
        consecutiveSuccesses: 0,
        consecutiveFailures: 0,
        successRate: 0,
        avgLatencyMs: 0,
        totalChecks: 0,
        totalSuccesses: 0,
      });
    });
  }

  async checkRoute(route) {
    const start = Date.now();
    let ok = false;
    let statusCode = 0;
    let error = null;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      const response = await fetch(route.url, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timer);
      statusCode = response.status;
      ok = response.status < 500;
    } catch (err) {
      error = err.message || 'unknown';
      ok = false;
    }

    const latencyMs = Date.now() - start;
    return { ok, statusCode, latencyMs, error };
  }

  async runCheck() {
    const results = [];
    for (const route of this.routes) {
      const result = await this.checkRoute(route);
      this._updateStatus(route.name, result);
      results.push({ name: route.name, ...result });
    }
    this._history.push({ timestamp: new Date().toISOString(), results });
    if (this._history.length > 1000) this._history.shift();
    return results;
  }

  _updateStatus(name, result) {
    const current = this._statusMap.get(name);
    if (!current) return;

    const prevStatus = current.status;
    current.lastCheckAt = new Date().toISOString();
    current.totalChecks++;

    if (result.ok) {
      current.totalSuccesses++;
      current.consecutiveSuccesses++;
      current.consecutiveFailures = 0;
      current.lastSuccessAt = current.lastCheckAt;
    } else {
      current.consecutiveFailures++;
      current.consecutiveSuccesses = 0;
    }

    current.successRate = current.totalChecks > 0 ? current.totalSuccesses / current.totalChecks : 0;

    // Update avg latency with simple EWMA
    if (result.latencyMs > 0) {
      current.avgLatencyMs = current.avgLatencyMs === 0
        ? result.latencyMs
        : Math.round(current.avgLatencyMs * 0.7 + result.latencyMs * 0.3);
    }

    // Determine status
    if (current.consecutiveFailures >= this.consecutiveFailuresThreshold) {
      current.status = 'unhealthy';
    } else if (current.successRate < this.unhealthyThreshold) {
      current.status = 'unhealthy';
    } else if (current.successRate < this.degradedThreshold || current.consecutiveFailures > 0) {
      current.status = 'degraded';
    } else {
      current.status = 'healthy';
    }

    if (current.status !== prevStatus && typeof this.onStatusChange === 'function') {
      this.onStatusChange({
        name: current.name,
        url: current.url,
        from: prevStatus,
        to: current.status,
        consecutiveFailures: current.consecutiveFailures,
        successRate: current.successRate,
      });
    }

    if (this.logger && current.status !== 'healthy') {
      this.logger.warn('route_health_degraded', {
        route: name,
        status: current.status,
        consecutiveFailures: current.consecutiveFailures,
        successRate: current.successRate,
        latencyMs: result.latencyMs,
        error: result.error,
      });
    }
  }

  getStatus(name) {
    return this._statusMap.get(name) || null;
  }

  getAllStatuses() {
    return Array.from(this._statusMap.values());
  }

  getHealthyRoutes() {
    return this.getAllStatuses().filter((r) => r.status === 'healthy');
  }

  getDegradedRoutes() {
    return this.getAllStatuses().filter((r) => r.status === 'degraded');
  }

  getUnhealthyRoutes() {
    return this.getAllStatuses().filter((r) => r.status === 'unhealthy');
  }

  getBestRoute() {
    const healthy = this.getHealthyRoutes();
    if (healthy.length > 0) {
      return healthy.sort((a, b) => a.avgLatencyMs - b.avgLatencyMs)[0];
    }
    const degraded = this.getDegradedRoutes();
    if (degraded.length > 0) {
      return degraded.sort((a, b) => a.avgLatencyMs - b.avgLatencyMs)[0];
    }
    return null;
  }

  getReport() {
    const all = this.getAllStatuses();
    return {
      timestamp: new Date().toISOString(),
      totalRoutes: all.length,
      healthy: all.filter((r) => r.status === 'healthy').length,
      degraded: all.filter((r) => r.status === 'degraded').length,
      unhealthy: all.filter((r) => r.status === 'unhealthy').length,
      routes: all,
      recommendedRoute: this.getBestRoute(),
    };
  }

  start() {
    if (this._intervalId) return;
    this.runCheck();
    this._intervalId = setInterval(() => this.runCheck(), this.checkIntervalMs);
  }

  stop() {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }

  getHistory(limit = 100) {
    return this._history.slice(-limit);
  }
}

module.exports = {
  RouteHealthChecker,
};
