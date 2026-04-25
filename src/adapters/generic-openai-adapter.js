const { GatewayAdapter } = require('./gateway-adapter');

const DEFAULT_PATHS = Object.freeze({
  models: '/v1/models',
  usage: '/v1/usage',
  balance: '/v1/balance',
  redeem: '/v1/refuel/redeem',
  issueKey: '/v1/keys/issue',
  rotateKey: '/v1/keys/rotate',
  docs: '/v1/docs/render',
});

function normalizePath(path) {
  return path.startsWith('/') ? path : `/${path}`;
}

function appendQuery(url, query = {}) {
  const search = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  });

  const renderedQuery = search.toString();
  return renderedQuery ? `${url}?${renderedQuery}` : url;
}

class GenericOpenAIGatewayAdapter extends GatewayAdapter {
  constructor(config = {}) {
    super();

    if (!config.baseUrl) {
      throw new Error('baseUrl is required for GenericOpenAIGatewayAdapter');
    }

    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey ?? null;
    this.transport = config.transport ?? null;
    this.paths = Object.fromEntries(
      Object.entries({ ...DEFAULT_PATHS, ...(config.paths || {}) }).map(([key, value]) => [key, normalizePath(value)]),
    );
  }

  async request({ method = 'GET', path, query, body, headers = {} }) {
    const url = appendQuery(`${this.baseUrl}${normalizePath(path)}`, query);
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

    if (this.transport) {
      return this.transport({ method, url, headers: requestHeaders, body });
    }

    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};

    if (!response.ok) {
      const error = new Error(`Gateway request failed with status ${response.status}`);
      error.status = response.status;
      error.body = data;
      throw error;
    }

    return data;
  }

  async listModels() {
    return this.request({ path: this.paths.models });
  }

  async getUsage(identity = {}) {
    return this.request({ path: this.paths.usage, query: identity });
  }

  async getBalance(identity = {}) {
    return this.request({ path: this.paths.balance, query: identity });
  }

  async redeemCode(payload = {}) {
    return this.request({ method: 'POST', path: this.paths.redeem, body: payload });
  }

  async issueKey(payload = {}) {
    return this.request({ method: 'POST', path: this.paths.issueKey, body: payload });
  }

  async rotateKey(payload = {}) {
    return this.request({ method: 'POST', path: this.paths.rotateKey, body: payload });
  }

  async renderDocs(payload = {}) {
    return this.request({ method: 'POST', path: this.paths.docs, body: payload });
  }
}

module.exports = {
  GenericOpenAIGatewayAdapter,
  DEFAULT_PATHS,
};
