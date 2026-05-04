#!/usr/bin/env node
/**
 * Claude Code Energy Guard Hook
 *
 * 在 Claude Code 提交用户 prompt 前执行，检查 Agent Energy Bridge 余额状态。
 * 如果余额不足，输出警告信息注入到 Claude 的上下文中。
 *
 * 使用方式：在 ~/.claude/settings.json 中添加：
 *   "hooks": {
 *     "user-prompt-submit": "node /path/to/claude-energy-guard.mjs"
 *   }
 */

const BASE_URL = process.env.AGENT_RELAY_URL || 'http://127.0.0.1:3100';
const AGENT_ID = process.env.AGENT_ID || 'claude-code-main';

const COST_COLORS = {
  safe: '\x1b[32m',
  warn: '\x1b[33m',
  danger: '\x1b[31m',
  reset: '\x1b[0m',
};

async function api(path, options = {}) {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        'x-agent-id': AGENT_ID,
        'content-type': 'application/json',
        ...(options.headers || {}),
      },
      signal: AbortSignal.timeout(3000),
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: null };
  }
}

async function main() {
  // Read the user's prompt from stdin (Claude Code passes it via stdin)
  let userPrompt = '';
  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    userPrompt = Buffer.concat(chunks).toString('utf-8').trim();
  }

  // Quick check: skip for short/simple prompts
  if (userPrompt.length < 50) {
    process.exit(0);
  }

  // Query bridge
  const [healthRes, balanceRes, usageRes] = await Promise.all([
    api('/agent/v1/health'),
    api('/agent/v1/balance'),
    api('/agent/v1/usage/summary'),
  ]);

  if (!healthRes.ok) {
    console.error(`${COST_COLORS.warn}[Energy Guard] Bridge 不可用，跳过检查。${COST_COLORS.reset}`);
    process.exit(0);
  }

  const availableUsd = balanceRes.data?.balance?.availableUsd ?? 0;
  const dailySpentUsd = usageRes.data?.usage?.dailySpentUsd ?? 0;

  // Estimate if this prompt is "expensive"
  // Rough heuristic: 1 token ≈ 4 chars for English, 2 chars for CJK
  const estimatedTokens = Math.ceil(userPrompt.length / 2);
  const avgPricePer1k = 0.015; // average model price
  const estimatedCostUsd = (estimatedTokens / 1000) * avgPricePer1k;

  const riskLevel = availableUsd <= 0 ? 'critical' : availableUsd < estimatedCostUsd * 3 ? 'warning' : 'safe';

  if (riskLevel === 'safe') {
    // No warning needed
    process.exit(0);
  }

  // Output warning to stderr so Claude sees it in context
  if (riskLevel === 'critical') {
    console.error(`
${COST_COLORS.danger}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COST_COLORS.reset}
${COST_COLORS.danger}⚠️  [Energy Guard] 余额已耗尽！${COST_COLORS.reset}
${COST_COLORS.danger}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COST_COLORS.reset}
  当前余额:     $${availableUsd.toFixed(4)}
  今日已消耗:   $${dailySpentUsd.toFixed(4)}
  本次预估:     $${estimatedCostUsd.toFixed(4)} (${estimatedTokens} tokens)

  建议操作:
  1. 切换到免费模型 (gemini-2.5-flash-free)
  2. 或运行充值: node skills/agent-energy-station/scripts/energy-orchestrator.mjs auto-refuel
${COST_COLORS.danger}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COST_COLORS.reset}
`);
  } else {
    console.error(`
${COST_COLORS.warn}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COST_COLORS.reset}
${COST_COLORS.warn}⚠️  [Energy Guard] 余额紧张${COST_COLORS.reset}
${COST_COLORS.warn}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COST_COLORS.reset}
  当前余额:     $${availableUsd.toFixed(4)}
  本次预估:     $${estimatedCostUsd.toFixed(4)} (${estimatedTokens} tokens)
  剩余可调用:   ${estimatedCostUsd > 0 ? Math.floor(availableUsd / estimatedCostUsd) : '∞'} 次

  建议操作:
  1. 压缩上下文减少 token 数
  2. 切换到 cheaper 模型
  3. 运行充值: node skills/agent-energy-station/scripts/energy-orchestrator.mjs auto-refuel
${COST_COLORS.warn}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COST_COLORS.reset}
`);
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
