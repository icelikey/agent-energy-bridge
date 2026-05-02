const { GenericOpenAIGatewayAdapter } = require('./generic-openai-adapter');

const NEWAPI_DEFAULT_PATHS = Object.freeze({
  models: '/v1/models',
  usage: '/api/usage/token/',
  balance: '/api/user/self',
  redeem: '/api/user/topup',
  issueKey: '/v1/keys/issue',
  rotateKey: '/v1/keys/rotate',
  docs: '/v1/docs/render',
});

class NewAPIGatewayAdapter extends GenericOpenAIGatewayAdapter {
  constructor(config = {}) {
    const mergedPaths = { ...NEWAPI_DEFAULT_PATHS, ...(config.paths || {}) };
    super({ ...config, paths: mergedPaths });
    this.userId = config.userId || null;
    this.username = config.username || null;
    this.password = config.password || null;
    this.quotaPerUnit = config.quotaPerUnit || null;
    this._sessionCookie = null;
    this._statusCache = null;
  }

  async request({ method = 'GET', path, query, body, headers = {} } = {}) {
    const url = require('./generic-openai-adapter').appendQuery
      ? require('./generic-openai-adapter').appendQuery(`${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`, query)
      : `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}${query ? '?' + new URLSearchParams(query).toString() : ''}`;

    const requestHeaders = {
      accept: 'application/json',
      ...headers,
    };

    if (body !== undefined) {
      requestHeaders['content-type'] = 'application/json';
    }

    if (this.apiKey) {
      requestHeaders.authorization = `Bearer ${this.apiKey}`;
    }

    if (this.userId && path.startsWith('/api/')) {
      requestHeaders['new-api-user'] = String(this.userId);
    }

    if (this._sessionCookie) {
      requestHeaders.cookie = this._sessionCookie;
    }

    if (this.transport) {
      const result = await this.transport({ method, url, headers: requestHeaders, body });
      return result;
    }

    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      this._sessionCookie = setCookie;
    }

    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { _rawText: text };
    }

    if (!response.ok) {
      const error = new Error(`Gateway request failed with status ${response.status}`);
      error.status = response.status;
      error.body = data;
      throw error;
    }

    return data;
  }

  async _ensureSession() {
    if (this._sessionCookie) return;
    // If apiKey is provided, assume it can be used for management API access
    // (NewAPI may accept Bearer token + New-Api-User header for some endpoints)
    if (this.apiKey) return;
    if (!this.username || !this.password) {
      throw new Error(
        'NewAPI v1.0.0+ management API requires authentication. ' +
        'Please provide username + password for session login, or set apiKey + userId.'
      );
    }
    await this.request({
      method: 'POST',
      path: '/api/user/login',
      body: { username: this.username, password: this.password },
    });
  }

  async _getQuotaPerUnit() {
    if (this.quotaPerUnit) return this.quotaPerUnit;
    if (this._statusCache) return this._statusCache.quota_per_unit || 100000;
    try {
      const status = await this.request({ path: '/api/status' });
      this._statusCache = status.data || status;
      return this._statusCache.quota_per_unit || 100000;
    } catch {
      return 100000;
    }
  }

  async getUsage(identity = {}) {
    await this._ensureSession();
    const query = identity.userId ? { user_id: identity.userId } : {};
    let data;
    try {
      data = await this.request({ path: this.paths.usage, query });
    } catch {
      data = {};
    }

    return {
      dailySpentUsd: this._extractDailyCost(data),
      hourlyTokensUsed: this._extractHourlyTokens(data),
      autoRefuelsToday: 0,
      autoPurchasedUsdToday: 0,
      raw: data,
    };
  }

  async getBalance(identity = {}) {
    await this._ensureSession();
    const data = await this.request({ path: this.paths.balance });
    const balance = await this._extractBalance(data);

    return {
      availableUsd: balance,
      balanceUsd: balance,
      raw: data,
    };
  }

  async getUserInfo() {
    await this._ensureSession();
    return this.request({ path: this.paths.balance });
  }

  async getTokenUsage(query = {}) {
    await this._ensureSession();
    return this.request({ path: this.paths.usage, query });
  }

  async redeemCode(payload = {}) {
    await this._ensureSession();
    // NewAPI v1.0.0+ expects { key: 'code' } for redemption
    const body = payload.code ? { key: payload.code } : payload;
    const data = await this.request({
      method: 'POST',
      path: this.paths.redeem,
      body,
    });
    return { ok: data.success !== false, ...data };
  }

  async topUp(payload = {}) {
    return this.redeemCode(payload);
  }

  async _extractBalance(data) {
    if (data == null) return 0;

    const quotaPerUnit = await this._getQuotaPerUnit();

    // Priority 1: direct balance field (already in USD)
    if (typeof data.balance === 'number') return data.balance;
    if (typeof data.balance === 'string') return parseFloat(data.balance) || 0;

    // Priority 2: nested data.balance
    if (typeof data.data?.balance === 'number') return data.data.balance;
    if (typeof data.data?.balance === 'string') return parseFloat(data.data.data.balance) || 0;

    // Priority 3: quota field (needs conversion)
    if (typeof data.data?.quota === 'number') {
      return data.data.quota / quotaPerUnit;
    }
    if (typeof data.data?.quota === 'string') {
      return (parseFloat(data.data.quota) || 0) / quotaPerUnit;
    }
    if (typeof data.quota === 'number') return data.quota / quotaPerUnit;
    if (typeof data.quota === 'string') return (parseFloat(data.quota) || 0) / quotaPerUnit;

    // Nested data fallback
    if (typeof data.data === 'object' && data.data !== null) {
      return this._extractBalance(data.data);
    }

    return 0;
  }

  _extractDailyCost(data) {
    if (data == null) return 0;

    // new-api v1.0.0+ usage/token/ format
    if (typeof data.daily_cost === 'number') return data.daily_cost;
    if (typeof data.dailyCost === 'number') return data.dailyCost;
    if (typeof data.data?.daily_cost === 'number') return data.data.daily_cost;
    if (typeof data.data?.dailyCost === 'number') return data.data.dailyCost;

    // Fallback: used_quota / quota_per_unit as approximation
    if (typeof data.data?.used_quota === 'number') {
      const quotaPerUnit = this.quotaPerUnit || this._statusCache?.quota_per_unit || 500000;
      return data.data.used_quota / quotaPerUnit;
    }
    if (typeof data.used_quota === 'number') {
      const quotaPerUnit = this.quotaPerUnit || this._statusCache?.quota_per_unit || 500000;
      return data.used_quota / quotaPerUnit;
    }

    // total_used fallback
    if (typeof data.data?.total_used === 'number') {
      const quotaPerUnit = this.quotaPerUnit || this._statusCache?.quota_per_unit || 500000;
      return data.data.total_used / quotaPerUnit;
    }

    return 0;
  }

  _extractHourlyTokens(data) {
    if (data == null) return 0;
    if (typeof data.hourly_tokens === 'number') return data.hourly_tokens;
    if (typeof data.hourlyTokens === 'number') return data.hourlyTokens;
    if (typeof data.data?.hourly_tokens === 'number') return data.data.hourly_tokens;
    if (typeof data.data?.hourlyTokens === 'number') return data.data.hourlyTokens;
    if (typeof data.total_tokens === 'number') return data.total_tokens;
    if (typeof data.data?.total_tokens === 'number') return data.data.total_tokens;
    return 0;
  }
}

module.exports = {
  NewAPIGatewayAdapter,
  NEWAPI_DEFAULT_PATHS,
};
