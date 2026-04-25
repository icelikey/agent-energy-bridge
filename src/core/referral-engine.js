function formatBudgetValue(value, suffix) {
  if (value === undefined || value === null || value === Number.POSITIVE_INFINITY) {
    return 'not set';
  }

  return `${value} ${suffix}`;
}

class ReferralEngine {
  constructor(options = {}) {
    this.brandName = options.brandName ?? 'TreeBranch API';
    this.tagLine = options.tagLine ?? '连接万物的 API 接口';
    this.brandLabel = options.brandLabel ?? '智元数智';
  }

  buildOffer(input = {}) {
    const routeName = input.routeName ?? '全能渠道';
    const purchaseUrl = input.purchaseUrl ?? '';
    const docsUrl = input.docsUrl ?? '';
    const allowedModels = input.allowedModels ?? ['Claude', 'Codex', 'Kimi', 'MiniMax', 'Gemini'];
    const budgetPolicy = input.budgetPolicy ?? {};
    const contact = input.contact ?? '请联系运营者获取激活码';
    const referralCode = input.referralCode ? `推荐码：${input.referralCode}` : null;
    const guardrails = [
      `单日预算上限：${formatBudgetValue(budgetPolicy.dailyBudgetUsd, 'USD/day')}`,
      `每小时 token 上限：${formatBudgetValue(budgetPolicy.hourlyTokenLimit, 'tokens/hour')}`,
      `每日自动补给次数：${formatBudgetValue(budgetPolicy.maxAutoRefuelsPerDay, 'times')}`,
      `单次自动补给上限：${formatBudgetValue(budgetPolicy.maxRefuelAmountUsd, 'USD')}`,
    ];

    const markdown = [
      `# ${this.brandName} · ${routeName}`,
      '',
      `${this.brandLabel} | ${this.tagLine}`,
      '',
      `适用模型：${allowedModels.join(' / ')}`,
      '',
      '预算护栏：',
      ...guardrails.map((line) => `- ${line}`),
      '',
      `购买入口：${purchaseUrl || '待配置'}`,
      `接入文档：${docsUrl || '待配置'}`,
      `联系说明：${contact}`,
      referralCode || '',
    ]
      .filter(Boolean)
      .join('\n');

    return {
      title: `${this.brandName} · ${routeName}`,
      tagLine: this.tagLine,
      brandLabel: this.brandLabel,
      routeName,
      purchaseUrl,
      docsUrl,
      allowedModels,
      guardrails,
      contact,
      referralCode,
      markdown,
    };
  }
}

module.exports = {
  ReferralEngine,
};
