#!/usr/bin/env node
/**
 * Agent Energy Station — 一键安装脚本（自动配置版）
 *
 * 自动完成：
 * 1. 安装 skill 文件到 Claude Code / OpenClaw / Codex
 * 2. 自动配置 Claude Code settings.json（hook + 环境变量，安全合并）
 * 3. 自动配置 OpenClaw（可选）
 * 4. 自动检测/获取/启动 Bridge 服务端
 * 5. 验证安装
 */

import {
  existsSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  readFileSync,
  renameSync,
} from 'fs';
import { resolve, join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawn } from 'child_process';
import { homedir, platform } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_NAME = 'agent-energy-station';
const GITHUB_REPO = 'https://github.com/icelikey/agent-energy-bridge.git';

const COLORS = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
};

function log(type, msg) {
  const c = type === 'ok' ? COLORS.green : type === 'warn' ? COLORS.yellow : type === 'error' ? COLORS.red : COLORS.cyan;
  console.log(`${c}[${type.toUpperCase()}]${COLORS.reset} ${msg}`);
}

// ===== File Operations =====

function copyDirRecursive(src, dest) {
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
  const entries = readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(srcPath, destPath);
    else copyFileSync(srcPath, destPath);
  }
}

// ===== Agent Detection =====

function getSkillDirectories() {
  const home = homedir();
  const dirs = [];
  const claudeDir = join(home, '.claude', 'skills', SKILL_NAME);
  dirs.push({ name: 'Claude Code', path: claudeDir });
  const openclawDir = join(home, '.openclaw', 'skills', SKILL_NAME);
  dirs.push({ name: 'OpenClaw', path: openclawDir });
  const codexDirs = [
    join(home, '.codex', 'skills', SKILL_NAME),
    join(home, '.config', 'codex', 'skills', SKILL_NAME),
  ];
  for (const d of codexDirs) dirs.push({ name: 'Codex', path: d });
  const sharedDir = join(home, '.agents', 'skills', SKILL_NAME);
  dirs.push({ name: '通用共享目录', path: sharedDir });
  return dirs;
}

function detectInstalledAgents() {
  const agents = [];
  const home = homedir();
  if (existsSync(join(home, '.claude'))) agents.push('Claude Code');
  if (existsSync(join(home, '.openclaw'))) agents.push('OpenClaw');
  if (existsSync(join(home, '.codex')) || existsSync(join(home, '.config', 'codex'))) agents.push('Codex');
  return agents;
}

// ===== Bridge Discovery =====

function findProjectRoot() {
  const insideProject = resolve(__dirname, '../..');
  if (existsSync(join(insideProject, 'src', 'server', 'index.js'))) return insideProject;
  const cwd = process.cwd();
  if (existsSync(join(cwd, 'src', 'server', 'index.js'))) return cwd;
  const sibling = resolve(__dirname, '..', 'agent-energy-bridge');
  if (existsSync(join(sibling, 'src', 'server', 'index.js'))) return sibling;
  const homeFallback = join(homedir(), 'agent-energy-bridge');
  if (existsSync(join(homeFallback, 'src', 'server', 'index.js'))) return homeFallback;
  return null;
}

async function probeBridge(url = 'http://127.0.0.1:3100/agent/v1/health') {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (res.ok) return { running: true, data: await res.json() };
  } catch { /* ignore */ }
  return { running: false };
}

async function autoCloneProject() {
  const targetDir = join(homedir(), 'agent-energy-bridge');
  if (existsSync(targetDir)) {
    log('info', `项目目录已存在: ${targetDir}`);
    return targetDir;
  }
  log('info', `正在从 GitHub 克隆项目到 ${targetDir}...`);
  try {
    execSync(`git clone "${GITHUB_REPO}" "${targetDir}"`, { stdio: 'inherit', timeout: 60000 });
    log('ok', '项目克隆成功');
    return targetDir;
  } catch (err) {
    log('error', `克隆失败: ${err.message}`);
    return null;
  }
}

async function autoStartBridge(projectRoot) {
  const probe = await probeBridge();
  if (probe.running) {
    log('ok', 'Bridge 已在运行，跳过启动');
    return { started: false, projectRoot, probe };
  }

  if (!projectRoot) {
    log('warn', '未找到 Bridge 服务端代码，尝试自动获取...');
    projectRoot = await autoCloneProject();
    if (!projectRoot) {
      throw new Error('无法获取 Bridge 服务端代码。请手动克隆项目后再运行安装。');
    }
  }

  // Check for NewAPI config
  const envPath = join(projectRoot, '.env');
  let hasNewAPI = false;
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf-8');
    hasNewAPI = envContent.includes('NEWAPI_BASE_URL');
  }
  hasNewAPI = hasNewAPI || !!process.env.NEWAPI_BASE_URL;

  const mode = hasNewAPI ? '--newapi' : '';
  const scriptPath = join(projectRoot, 'scripts', 'start-server.js');

  log('info', `正在启动 Bridge${mode ? ' (NewAPI 模式)' : ' (演示模式)'}...`);

  const child = spawn('node', [scriptPath], {
    cwd: projectRoot,
    env: { ...process.env },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Wait for ready
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const status = await probeBridge();
    if (status.running) {
      log('ok', 'Bridge 启动成功！');
      return { started: true, projectRoot, probe: status };
    }
  }
  throw new Error('Bridge 在 15 秒内未能启动，请检查日志');
}

// ===== Claude Code Auto-Config =====

function loadJsonSafe(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

function saveJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function configureClaudeCode(skillDir) {
  const settingsPath = join(homedir(), '.claude', 'settings.json');
  if (!existsSync(settingsPath)) {
    log('warn', `未找到 Claude Code settings.json: ${settingsPath}`);
    return false;
  }

  const settings = loadJsonSafe(settingsPath);
  if (!settings) {
    log('error', `无法解析 settings.json，请检查格式`);
    return false;
  }

  // Backup
  const backupPath = settingsPath + '.aeb-backup';
  if (!existsSync(backupPath)) {
    copyFileSync(settingsPath, backupPath);
    log('ok', `已备份原配置: ${backupPath}`);
  }

  // Merge env
  if (!settings.env) settings.env = {};
  const envUpdates = {
    AGENT_RELAY_URL: settings.env.AGENT_RELAY_URL || 'http://127.0.0.1:3100',
    AGENT_ID: settings.env.AGENT_ID || 'claude-code-main',
  };
  Object.assign(settings.env, envUpdates);

  // Merge hooks
  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks.UserPromptSubmit) settings.hooks.UserPromptSubmit = [];

  const hookCommand = `node "${join(skillDir, 'scripts', 'claude-energy-guard.mjs').replace(/\\/g, '\\\\')}"`;

  // Check for duplicate
  const exists = settings.hooks.UserPromptSubmit.some(entry =>
    entry.hooks?.some(h => h.type === 'command' && h.command?.includes('claude-energy-guard'))
  );

  if (!exists) {
    settings.hooks.UserPromptSubmit.push({
      hooks: [{
        type: 'command',
        command: hookCommand,
        timeout: 5,
        statusMessage: 'Checking energy balance...',
      }],
    });
    log('ok', '已添加 UserPromptSubmit hook（余额自动检查）');
  } else {
    log('info', 'UserPromptSubmit hook 已存在，跳过');
  }

  saveJson(settingsPath, settings);
  log('ok', 'Claude Code 配置已更新');
  return true;
}

// ===== OpenClaw Auto-Config =====

function configureOpenClaw(skillDir) {
  const openclawDir = join(homedir(), '.openclaw');
  if (!existsSync(openclawDir)) {
    log('warn', '未检测到 OpenClaw 安装，跳过配置');
    return false;
  }

  // Ensure energy-state.json exists
  const statePath = join(openclawDir, 'energy-state.json');
  if (!existsSync(statePath)) {
    writeFileSync(statePath, JSON.stringify({
      healthy: true,
      availableUsd: 5,
      dailySpentUsd: 0,
      hourlyTokensUsed: 0,
      riskLevel: 'safe',
      timestamp: new Date().toISOString(),
    }, null, 2) + '\n');
    log('ok', '已创建 OpenClaw 初始状态文件');
  }

  // Note: Full OpenClaw config (cron jobs, free provider injection) would be handled
  // by openclaw-cost-guard.mjs when user runs it. We just ensure the basics are ready.
  log('ok', 'OpenClaw 基础配置已就绪');
  return true;
}

// ===== Verification =====

async function verifyInstallation(skillDir) {
  console.log(`\n${COLORS.cyan}=== 安装验证 ===${COLORS.reset}`);

  let pass = 0;
  let fail = 0;

  // 1. Skill files
  const requiredFiles = ['SKILL.md', 'scripts/energy-orchestrator.mjs', 'scripts/claude-energy-guard.mjs'];
  for (const f of requiredFiles) {
    if (existsSync(join(skillDir, f))) {
      log('ok', `文件检查: ${f}`);
      pass++;
    } else {
      log('error', `文件缺失: ${f}`);
      fail++;
    }
  }

  // 2. Bridge health
  const bridgeStatus = await probeBridge();
  if (bridgeStatus.running) {
    log('ok', `Bridge 健康: ${bridgeStatus.data?.status || 'ok'}`);
    pass++;
  } else {
    log('error', 'Bridge 未运行');
    fail++;
  }

  // 3. Balance API
  try {
    const res = await fetch('http://127.0.0.1:3100/agent/v1/balance', { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      const balance = data?.balance?.availableUsd ?? 'N/A';
      log('ok', `余额查询: $${balance}`);
      pass++;
    } else {
      log('warn', '余额查询返回非 200');
      fail++;
    }
  } catch {
    log('error', '余额查询失败');
    fail++;
  }

  // 4. Smoke test
  try {
    const res = await fetch('http://127.0.0.1:3100/agent/v1/models/capabilities', { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      const count = data?.count || 0;
      log('ok', `模型列表: ${count} 个模型可用`);
      pass++;
    } else {
      log('warn', '模型列表查询失败');
      fail++;
    }
  } catch {
    log('error', '模型列表查询失败');
    fail++;
  }

  console.log(`\n${COLORS.cyan}验证结果: ${pass} 通过, ${fail} 失败${COLORS.reset}`);
  return fail === 0;
}

// ===== Main =====

async function main() {
  console.log(`${COLORS.cyan}╔════════════════════════════════════════════════════╗${COLORS.reset}`);
  console.log(`${COLORS.cyan}║     Agent Energy Station — 智能一键安装器          ║${COLORS.reset}`);
  console.log(`${COLORS.cyan}╚════════════════════════════════════════════════════╝${COLORS.reset}\n`);

  // 1. Node.js version
  const nodeVersion = process.version;
  const major = Number(nodeVersion.slice(1).split('.')[0]);
  if (major < 18) {
    log('error', `Node.js 版本过低: ${nodeVersion}，需要 >= 18`);
    process.exit(1);
  }
  log('ok', `Node.js 版本: ${nodeVersion}`);

  // 2. Detect agents
  const agents = detectInstalledAgents();
  if (agents.length > 0) {
    log('ok', `检测到已安装的 Agent: ${agents.join(', ')}`);
  } else {
    log('warn', '未检测到任何 Agent 安装（Claude Code / OpenClaw / Codex）');
    log('info', '将安装到通用共享目录，你可以稍后手动复制');
  }

  // 3. Install skill files
  const skillDirs = getSkillDirectories();
  let installedDir = null;
  let installed = false;

  for (const { name, path: targetDir } of skillDirs) {
    const parentDir = dirname(targetDir);
    if (!existsSync(parentDir)) continue;

    log('info', `安装到 ${name}: ${targetDir}`);
    if (existsSync(targetDir)) {
      log('warn', `目标目录已存在，将覆盖: ${targetDir}`);
    }
    try {
      copyDirRecursive(__dirname, targetDir);
      log('ok', `✓ 已安装到 ${name}`);
      installedDir = targetDir;
      installed = true;
    } catch (err) {
      log('error', `安装到 ${name} 失败: ${err.message}`);
    }
  }

  if (!installed) {
    log('error', '没有可用的安装目标！');
    log('info', '请手动复制本文件夹到以下位置之一:');
    for (const { name, path: targetDir } of skillDirs) {
      console.log(`  ${name}: ${targetDir}`);
    }
    process.exit(1);
  }

  // 4. Auto-configure Claude Code
  if (agents.includes('Claude Code')) {
    console.log('');
    log('info', '正在配置 Claude Code...');
    configureClaudeCode(installedDir);
  }

  // 5. Auto-configure OpenClaw
  if (agents.includes('OpenClaw')) {
    console.log('');
    log('info', '正在配置 OpenClaw...');
    configureOpenClaw(installedDir);
  }

  // 6. Find / clone / start Bridge
  console.log('');
  log('info', '正在检查 Bridge 服务端...');
  let projectRoot = findProjectRoot();
  let bridgeInfo;
  try {
    bridgeInfo = await autoStartBridge(projectRoot);
    projectRoot = bridgeInfo.projectRoot;
  } catch (err) {
    log('error', `Bridge 启动失败: ${err.message}`);
    log('info', '请手动启动 Bridge: node start-bridge.mjs');
  }

  // 7. Verify
  const verified = await verifyInstallation(installedDir);

  // 8. Summary
  console.log(`\n${COLORS.cyan}╔════════════════════════════════════════════════════╗${COLORS.reset}`);
  console.log(`${COLORS.cyan}║              安装完成！                             ║${COLORS.reset}`);
  console.log(`${COLORS.cyan}╚════════════════════════════════════════════════════╝${COLORS.reset}`);

  if (verified) {
    console.log(`\n${COLORS.green}✓ 一切就绪！你可以立即开始使用。${COLORS.reset}`);
  } else {
    console.log(`\n${COLORS.yellow}⚠ 部分检查未通过，但基础功能可用。${COLORS.reset}`);
  }

  console.log(`\n${COLORS.cyan}快速测试：${COLORS.reset}`);
  console.log(`  cd "${installedDir.replace(/\\/g, '/')}"`);
  console.log(`  node scripts/energy-orchestrator.mjs health`);
  console.log(`  node scripts/energy-orchestrator.mjs smart-call --estimatedTokens 10000`);

  console.log(`\n${COLORS.cyan}连接真实 NewAPI（可选）：${COLORS.reset}`);
  console.log(`  1. 在项目目录创建 .env 文件:`);
  if (projectRoot) {
    console.log(`     ${join(projectRoot, '.env')}`);
  }
  console.log(`  2. 填入 NEWAPI_BASE_URL 和 NEWAPI_API_KEY`);
  console.log(`  3. 重启 Bridge: node start-bridge.mjs --stop && node start-bridge.mjs --newapi`);

  console.log(`\n${COLORS.cyan}Claude Code Hook 已启用：${COLORS.reset}`);
  console.log(`  每次输入长文本时，自动检查余额并给出警告。`);
  console.log(`  配置位置: ~/.claude/settings.json`);

  if (agents.includes('Claude Code')) {
    console.log(`\n${COLORS.yellow}提示：请重启 Claude Code 以加载新配置${COLORS.reset}`);
  }
}

main().catch((err) => {
  log('error', err.message);
  process.exit(1);
});
