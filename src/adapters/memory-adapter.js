const { GatewayAdapter } = require('./gateway-adapter');

class MemoryAdapter extends GatewayAdapter {
  constructor(options = {}) {
    super();
    this.balanceUsd = Number(options.balanceUsd ?? 10);
    this.dailySpentUsd = Number(options.dailySpentUsd ?? 0);
    this.hourlyTokensUsed = Number(options.hourlyTokensUsed ?? 0);
    this.autoRefuelsToday = Number(options.autoRefuelsToday ?? 0);
    this.autoPurchasedUsdToday = Number(options.autoPurchasedUsdToday ?? 0);
    this.codes = new Map(Object.entries(options.codes || { 'DEMO-2026': 10 }));
    this.issuedKeys = [];
    this.docsTemplates = Object.assign(
      {
        quickstart: (data) =>
          `## Quickstart\n\nBase URL: ${data.baseUrl}\nAPI Key: ${data.apiKey}\nRoute: ${data.routeName}`,
        starter: (data) =>
          `## Starter Plan\n\nBase URL: ${data.baseUrl}\nAPI Key: ${data.apiKey}\nAllowed Models: ${(data.allowedModels || []).join(', ')}`,
      },
      options.docsTemplates || {},
    );
  }

  async listModels() {
    return { models: [] };
  }

  async getUsage() {
    return {
      dailySpentUsd: this.dailySpentUsd,
      hourlyTokensUsed: this.hourlyTokensUsed,
      autoRefuelsToday: this.autoRefuelsToday,
      autoPurchasedUsdToday: this.autoPurchasedUsdToday,
    };
  }

  async getBalance() {
    return { availableUsd: this.balanceUsd, balanceUsd: this.balanceUsd };
  }

  async redeemCode({ code }) {
    const creditUsd = this.codes.get(code);
    if (creditUsd === undefined) {
      const error = new Error('Invalid or expired activation code');
      error.status = 400;
      throw error;
    }
    this.balanceUsd += creditUsd;
    this.codes.delete(code);
    return { ok: true, code, creditUsd };
  }

  async issueKey({ owner, group, plan, metadata }) {
    const key = `ak-mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const record = { apiKey: key, owner, group, plan, metadata, createdAt: new Date().toISOString() };
    this.issuedKeys.push(record);
    return record;
  }

  async rotateKey({ apiKey }) {
    const record = this.issuedKeys.find((k) => k.apiKey === apiKey);
    if (!record) {
      const error = new Error('Key not found');
      error.status = 404;
      throw error;
    }
    const newKey = `ak-mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    record.apiKey = newKey;
    record.rotatedAt = new Date().toISOString();
    return record;
  }

  async renderDocs({ template, data }) {
    const renderer = this.docsTemplates[template] || this.docsTemplates.quickstart;
    const markdown = typeof renderer === 'function' ? renderer(data) : String(renderer);
    return { markdown, template };
  }
}

module.exports = {
  MemoryAdapter,
};
