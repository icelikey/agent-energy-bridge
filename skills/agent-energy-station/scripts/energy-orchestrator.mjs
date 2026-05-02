#!/usr/bin/env node
/**
 * Agent Energy Orchestrator
 *
 * 核心能力：
 * 1. 成本透明 — 显示余额、预计成本、剩余可调用次数
 * 2. 智能推荐 — 根据余额自动推荐模型（含免费 fallback）
 * 3. 自动充值 — 低余额时尝试自动补给
 * 4. 路由健康 — 检查线路可用性，不可用时自动切换
 * 5. 任务闭环 — 调用前预算判断 → 调用 → 上报消耗 → 优化下次推荐
 */

const BASE_URL = process.env.AGENT_RELAY_URL || 'http://127.0.0.1:3100';
const AGENT_ID = process.env.AGENT_ID || 'agent-energy-station';

const COST_COLORS = {
  safe: '\x1b[32m',    // green
  warn: '\x1b[33m',    // yellow
  danger: '\x1b[31m',  // red
  free: '\x1b[36m',    // cyan
  reset: '\x1b[0m',
};

async function api(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'x-agent-id': AGENT_ID,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: response.status, ok: response.ok, data };
}

function formatCost(usd) {
  if (usd === 0) return 'FREE';
  if (usd < 0.001) return '<$0.001';
  return `$${usd.toFixed(4)}`;
}

function costColor(availableUsd, estimatedCostUsd) {
  if (availableUsd <= 0) return COST_COLORS.danger;
  if (availableUsd < estimatedCostUsd * 3) return COST_COLORS.warn;
  return COST_COLORS.safe;
}

// ===== 1. 成本透明 =====
async function checkCost({ estimatedTokens = 0, modelPricePer1k = 0 } = {}) {
  const [balanceRes, usageRes, recommendRes] = await Promise.all([
    api('/agent/v1/balance'),
    api('/agent/v1/usage/summary'),
    api('/agent/v1/recommend', {
      method: 'POST',
      body: JSON.stringify({ taskType: 'coding', budgetTier: 'balanced', client: AGENT_ID }),
    }),
  ]);

  const availableUsd = balanceRes.data?.balance?.availableUsd ?? 0;
  const dailySpentUsd = usageRes.data?.usage?.dailySpentUsd ?? 0;
  const estimatedCostUsd = (estimatedTokens / 1000) * (modelPricePer1k || recommendRes.data?.recommendation?.primary?.pricePer1kUsd || 0.02);
  const remainingCalls = estimatedCostUsd > 0 ? Math.floor(availableUsd / estimatedCostUsd) : Infinity;
  const color = costColor(availableUsd, estimatedCostUsd);

  const report = {
    type: 'cost_report',
    timestamp: new Date().toISOString(),
    balance: {
      availableUsd,
      dailySpentUsd,
      remainingBudgetUsd: Math.max(0, (balanceRes.data?.balance?.dailyBudgetUsd || Infinity) - dailySpentUsd),
    },
    currentTask: {
      estimatedTokens,
      modelPricePer1k: modelPricePer1k || recommendRes.data?.recommendation?.primary?.pricePer1kUsd || 0.02,
      estimatedCostUsd,
    },
    projections: {
      remainingCalls: remainingCalls === Infinity ? 'unlimited' : remainingCalls,
      canAfford: availableUsd >= estimatedCostUsd,
      riskLevel: availableUsd <= 0 ? 'critical' : availableUsd < estimatedCostUsd * 3 ? 'warning' : 'safe',
    },
    recommendedModel: recommendRes.data?.recommendation?.primary || null,
  };

  // Console output for human readability
  console.log(`\n${color}========== 成本透明报告 ==========${COST_COLORS.reset}`);
  console.log(`当前余额:     ${formatCost(availableUsd)}`);
  console.log(`今日已消耗:   ${formatCost(dailySpentUsd)}`);
  console.log(`预计成本:     ${formatCost(estimatedCostUsd)} (${estimatedTokens} tokens)`);
  console.log(`剩余可调用:   ${remainingCalls === Infinity ? '∞' : remainingCalls + ' 次'}`);
  console.log(`风险等级:     ${report.projections.riskLevel.toUpperCase()}`);

  if (report.projections.riskLevel === 'critical') {
    console.log(`${COST_COLORS.danger}【警告】余额已耗尽！建议立即切换到免费模型或充值。${COST_COLORS.reset}`);
  } else if (report.projections.riskLevel === 'warning') {
    console.log(`${COST_COLORS.warn}【提示】余额紧张，建议压缩上下文或切换 cheaper 模型。${COST_COLORS.reset}`);
  }

  console.log(`推荐模型:     ${report.recommendedModel?.id || 'N/A'} (${formatCost(report.recommendedModel?.pricePer1kUsd || 0)}/1k tokens)`);

  return report;
}

// ===== 2. 智能推荐（含免费 fallback）=====
async function recommendWithFallback({ taskType = 'coding', protocol = 'openai', budgetTier = 'balanced' } = {}) {
  const res = await api('/agent/v1/recommend', {
    method: 'POST',
    body: JSON.stringify({ taskType, protocol, budgetTier, client: AGENT_ID }),
  });

  const primary = res.data?.recommendation?.primary || null;
  const fallback = res.data?.recommendation?.fallback || null;

  // Also request free-tier recommendation as ultimate fallback
  const freeRes = await api('/agent/v1/recommend', {
    method: 'POST',
    body: JSON.stringify({ taskType, protocol, budgetTier: 'free', client: AGENT_ID }),
  });
  const freeFallback = freeRes.data?.recommendation?.primary || null;

  const report = {
    type: 'recommendation',
    primary,
    fallback,
    freeFallback,
    strategy: primary?.isFree ? 'free_mode' : fallback?.isFree ? 'has_free_fallback' : 'paid_only',
  };

  console.log(`\n========== 模型推荐 ==========`);
  console.log(`主选:    ${primary?.id || 'N/A'} (${formatCost(primary?.pricePer1kUsd || 0)}/1k)`);
  console.log(`降级:    ${fallback?.id || 'N/A'} (${formatCost(fallback?.pricePer1kUsd || 0)}/1k)`);
  console.log(`免费兜底: ${freeFallback?.id || 'N/A'} (${formatCost(freeFallback?.pricePer1kUsd || 0)}/1k)`);

  if (freeFallback) {
    console.log(`${COST_COLORS.free}【免费兜底】余额不足时可自动切换至 ${freeFallback.id}${COST_COLORS.reset}`);
  }

  return report;
}

// ===== 3. 自动充值 =====
async function autoRefuel({ thresholdUsd = 1, codes = [] } = {}) {
  const balanceRes = await api('/agent/v1/balance');
  const availableUsd = balanceRes.data?.balance?.availableUsd ?? 0;

  console.log(`\n========== 自动充值检查 ==========`);
  console.log(`当前余额: ${formatCost(availableUsd)}`);
  console.log(`充值阈值: ${formatCost(thresholdUsd)}`);

  if (availableUsd > thresholdUsd) {
    console.log('余额充足，无需充值。');
    return { type: 'refuel_check', action: 'skip', reason: 'balance_above_threshold', availableUsd };
  }

  // Try redeem codes
  for (const code of codes) {
    console.log(`尝试兑换码: ${code}...`);
    const res = await api('/agent/v1/refuel/redeem', {
      method: 'POST',
      body: JSON.stringify({ code, client: AGENT_ID }),
    });
    if (res.ok && res.data?.ok) {
      console.log(`${COST_COLORS.safe}充值成功! +${formatCost(res.data?.creditUsd || 0)}${COST_COLORS.reset}`);
      return { type: 'refuel', action: 'redeemed', code, result: res.data };
    }
    console.log(`兑换码 ${code} 失败: ${res.data?.message || 'unknown error'}`);
  }

  console.log(`${COST_COLORS.warn}所有兑换码已尝试，未能充值。建议手动充值或切换免费模型。${COST_COLORS.reset}`);
  return { type: 'refuel', action: 'failed', reason: 'all_codes_exhausted', availableUsd };
}

// ===== 4. 路由健康检查 =====
async function checkRouteHealth({ routes = [] } = {}) {
  console.log(`\n========== 路由健康检查 ==========`);

  const healthRes = await api('/agent/v1/health');
  const isBridgeHealthy = healthRes.ok;
  console.log(`Bridge 状态: ${isBridgeHealthy ? '✅ 健康' : '❌ 不可用'}`);

  // Check model list as proxy for route health
  const modelsRes = await api('/agent/v1/models/capabilities');
  const hasModels = modelsRes.ok && Array.isArray(modelsRes.data?.models);
  console.log(`模型路由:    ${hasModels ? '✅ 可用' : '❌ 异常'}`);

  // Check balance/usage endpoints
  const balanceRes = await api('/agent/v1/balance');
  const hasBalance = balanceRes.ok;
  console.log(`余额查询:    ${hasBalance ? '✅ 可用' : '❌ 异常'}`);

  const report = {
    type: 'route_health',
    bridge: isBridgeHealthy ? 'healthy' : 'unavailable',
    models: hasModels ? 'available' : 'degraded',
    balance: hasBalance ? 'available' : 'degraded',
    overall: isBridgeHealthy && hasModels && hasBalance ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
  };

  if (report.overall !== 'healthy') {
    console.log(`${COST_COLORS.warn}【告警】部分服务异常，建议检查中转站状态或切换备用路由。${COST_COLORS.reset}`);
  }

  return report;
}

// ===== 5. 任务闭环：调用前预算 → 执行 → 上报 =====
async function smartCall({ taskType = 'coding', estimatedTokens = 10000, modelPricePer1k = 0, protocol = 'openai' } = {}) {
  console.log(`\n========== 智能调用流程 ==========`);

  // Step 1: 成本检查
  const costReport = await checkCost({ estimatedTokens, modelPricePer1k });

  // Step 2: 获取推荐（含免费 fallback）
  const rec = await recommendWithFallback({ taskType, protocol, budgetTier: costReport.projections.riskLevel === 'critical' ? 'free' : 'balanced' });

  // Step 3: 预算判断
  if (costReport.projections.riskLevel === 'critical') {
    // Try auto-refuel first
    const refuel = await autoRefuel({ thresholdUsd: 0 });
    if (refuel.action !== 'redeemed') {
      console.log(`${COST_COLORS.free}【自动切换】使用免费模型: ${rec.freeFallback?.id}${COST_COLORS.reset}`);
      return {
        type: 'smart_call',
        decision: 'use_free_fallback',
        model: rec.freeFallback,
        costReport,
        reason: 'balance_depleted_and_refuel_failed',
      };
    }
  }

  if (!costReport.projections.canAfford) {
    console.log(`${COST_COLORS.warn}【降级建议】余额不足以支付主选模型，建议切换至: ${rec.fallback?.id}${COST_COLORS.reset}`);
    return {
      type: 'smart_call',
      decision: 'downgrade',
      model: rec.fallback || rec.freeFallback,
      costReport,
      reason: 'insufficient_balance_for_primary',
    };
  }

  // Step 4: 允许执行
  console.log(`${COST_COLORS.safe}【允许执行】使用模型: ${rec.primary?.id}${COST_COLORS.reset}`);
  return {
    type: 'smart_call',
    decision: 'proceed',
    model: rec.primary,
    fallback: rec.fallback,
    freeFallback: rec.freeFallback,
    costReport,
  };
}

// ===== CLI =====
const COMMANDS = {
  'check-cost': checkCost,
  recommend: recommendWithFallback,
  'auto-refuel': autoRefuel,
  health: checkRouteHealth,
  'smart-call': smartCall,
};

async function checkBridgeAlive() {
  try {
    const res = await fetch(`${BASE_URL}/agent/v1/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  // Bridge 健康检测
  const isAlive = await checkBridgeAlive();
  if (!isAlive) {
    console.log('\n\x1b[31m[错误] Bridge 服务端未运行！\x1b[0m');
    console.log('\n\x1b[33m请先启动 Bridge：\x1b[0m');
    console.log('  node start-bridge.mjs              # 演示模式（零配置）');
    console.log('  node start-bridge.mjs --newapi     # 真实 NewAPI 模式');
    console.log('\n\x1b[33m或手动启动：\x1b[0m');
    console.log('  cd ../../  # 回到项目根目录');
    console.log('  node scripts/start-server.js');
    console.log('\n\x1b[36m提示：演示模式无需任何配置，启动即用。\x1b[0m\n');
    process.exit(1);
  }

  const cmd = process.argv[2] || 'smart-call';
  const handler = COMMANDS[cmd];

  if (!handler) {
    console.error(`未知命令: ${cmd}`);
    console.error('可用命令:', Object.keys(COMMANDS).join(', '));
    process.exit(1);
  }

  // Parse simple args
  const args = {};
  for (let i = 3; i < process.argv.length; i += 2) {
    const key = process.argv[i].replace(/^--/, '');
    const val = process.argv[i + 1];
    if (key && val !== undefined) {
      args[key] = isNaN(Number(val)) ? val : Number(val);
    }
  }

  const result = await handler(args);
  console.log(`\n--- JSON 输出 ---`);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
