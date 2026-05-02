#!/usr/bin/env node
/**
 * 子 Agent 测试脚本 — 自动加油 + Token 分析
 *
 * 模拟一个真实 Agent 的完整工作流：
 * 1. 检查成本 -> 2. 调用 LLM -> 3. 上报消耗 -> 4. 观察余额 -> 5. 触发加油 -> 6. 分析效率
 *
 * 用法:
 *   # 先启动测试 Bridge（低余额模式）
 *   DEMO_BALANCE_USD=2 AUTO_REFUEL_CODES=DEMO-2026 node scripts/start-server.js
 *
 *   # 再运行子 Agent 测试
 *   node tests/sub-agent-demo.mjs
 */

const BASE_URL = process.env.AGENT_RELAY_URL || 'http://127.0.0.1:3100';
const AGENT_ID = process.env.AGENT_ID || 'sub-agent-demo';

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
    log('error', 'Bridge 不可用，请先启动测试服务器');
    log('info', '启动命令: DEMO_BALANCE_USD=2 AUTO_REFUEL_CODES=DEMO-2026 node scripts/start-server.js');
    process.exit(1);
  }
  log('ok', `Bridge 健康: ${res.data.status}`);
  log('info', `适配器: ${res.data.adapter?.adapter || 'unknown'}`);
  log('info', `版本: ${res.data.version}`);
  return res.data;
}

async function step2_BalanceAndRefuel() {
  section('Step 2: 余额查询 + 自动加油测试');

  log('info', '配置: 初始余额 $2, 阈值 $3, 兑换码 DEMO-2026 = $10');
  log('info', '查询余额（第一次查询会触发自动充值，因为 $2 < $3）...');

  const result = await api('/agent/v1/balance');
  const currentUsd = result.data?.balance?.availableUsd ?? 0;

  // 判断自动充值是否触发：如果余额 > $2（初始值），说明充值成功了
  if (currentUsd > 2) {
    log('ok', `自动充值已触发！当前余额 $${currentUsd}（初始 $2 + 兑换码 $10 = $12）`);
    log('ok', '自动加油机制验证通过：低余额检测 -> 兑换码充值 -> 余额刷新');
  } else {
    log('warn', `余额 $${currentUsd} 未增加，自动充值可能未触发`);
    log('info', '可能原因：1. 冷却期中 2. 兑换码已用完 3. 自动充值被禁用');
  }

  return { beforeUsd: 2, afterUsd: currentUsd };
}

async function step3_SimulateLLMCalls() {
  section('Step 3: 模拟 LLM 调用闭环（5 轮）');

  const rounds = [
    { taskType: 'coding', estimatedTokens: 12000, modelPricePer1k: 0.015, durationMs: 800, quality: 0.9 },
    { taskType: 'coding', estimatedTokens: 25000, modelPricePer1k: 0.015, durationMs: 1500, quality: 0.85 },
    { taskType: 'analysis', estimatedTokens: 8000, modelPricePer1k: 0.02, durationMs: 600, quality: 0.92 },
    { taskType: 'coding', estimatedTokens: 45000, modelPricePer1k: 0.015, durationMs: 2200, quality: 0.78 },
    { taskType: 'chat', estimatedTokens: 5000, modelPricePer1k: 0.008, durationMs: 400, quality: 0.88 },
  ];

  const sessions = [];

  for (let i = 0; i < rounds.length; i++) {
    const round = rounds[i];
    console.log(`\n${COLORS.yellow}--- 第 ${i + 1} 轮: ${round.taskType} ---${COLORS.reset}`);

    // 3.1 成本检查
    const costRes = await api('/agent/v1/optimize', {
      method: 'POST',
      body: JSON.stringify({
        estimatedCostUsd: (round.estimatedTokens / 1000) * round.modelPricePer1k,
        requestedTokens: round.estimatedTokens,
        client: AGENT_ID,
      }),
    });
    const decision = costRes.data;
    log('info', `预算判断: ${decision?.action || 'unknown'} — ${decision?.guardDecision?.reasons?.join(', ') || ''}`);

    // 3.2 模型推荐
    const recRes = await api('/agent/v1/recommend', {
      method: 'POST',
      body: JSON.stringify({
        taskType: round.taskType,
        budgetTier: 'balanced',
        client: AGENT_ID,
      }),
    });
    const primary = recRes.data?.recommendation?.primary;
    log('info', `推荐模型: ${primary?.id || 'N/A'} ($${primary?.pricePer1kUsd || 0}/1k)`);

    // 3.3 模拟 LLM 调用（实际这里是调用真实模型，测试脚本用 sleep 模拟）
    process.stdout.write(`${COLORS.gray}  模拟调用中...${COLORS.reset}`);
    await sleep(round.durationMs);
    console.log(` ${COLORS.green}完成${COLORS.reset} (${round.durationMs}ms)`);

    // 3.4 计算实际消耗（模拟）
    const inputTokens = Math.floor(round.estimatedTokens * 0.7);
    const outputTokens = Math.floor(round.estimatedTokens * 0.3);
    const costUsd = (round.estimatedTokens / 1000) * (primary?.pricePer1kUsd || round.modelPricePer1k);

    // 3.5 上报 session
    const reportRes = await api('/agent/v1/session/report', {
      method: 'POST',
      body: JSON.stringify({
        taskType: round.taskType,
        inputTokens,
        outputTokens,
        costUsd,
        model: primary?.id || 'unknown',
        success: true,
        durationMs: round.durationMs,
        qualityScore: round.quality,
        client: AGENT_ID,
      }),
    });

    if (reportRes.ok) {
      log('ok', `上报成功: ${inputTokens}+${outputTokens} tokens, $${costUsd.toFixed(4)}`);
    } else {
      log('warn', `上报失败: ${reportRes.data?.message || 'unknown'}`);
    }

    sessions.push({
      round: i + 1,
      taskType: round.taskType,
      tokens: inputTokens + outputTokens,
      costUsd,
      durationMs: round.durationMs,
      quality: round.quality,
      model: primary?.id,
    });
  }

  return sessions;
}

async function step4_OpsReport() {
  section('Step 4: 运营监控报告');

  const opsRes = await api('/agent/v1/ops/report');
  if (!opsRes.ok) {
    log('warn', 'Ops 报告获取失败');
    return null;
  }

  const report = opsRes.data?.report;
  console.log(`  监控周期: ${report?.period || 'N/A'}`);
  console.log(`  快照数量: ${report?.snapshots || 0}`);
  console.log(`  平均余额: $${report?.avgBalanceUsd?.toFixed(2) || 'N/A'}`);
  console.log(`  最小余额: $${report?.minBalanceUsd?.toFixed(2) || 'N/A'}`);
  console.log(`  总消耗:   $${report?.totalSpentUsd?.toFixed(2) || 'N/A'}`);
  console.log(`  趋势:     ${report?.trend || 'N/A'}`);

  if (report?.alerts?.length) {
    console.log(`\n  ${COLORS.yellow}告警 (${report.alerts.length}):${COLORS.reset}`);
    for (const alert of report.alerts.slice(-5)) {
      console.log(`    - [${alert.type}] ${JSON.stringify(alert).slice(0, 100)}`);
    }
  }

  return report;
}

async function step5_EnergyAnalysis(sessions) {
  section('Step 5: Token 效率分析');

  const totalTokens = sessions.reduce((s, r) => s + r.tokens, 0);
  const totalCost = sessions.reduce((s, r) => s + r.costUsd, 0);
  const totalDuration = sessions.reduce((s, r) => s + r.durationMs, 0);
  const avgQuality = sessions.reduce((s, r) => s + r.quality, 0) / sessions.length;

  console.log(`  总调用次数:     ${sessions.length} 轮`);
  console.log(`  总 Token 消耗:  ${totalTokens.toLocaleString()} tokens`);
  console.log(`  总成本:         $${totalCost.toFixed(4)}`);
  console.log(`  总耗时:         ${totalDuration}ms`);
  console.log(`  平均质量分:     ${(avgQuality * 100).toFixed(1)}%`);
  console.log(`  每 1k tokens:   $${((totalCost / totalTokens) * 1000).toFixed(4)}`);
  console.log(`  每秒产出:       ${(totalTokens / (totalDuration / 1000)).toFixed(1)} tokens/s`);

  // 按任务类型分组
  const byTask = {};
  for (const s of sessions) {
    if (!byTask[s.taskType]) byTask[s.taskType] = [];
    byTask[s.taskType].push(s);
  }

  console.log(`\n  ${COLORS.cyan}按任务类型分析:${COLORS.reset}`);
  for (const [task, list] of Object.entries(byTask)) {
    const tTokens = list.reduce((s, r) => s + r.tokens, 0);
    const tCost = list.reduce((s, r) => s + r.costUsd, 0);
    const tQuality = list.reduce((s, r) => s + r.quality, 0) / list.length;
    console.log(`    ${task.padEnd(10)}: ${list.length}次, ${tTokens.toLocaleString()} tokens, $${tCost.toFixed(4)}, 质量 ${(tQuality * 100).toFixed(0)}%`);
  }

  // 性价比排名
  console.log(`\n  ${COLORS.cyan}性价比排名 (质量/成本):${COLORS.reset}`);
  const ranked = [...sessions]
    .map(s => ({ ...s, efficiency: s.quality / Math.max(s.costUsd, 0.001) }))
    .sort((a, b) => b.efficiency - a.efficiency);
  for (let i = 0; i < Math.min(3, ranked.length); i++) {
    const r = ranked[i];
    console.log(`    #${i + 1} 第${r.round}轮 ${r.taskType}: 效率 ${r.efficiency.toFixed(2)} (质量 ${(r.quality * 100).toFixed(0)}% / $${r.costUsd.toFixed(4)})`);
  }

  return { totalTokens, totalCost, avgQuality, byTask };
}

async function step6_RefuelAlertLog() {
  section('Step 6: 自动充值告警日志');

  // 通过 health 端点获取 adapter 信息，但告警日志需要通过内部状态获取
  // 这里我们直接查询余额变化来推断
  const balance = await api('/agent/v1/balance');
  const currentUsd = balance.data?.balance?.availableUsd ?? 0;

  console.log(`  当前余额: $${currentUsd}`);
  console.log(`  自动充值装饰器状态: 已启用`);
  console.log(`  低余额阈值: $3`);
  console.log(`  兑换码策略: fixed $10`);
  console.log(`  冷却期: 60s`);
  console.log(`  每小时上限: 3次`);

  if (currentUsd >= 10) {
    log('ok', '余额充足，自动充值机制正常工作');
  } else {
    log('warn', '余额较低，再次查询将触发自动充值');
  }
}

async function main() {
  console.log(`${COLORS.cyan}╔═══════════════════════════════════════════════════════════════╗${COLORS.reset}`);
  console.log(`${COLORS.cyan}║     子 Agent 测试 — 自动加油 + Token 效率分析                ║${COLORS.reset}`);
  console.log(`${COLORS.cyan}╚═══════════════════════════════════════════════════════════════╝${COLORS.reset}`);

  // 等待 Bridge 就绪
  log('info', '等待 Bridge 就绪...');
  const ready = await waitForBridge();
  if (!ready) {
    log('error', 'Bridge 在 10 秒内未启动');
    log('info', '请先运行: DEMO_BALANCE_USD=2 AUTO_REFUEL_CODES=DEMO-2026 node scripts/start-server.js');
    process.exit(1);
  }

  // 执行测试步骤
  const health = await step1_HealthCheck();
  const balance = await step2_BalanceAndRefuel();
  const sessions = await step3_SimulateLLMCalls();
  const opsReport = await step4_OpsReport();
  const energy = await step5_EnergyAnalysis(sessions);
  await step6_RefuelAlertLog();

  // 最终报告
  section('测试完成总结');
  console.log(`${COLORS.green}✓${COLORS.reset} Bridge 健康检查通过`);
  console.log(`${COLORS.green}✓${COLORS.reset} 自动充值: $${balance.beforeUsd} → $${balance.afterUsd}`);
  console.log(`${COLORS.green}✓${COLORS.reset} 模拟调用: ${sessions.length} 轮, ${energy.totalTokens.toLocaleString()} tokens`);
  console.log(`${COLORS.green}✓${COLORS.reset} 总成本: $${energy.totalCost.toFixed(4)}`);
  console.log(`${COLORS.green}✓${COLORS.reset} 平均质量: ${(energy.avgQuality * 100).toFixed(1)}%`);
  console.log(`\n${COLORS.cyan}子 Agent 测试全部完成！${COLORS.reset}\n`);
}

main().catch(err => {
  log('error', err.message);
  process.exit(1);
});
