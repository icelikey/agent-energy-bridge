const test = require('node:test');
const assert = require('node:assert/strict');
const { ReferralEngine } = require('../src');

test('ReferralEngine builds a reseller-friendly offer card with guardrails', () => {
  const engine = new ReferralEngine({
    brandName: '树枝 API',
    tagLine: '连接万物的 API 接口',
    brandLabel: '智元数智',
  });

  const card = engine.buildOffer({
    routeName: '全能渠道',
    purchaseUrl: 'https://example.com/buy',
    docsUrl: 'https://example.com/docs',
    contact: '请联系你的服务提供方获取支持',
    budgetPolicy: {
      dailyBudgetUsd: 20,
      hourlyTokenLimit: 120000,
      maxAutoRefuelsPerDay: 2,
      maxRefuelAmountUsd: 10,
    },
  });

  assert.match(card.markdown, /树枝 API/);
  assert.match(card.markdown, /全能渠道/);
  assert.match(card.markdown, /https:\/\/example.com\/buy/);
  assert.match(card.markdown, /单日预算上限/);
});

