#!/usr/bin/env node
/**
 * OpenClaw Cost Guard Daemon
 *
 * 同步 Agent Energy Bridge 余额状态到 OpenClaw 环境。
 * 当余额不足时，自动切换 OpenClaw 模型配置到免费模式。
 *
 * 使用方式:
 *   node scripts/openclaw-cost-guard.mjs watch          # 守护模式（每30秒检查）
 *   node scripts/openclaw-cost-guard.mjs status         # 单次状态查询
 *   node scripts/openclaw-cost-guard.mjs switch-free    # 强制切换到免费模式
 *   node scripts/openclaw-cost-guard.mjs switch-normal  # 恢复普通模式
 *
 * 集成 OpenClaw Cron:
 *   添加 cron job: 每1分钟运行 `node scripts/openclaw-cost-guard.mjs sync`
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.AGENT_RELAY_URL || 'http://127.0.0.1:3100';
const AGENT_ID = process.env.AGENT_ID || 'openclaw-cost-guard';
const OPENCLAW_DIR = process.env.OPENCLAW_DIR || path.join(require('os').homedir(), '.openclaw');
const OPENCLAW_CONFIG = path.join(OPENCLAW_DIR, 'openclaw.json');
const ENERGY_STATE_FILE = path.join(OPENCLAW_DIR, 'energy-state.json');
const BACKUP_SUFFIX = '.aeb-backup';

const FREE_PROVIDER_CONFIG = {
  'gemini-free': {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKey: process.env.GEMINI_FREE_API_KEY || '',
    api: 'openai-completions',
    models: [
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash (Free)',
        api: 'openai-completions',
        input: ['text', 'image'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1000000,
        maxTokens: 8192,
      },
    ],
  },
};

const FREE_MODEL_ROUTING = {
  default: {
    model: 'gemini-free/gemini-2.5-flash',
    provider: 'gemini-free',
    fallback: [],
  },
};

// ===== API Client =====

async function api(path, options = {}) {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        'x-agent-id': AGENT_ID,
        'content-type': 'application/json',
        ...(options.headers || {}),
      },
      signal: AbortSignal.timeout(5000),
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return { ok: res.ok, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ===== Config Management =====

function loadOpenClawConfig() {
  try {
    const raw = fs.readFileSync(OPENCLAW_CONFIG, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveOpenClawConfig(config) {
  fs.writeFileSync(OPENCLAW_CONFIG, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

function backupConfig() {
  const backupPath = OPENCLAW_CONFIG + BACKUP_SUFFIX;
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(OPENCLAW_CONFIG, backupPath);
    return true;
  }
  return false;
}

function restoreConfig() {
  const backupPath = OPENCLAW_CONFIG + BACKUP_SUFFIX;
  if (fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, OPENCLAW_CONFIG);
    return true;
  }
  return false;
}

function writeEnergyState(state) {
  fs.writeFileSync(ENERGY_STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf-8');
}

function loadEnergyState() {
  try {
    return JSON.parse(fs.readFileSync(ENERGY_STATE_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

// ===== Bridge Query =====

async function queryBridge() {
  const [healthRes, balanceRes, usageRes] = await Promise.all([
    api('/agent/v1/health'),
    api('/agent/v1/balance'),
    api('/agent/v1/usage/summary'),
  ]);

  const availableUsd = balanceRes.data?.balance?.availableUsd ?? 0;
  const dailySpentUsd = usageRes.data?.usage?.dailySpentUsd ?? 0;
  const hourlyTokensUsed = usageRes.data?.usage?.hourlyTokensUsed ?? 0;

  return {
    healthy: healthRes.ok,
    availableUsd,
    dailySpentUsd,
    hourlyTokensUsed,
    riskLevel: availableUsd <= 0 ? 'critical' : availableUsd < 3 ? 'warning' : 'safe',
    timestamp: new Date().toISOString(),
  };
}

// ===== OpenClaw Config Transformation =====

function injectFreeProvider(config) {
  config = JSON.parse(JSON.stringify(config)); // deep clone

  if (!config.models) config.models = { providers: {} };
  if (!config.models.providers) config.models.providers = {};

  // Add free provider if not exists
  for (const [key, provider] of Object.entries(FREE_PROVIDER_CONFIG)) {
    if (!config.models.providers[key]) {
      config.models.providers[key] = provider;
    }
  }

  return config;
}

function switchToFreeMode(config) {
  config = injectFreeProvider(config);

  // Override all agent model assignments to use free model
  if (config.agents && Array.isArray(config.agents.list)) {
    for (const agent of config.agents.list) {
      if (agent.model && !agent._originalModel) {
        agent._originalModel = agent.model;
        agent._originalProvider = agent.provider;
      }
      agent.model = 'gemini-free/gemini-2.5-flash';
      agent.provider = 'gemini-free';
    }
  }

  return config;
}

function restoreNormalMode(config) {
  if (config.agents && Array.isArray(config.agents.list)) {
    for (const agent of config.agents.list) {
      if (agent._originalModel) {
        agent.model = agent._originalModel;
        agent.provider = agent._originalProvider;
        delete agent._originalModel;
        delete agent._originalProvider;
      }
    }
  }

  return config;
}

// ===== Commands =====

async function cmdStatus() {
  const state = await queryBridge();
  writeEnergyState(state);

  console.log('\n========== OpenClaw Cost Guard 状态 ==========');
  console.log(`Bridge 健康:    ${state.healthy ? '✅' : '❌'}`);
  console.log(`当前余额:       $${state.availableUsd.toFixed(4)}`);
  console.log(`今日消耗:       $${state.dailySpentUsd.toFixed(4)}`);
  console.log(`风险等级:       ${state.riskLevel.toUpperCase()}`);

  const ocConfig = loadOpenClawConfig();
  if (ocConfig) {
    const hasFreeProvider = !!ocConfig.models?.providers?.['gemini-free'];
    const inFreeMode = ocConfig.agents?.list?.some(a => a.model === 'gemini-free/gemini-2.5-flash');
    console.log(`OpenClaw 配置:  ${inFreeMode ? '【免费模式】' : '【正常模式】'}`);
    console.log(`免费 Provider:  ${hasFreeProvider ? '已注入' : '未注入'}`);
  }

  console.log('==============================================\n');
  return state;
}

async function cmdSync() {
  const state = await queryBridge();
  writeEnergyState(state);

  if (!state.healthy) {
    console.log('[CostGuard] Bridge 不可用，跳过同步');
    return;
  }

  const config = loadOpenClawConfig();
  if (!config) {
    console.log('[CostGuard] 无法读取 OpenClaw 配置');
    return;
  }

  const currentState = loadEnergyState();
  const wasCritical = currentState?.riskLevel === 'critical';
  const isCritical = state.riskLevel === 'critical';

  if (isCritical && !wasCritical) {
    // Enter free mode
    backupConfig();
    const newConfig = switchToFreeMode(config);
    saveOpenClawConfig(newConfig);
    console.log(`[CostGuard] ⚠️ 余额耗尽 ($${state.availableUsd})，已切换 OpenClaw 到免费模式`);
    console.log('[CostGuard] 所有 Agent 已降级至 gemini-2.5-flash (免费)');
  } else if (!isCritical && wasCritical) {
    // Restore normal mode
    if (restoreConfig()) {
      console.log(`[CostGuard] ✅ 余额恢复 ($${state.availableUsd})，已恢复 OpenClaw 正常配置`);
    }
  } else {
    console.log(`[CostGuard] 状态未变: ${state.riskLevel} (余额 $${state.availableUsd})`);
  }
}

async function cmdWatch() {
  console.log('[CostGuard] 守护模式启动，每 30 秒检查一次...');
  console.log(`[CostGuard] Bridge: ${BASE_URL}`);
  console.log(`[CostGuard] OpenClaw: ${OPENCLAW_CONFIG}`);
  console.log('[CostGuard] 按 Ctrl+C 停止\n');

  await cmdSync();

  setInterval(async () => {
    try {
      await cmdSync();
    } catch (err) {
      console.error('[CostGuard] 同步失败:', err.message);
    }
  }, 30000);
}

async function cmdSwitchFree() {
  const config = loadOpenClawConfig();
  if (!config) {
    console.log('[CostGuard] 无法读取 OpenClaw 配置');
    return;
  }
  backupConfig();
  const newConfig = switchToFreeMode(config);
  saveOpenClawConfig(newConfig);
  console.log('[CostGuard] 已强制切换到免费模式');
}

async function cmdSwitchNormal() {
  if (restoreConfig()) {
    console.log('[CostGuard] 已恢复 OpenClaw 正常配置');
  } else {
    console.log('[CostGuard] 找不到备份配置');
  }
}

// ===== Main =====

const COMMANDS = {
  status: cmdStatus,
  sync: cmdSync,
  watch: cmdWatch,
  'switch-free': cmdSwitchFree,
  'switch-normal': cmdSwitchNormal,
};

async function main() {
  const cmd = process.argv[2] || 'status';
  const handler = COMMANDS[cmd];

  if (!handler) {
    console.error(`未知命令: ${cmd}`);
    console.error('可用命令:', Object.keys(COMMANDS).join(', '));
    process.exit(1);
  }

  await handler();
}

main().catch((err) => {
  console.error('[CostGuard] 错误:', err.message);
  process.exit(1);
});
