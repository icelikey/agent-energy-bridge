#!/usr/bin/env node
/**
 * Agent Energy Station — 一键安装脚本
 *
 * 自动将 skill 安装到 Claude Code / OpenClaw / Codex 的 skill 目录
 */

import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { resolve, join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { homedir, platform } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_NAME = 'agent-energy-station';

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

function getSkillDirectories() {
  const home = homedir();
  const dirs = [];

  // Claude Code
  const claudeDir = join(home, '.claude', 'skills', SKILL_NAME);
  dirs.push({ name: 'Claude Code', path: claudeDir });

  // OpenClaw
  const openclawDir = join(home, '.openclaw', 'skills', SKILL_NAME);
  dirs.push({ name: 'OpenClaw', path: openclawDir });

  // Codex (常见的几个位置)
  const codexDirs = [
    join(home, '.codex', 'skills', SKILL_NAME),
    join(home, '.config', 'codex', 'skills', SKILL_NAME),
  ];
  for (const d of codexDirs) {
    dirs.push({ name: 'Codex', path: d });
  }

  // 通用共享目录
  const sharedDir = join(home, '.agents', 'skills', SKILL_NAME);
  dirs.push({ name: '通用共享目录', path: sharedDir });

  return dirs;
}

function copyDirRecursive(src, dest) {
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }

  const entries = readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

function detectInstalledAgents() {
  const agents = [];
  const home = homedir();

  // Claude Code
  if (existsSync(join(home, '.claude'))) {
    agents.push('Claude Code');
  }

  // OpenClaw
  if (existsSync(join(home, '.openclaw'))) {
    agents.push('OpenClaw');
  }

  // Codex
  if (existsSync(join(home, '.codex')) || existsSync(join(home, '.config', 'codex'))) {
    agents.push('Codex');
  }

  return agents;
}

function createEnvExample(projectRoot) {
  const envPath = join(projectRoot, '.env');
  const envExamplePath = join(projectRoot, '.env.example');

  if (existsSync(envPath)) {
    log('ok', `.env 文件已存在: ${envPath}`);
    return;
  }

  const example = `# Agent Energy Bridge — 环境变量配置
# 复制为 .env 后填入你的实际值

# ========== NewAPI 配置（可选，不填则使用演示模式）==========
# NewAPI 基础地址（QuantumNous/new-api v1.0.0+ 默认端口 80）
NEWAPI_BASE_URL=http://your-newapi.example.com

# 认证方式 A：用户名密码（自动登录获取 Session）
NEWAPI_USERNAME=your-username
NEWAPI_PASSWORD=your-password

# 认证方式 B：API Key + User ID
NEWAPI_API_KEY=your-api-key
NEWAPI_USER_ID=1

# 配额转换比例（默认自动从 /api/status 获取）
# NEWAPI_QUOTA_PER_UNIT=500000

# ========== 自动充值配置 ==========
AUTO_REFUEL_ENABLED=true
AUTO_REFUEL_THRESHOLD_USD=3
AUTO_REFUEL_AMOUNT_USD=10
AUTO_REFUEL_STRATEGY=fixed
# 兑换码列表，逗号分隔（需在 NewAPI 后台预先创建）
AUTO_REFUEL_CODES=CODE1,CODE2,CODE3

# ========== 运营监控 ==========
OPS_MONITOR_INTERVAL_MS=300000

# ========== 路由健康检查 ==========
# 要监控的上游路由，逗号分隔
# HEALTH_CHECK_ROUTES=https://api1.example.com,https://api2.example.com
HEALTH_CHECK_INTERVAL_MS=60000

# ========== 服务配置 ==========
AEB_PORT=3100
AEB_HOST=127.0.0.1
AEB_LOG_LEVEL=info
`;

  writeFileSync(envExamplePath, example);
  log('ok', `已创建模板: ${envExamplePath}`);
  log('info', '如需连接真实 NewAPI，请复制为 .env 并填入你的配置');
}

async function main() {
  console.log(`${COLORS.cyan}╔══════════════════════════════════════════╗${COLORS.reset}`);
  console.log(`${COLORS.cyan}║     Agent Energy Station — 一键安装器     ║${COLORS.reset}`);
  console.log(`${COLORS.cyan}╚══════════════════════════════════════════╝${COLORS.reset}\n`);

  // 1. 检查 Node.js 版本
  const nodeVersion = process.version;
  const major = Number(nodeVersion.slice(1).split('.')[0]);
  if (major < 18) {
    log('error', `Node.js 版本过低: ${nodeVersion}，需要 >= 18`);
    process.exit(1);
  }
  log('ok', `Node.js 版本: ${nodeVersion}`);

  // 2. 查找项目根目录
  let projectRoot = resolve(__dirname, '../..');
  if (!existsSync(join(projectRoot, 'src', 'server', 'index.js'))) {
    projectRoot = process.cwd();
    if (!existsSync(join(projectRoot, 'src', 'server', 'index.js'))) {
      log('warn', '未检测到完整项目代码，将仅安装 skill 文件');
      projectRoot = null;
    }
  }

  if (projectRoot) {
    log('ok', `项目目录: ${projectRoot}`);
  }

  // 3. 检测已安装的 Agent
  const agents = detectInstalledAgents();
  if (agents.length > 0) {
    log('ok', `检测到已安装的 Agent: ${agents.join(', ')}`);
  } else {
    log('warn', '未检测到任何 Agent 安装（Claude Code / OpenClaw / Codex）');
    log('info', '将安装到通用共享目录，你可以稍后手动复制');
  }

  // 4. 安装 skill
  const skillDirs = getSkillDirectories();
  let installed = false;

  for (const { name, path: targetDir } of skillDirs) {
    const parentDir = dirname(targetDir);
    if (!existsSync(parentDir)) {
      continue; // Agent 未安装，跳过
    }

    log('info', `安装到 ${name}: ${targetDir}`);

    if (existsSync(targetDir)) {
      log('warn', `目标目录已存在，将覆盖: ${targetDir}`);
    }

    try {
      copyDirRecursive(__dirname, targetDir);
      log('ok', `✓ 已安装到 ${name}`);
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

  // 5. 创建 .env.example
  if (projectRoot) {
    createEnvExample(projectRoot);
  }

  // 6. 验证
  console.log(`\n${COLORS.cyan}=== 验证 ===${COLORS.reset}`);

  if (projectRoot) {
    log('info', '运行单元测试...');
    try {
      execSync('node --test', { cwd: projectRoot, stdio: 'inherit' });
      log('ok', '单元测试通过');
    } catch {
      log('warn', '部分测试未通过，请检查配置');
    }
  }

  // 7. 输出后续步骤
  console.log(`\n${COLORS.cyan}╔══════════════════════════════════════════╗${COLORS.reset}`);
  console.log(`${COLORS.cyan}║              安装完成！                   ║${COLORS.reset}`);
  console.log(`${COLORS.cyan}╚══════════════════════════════════════════╝${COLORS.reset}`);
  console.log(`\n${COLORS.yellow}后续步骤：${COLORS.reset}`);
  console.log(`  1. 重启你的 Agent 客户端（Claude Code / OpenClaw / Codex）`);
  console.log(`  2. 启动 Bridge 服务端：`);
  console.log(`     cd skills/agent-energy-station`);
  console.log(`     node start-bridge.mjs           # 演示模式`);
  console.log(`     node start-bridge.mjs --newapi  # 真实 NewAPI 模式`);
  console.log(`  3. 测试 skill：`);
  console.log(`     node scripts/energy-orchestrator.mjs health`);
  console.log(`     node scripts/energy-orchestrator.mjs smart-call --estimatedTokens 10000`);
  console.log(`\n${COLORS.yellow}连接真实 NewAPI：${COLORS.reset}`);
  console.log(`  复制 .env.example 为 .env，填入你的中转站地址和账号`);
  console.log(`  然后运行: node start-bridge.mjs --newapi`);
}

main().catch((err) => {
  log('error', err.message);
  process.exit(1);
});
