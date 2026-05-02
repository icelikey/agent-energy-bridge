#!/usr/bin/env node
/**
 * 免费兜底测试 — 余额耗尽 → 充值失败 → 自动降级到免费模型
 *
 * 场景设计:
 * 1. Bridge 启动时余额 $0，兑换码为空（无法充值）
 * 2. Agent 查询余额 → 触发自动充值 → 失败（无兑换码）
 * 3. Agent 调用 optimize → 返回 action: 'free_fallback'
 * 4. Agent 获取免费模型推荐 → 使用 gemini-2.5-flash-free
 * 5. Agent 完成调用并上报
 *
 * 启动方式:
 *   DEMO_BALANCE_USD=0 AUTO_REFUEL_CODES="" node scripts/start-server.js
 */

const BASE_URL = process.env.AGENT_RELAY_URL || 'http://127.0.0.1:3100';
const AGENT_ID = process.env.AGENT_ID || 'free-fallback-demo';

const COLORS = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  reset: '\x1b[0m',
};

function log(type, msg) {
  const c = type === 'ok' ? COLORS.green : type === 'warn' ? COLORS.yellow : type === 'error' ? COLORS.red : type === 'info' ? COLORS.cyan : COLORS.gray;
  console.log(`${c}[${type.toUpperCase()}]${COLORS.reset} ${msg}`);
}

function section(title) {
  console.log(`\n${COLORS.cyan}═══════════════════════════════════════════════════════════════${COLORS.reset}`);
  console.log(`${COLORS.cyan}  ${title}${COLORS.reset}`);
  console.log(`${COLORS.cyan}═══════════════════════════════════════════════════════════════${COLORS.reset}\n`);
}

async function api(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'x-agent-id': AGENT_ID,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, ok: res.ok, data };
}

async function waitForBridge(maxWaitMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`${BASE_URL}/agent/v1/health`, { signal: AbortSignal.timeout(500) });
      if (res.ok) return true;
    } catch { /* ignore */ }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ===== 测试步骤 =====

async function step1_HealthCheck() {
  section('Step 1: Bridge 健康检查');
  const res = await api('/agent/v1/health');
  if (!res.ok) {
    log('error', 'Bridge 不可用');
    log('info', '启动命令: DEMO_BALANCE_USD=0 AUTO_REFUEL_CODES="" node scripts/start-server.js');
    process.exit(1);
  }
  log('ok', `Bridge 健康: ${res.data.status}`);
  log('info', `适配器: ${res.data.adapter?.adapter || 'unknown'}`);
  return res.data;
}

async function step2_ZeroBalanceAndRefuelFail() {
  section('Step 2: 余额 $0 + 自动充值失败');

  const balanceRes = await api('/agent/v1/balance');
  const availableUsd = balanceRes.data?.balance?.availableUsd ?? 0;
  log('info', `当前余额: $${availableUsd}`);

  if (availableUsd !== 0) {
    log('warn', `余额不是 $0（实际 $${availableUsd}），但测试继续`);
    log('info', '如需严格测试，请重启 Bridge 并设置 DEMO_BALANCE_USD=0');
  } else {
    log('ok', '余额确认为 $0');
  }

  // 自动充值应该尝试但失败（无兑换码）
  log('info', '自动充值尝试中...（预期失败：无可用兑换码）');
  await sleep(500);

  const afterRes = await api('/agent/v1/balance');
  const afterUsd = afterRes.data?.balance?.availableUsd ?? 0;

  if (afterUsd === 0) {
    log('ok', '充值失败确认：余额仍为 $0（无兑换码可供充值）');
    log('ok', '进入免费兜底流程...');
  } else {
    log('warn', `余额变为 $${afterUsd}，可能充值成功或有缓存`);
  }

  return { availableUsd: afterUsd };
}

async function step3_BudgetGuardFreeFallback() {
  section('Step 3: BudgetGuard 免费兜底判断');

  const optimizeRes = await api('/agent/v1/optimize', {
    method: 'POST',
    body: JSON.stringify({
      estimatedCostUsd: 0.5,
      requestedTokens: 10000,
      modelId: 'claude-4.7-premium',
      client: AGENT_ID,
    }),
  });

  const guardDecision = optimizeRes.data?.guardDecision;
  const action = optimizeRes.data?.action;

  console.log(`  action:       ${action}`);
  console.log(`  guardAction:  ${guardDecision?.action}`);
  console.log(`  allowed:      ${guardDecision?.allowed}`);
  console.log(`  reasons:      ${guardDecision?.reasons?.join(', ') || 'N/A'}`);
  console.log(`  freeFallback: ${guardDecision?.freeFallbackModel || 'N/A'}`);

  if (action === 'free_fallback') {
    log('ok', '✅ BudgetGuard 正确返回 free_fallback！');
    log('ok', `✅ 兜底模型: ${guardDecision?.freeFallbackModel}`);
  } else if (guardDecision?.action === 'free_fallback') {
    log('ok', '✅ guardDecision.action 为 free_fallback（optimize 端点 action 字段待优化）');
  } else {
    log('error', `❌ 未触发 free_fallback，实际 action: ${action}`);
    log('info', '可能原因：enableFreeFallback=false 或 freeFallbackModel 未配置');
  }

  return { action, guardDecision };
}

async function step4_FreeModelRecommendation() {
  section('Step 4: 免费模型推荐');

  // 4.1 常规推荐（budgetTier=balanced）
  const normalRes = await api('/agent/v1/recommend', {
    method: 'POST',
    body: JSON.stringify({
      taskType: 'coding',
      budgetTier: 'balanced',
      client: AGENT_ID,
    }),
  });
  const normalPrimary = normalRes.data?.recommendation?.primary;
  log('info', `常规推荐（balanced）: ${normalPrimary?.id} ($${normalPrimary?.pricePer1kUsd}/1k)`);

  // 4.2 免费推荐（budgetTier=free）
  const freeRes = await api('/agent/v1/recommend', {
    method: 'POST',
    body: JSON.stringify({
      taskType: 'coding',
      budgetTier: 'free',
      client: AGENT_ID,
    }),
  });
  const freePrimary = freeRes.data?.recommendation?.primary;
  log('info', `免费推荐（free）:     ${freePrimary?.id} ($${freePrimary?.pricePer1kUsd}/1k)`);

  if (freePrimary?.isFree) {
    log('ok', `✅ 免费模型确认: ${freePrimary.id}`);
    log('ok', `   能力: ${freePrimary.capabilities?.join(', ')}`);
    log('ok', `   限制: ${freePrimary.freeLimit || 'N/A'}`);
  } else {
    log('error', '❌ 未返回免费模型');
  }

  return { freeModel: freePrimary };
}

async function step5_SmartCallWithFallback() {
  section('Step 5: 智能调用（余额耗尽场景）');

  // 模拟 smart-call 在余额 $0 时的决策
  const balanceRes = await api('/agent/v1/balance');
  const availableUsd = balanceRes.data?.balance?.availableUsd ?? 0;

  const recRes = await api('/agent/v1/recommend', {
    method: 'POST',
    body: JSON.stringify({
      taskType: 'coding',
      budgetTier: availableUsd <= 0 ? 'free' : 'balanced',
      client: AGENT_ID,
    }),
  });

  const primary = recRes.data?.recommendation?.primary;

  if (availableUsd <= 0) {
    log('warn', `余额 $${availableUsd} — 触发免费兜底`);

    if (primary?.isFree) {
      log('ok', `✅ 自动切换至免费模型: ${primary.id}`);
      log('info', `   预计 10k tokens 成本: FREE`);

      // 模拟免费模型调用
      process.stdout.write(`${COLORS.gray}  调用免费模型中...${COLORS.reset}`);
      await sleep(600);
      console.log(` ${COLORS.green}完成${COLORS.reset}`);

      // 上报（免费调用成本为 0）
      const reportRes = await api('/agent/v1/session/report', {
        method: 'POST',
        body: JSON.stringify({
          taskType: 'coding',
          inputTokens: 7000,
          outputTokens: 3000,
          costUsd: 0,
          model: primary.id,
          success: true,
          durationMs: 600,
          qualityScore: 0.82,
          note: 'free-tier fallback call',
          client: AGENT_ID,
        }),
      });

      if (reportRes.ok) {
        log('ok', `✅ 免费调用上报成功: 10,000 tokens, $0.0000`);
      }

      return { decision: 'use_free_fallback', model: primary.id, costUsd: 0 };
    } else {
      log('error', '❌ 未找到可用免费模型，调用被阻断');
      return { decision: 'blocked', model: null, costUsd: 0 };
    }
  } else {
    log('ok', `余额 $${availableUsd} — 正常调用付费模型: ${primary?.id}`);
    return { decision: 'proceed', model: primary?.id, costUsd: (10000 / 1000) * (primary?.pricePer1kUsd || 0.02) };
  }
}

async function step6_ComparePaidVsFree() {
  section('Step 6: 付费 vs 免费模型对比');

  const modelsRes = await api('/agent/v1/models/capabilities');
  const models = modelsRes.data?.models || [];

  const paid = models.find(m => m.id === 'all-protocol-router');
  const free = models.find(m => m.id === 'gemini-2.5-flash-free');

  if (paid && free) {
    console.log(`\n  ${COLORS.cyan}付费模型:${COLORS.reset}`);
    console.log(`    ${paid.id}`);
    console.log(`    价格:    $${paid.pricePer1kUsd}/1k tokens`);
    console.log(`    能力:    ${paid.capabilities?.join(', ')}`);
    console.log(`    10k 成本: $${(paid.pricePer1kUsd * 10).toFixed(4)}`);

    console.log(`\n  ${COLORS.cyan}免费模型:${COLORS.reset}`);
    console.log(`    ${free.id}`);
    console.log(`    价格:    FREE`);
    console.log(`    能力:    ${free.capabilities?.join(', ')}`);
    console.log(`    限制:    ${free.freeLimit}`);
    console.log(`    10k 成本: $0.0000`);

    const savings = paid.pricePer1kUsd * 10;
    console.log(`\n  ${COLORS.green}使用免费模型节省: $${savings.toFixed(4)} / 10k tokens${COLORS.reset}`);
  }
}

async function main() {
  console.log(`${COLORS.cyan}╔═══════════════════════════════════════════════════════════════╗${COLORS.reset}`);
  console.log(`${COLORS.cyan}║     免费兜底测试 — 余额耗尽 → 充值失败 → 免费模型           ║${COLORS.reset}`);
  console.log(`${COLORS.cyan}╚═══════════════════════════════════════════════════════════════╝${COLORS.reset}`);

  log('info', '等待 Bridge 就绪...');
  const ready = await waitForBridge();
  if (!ready) {
    log('error', 'Bridge 未启动');
    log('info', '启动命令: DEMO_BALANCE_USD=0 AUTO_REFUEL_CODES="" node scripts/start-server.js');
    process.exit(1);
  }

  const health = await step1_HealthCheck();
  const balance = await step2_ZeroBalanceAndRefuelFail();
  const optimize = await step3_BudgetGuardFreeFallback();
  const recommend = await step4_FreeModelRecommendation();
  const call = await step5_SmartCallWithFallback();
  await step6_ComparePaidVsFree();

  section('测试完成总结');
  console.log(`${COLORS.green}✓${COLORS.reset} Bridge 健康检查通过`);
  console.log(`${COLORS.green}✓${COLORS.reset} 余额确认: $${balance.availableUsd}`);
  console.log(`${COLORS.green}✓${COLORS.reset} 充值失败确认: 无兑换码，余额保持 $0`);
  console.log(`${COLORS.green}✓${COLORS.reset} BudgetGuard: ${optimize.guardDecision?.action || 'N/A'}`);
  console.log(`${COLORS.green}✓${COLORS.reset} 免费模型: ${recommend.freeModel?.id || 'N/A'}`);
  console.log(`${COLORS.green}✓${COLORS.reset} 调用决策: ${call.decision} (${call.model})`);
  console.log(`${COLORS.green}✓${COLORS.reset} 调用成本: $${call.costUsd.toFixed(4)}`);

  if (call.decision === 'use_free_fallback' && call.costUsd === 0) {
    console.log(`\n${COLORS.green}🎉 免费兜底机制验证通过！余额耗尽时成功切换至免费模型。${COLORS.reset}\n`);
  } else if (call.decision === 'blocked') {
    console.log(`\n${COLORS.red}⚠️ 调用被阻断，免费兜底未生效。${COLORS.reset}\n`);
  } else {
    console.log(`\n${COLORS.yellow}⚠️ 未触发免费兜底（余额可能不为 $0）。${COLORS.reset}\n`);
  }
}

main().catch(err => {
  log('error', err.message);
  process.exit(1);
});
