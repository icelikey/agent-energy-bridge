#!/usr/bin/env node
/**
 * Agent Energy Station — 一键启动本地 Bridge
 *
 * 用法:
 *   node start-bridge.mjs              # 演示模式（MemoryAdapter，零配置）
 *   node start-bridge.mjs --newapi     # 真实 NewAPI 模式（需配置 .env）
 *   node start-bridge.mjs --stop       # 停止已启动的 bridge
 */

import { spawn, exec } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

function findProjectRoot() {
  // 路径1: skill 在项目内部 (skills/agent-energy-station/ -> ../../)
  const insideProject = resolve(__dirname, '../..');
  if (existsSync(join(insideProject, 'src', 'server', 'index.js')) &&
      existsSync(join(insideProject, 'scripts', 'start-server.js'))) {
    return insideProject;
  }

  // 路径2: 当前目录就是项目根目录
  const cwd = process.cwd();
  if (existsSync(join(cwd, 'src', 'server', 'index.js')) &&
      existsSync(join(cwd, 'scripts', 'start-server.js'))) {
    return cwd;
  }

  // 路径3: skill 目录旁有 agent-energy-bridge 文件夹
  const sibling = resolve(__dirname, '..', 'agent-energy-bridge');
  if (existsSync(join(sibling, 'src', 'server', 'index.js'))) {
    return sibling;
  }

  return null;
}

async function checkBridgeRunning(url = 'http://127.0.0.1:3100/agent/v1/health') {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const data = await res.json();
      return { running: true, data };
    }
  } catch { /* ignore */ }
  return { running: false };
}

async function loadEnvFile(projectRoot) {
  const envPath = join(projectRoot, '.env');
  if (!existsSync(envPath)) return {};

  const env = {};
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      env[key] = val;
    }
  }
  return env;
}

async function startBridge(projectRoot, mode) {
  const env = { ...process.env };

  if (mode === 'demo') {
    // 演示模式：不设置 NEWAPI_BASE_URL，使用 MemoryAdapter
    delete env.NEWAPI_BASE_URL;
    log('info', '启动演示模式（MemoryAdapter，余额 $5，无需配置）');
  } else if (mode === 'newapi') {
    const envVars = await loadEnvFile(projectRoot);
    if (!envVars.NEWAPI_BASE_URL && !process.env.NEWAPI_BASE_URL) {
      log('error', 'NewAPI 模式需要配置 NEWAPI_BASE_URL');
      log('info', `请编辑 ${join(projectRoot, '.env')} 文件，参照 .env.example 配置`);
      process.exit(1);
    }
    Object.assign(env, envVars);
    log('info', `启动 NewAPI 模式（${envVars.NEWAPI_BASE_URL || process.env.NEWAPI_BASE_URL}）`);
  }

  return new Promise((resolve, reject) => {
    const scriptPath = join(projectRoot, 'scripts', 'start-server.js');
    const child = spawn('node', [scriptPath], {
      cwd: projectRoot,
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    child.stdout.on('data', (d) => { output += d.toString(); });
    child.stderr.on('data', (d) => { output += d.toString(); });

    // 等待启动成功标志
    const timeout = setTimeout(() => {
      log('warn', 'Bridge 启动中，可能需要几秒...');
    }, 3000);

    const checkInterval = setInterval(async () => {
      const status = await checkBridgeRunning();
      if (status.running) {
        clearTimeout(timeout);
        clearInterval(checkInterval);
        // 保存 PID 文件
        const pidFile = join(__dirname, '.bridge.pid');
        import('fs').then(fs => fs.writeFileSync(pidFile, String(child.pid)));
        resolve({ pid: child.pid, data: status.data });
      }
    }, 1000);

    child.on('exit', (code) => {
      clearTimeout(timeout);
      clearInterval(checkInterval);
      if (code !== 0 && code !== null) {
        reject(new Error(`Bridge 进程异常退出，码: ${code}\n输出:\n${output}`));
      }
    });

    child.unref();
  });
}

async function stopBridge() {
  const pidFile = join(__dirname, '.bridge.pid');
  if (!existsSync(pidFile)) {
    // 尝试通过端口查找
    log('warn', '未找到 PID 文件，尝试通过端口 3100 查找进程...');
    return new Promise((resolve) => {
      const isWin = process.platform === 'win32';
      const cmd = isWin
        ? `netstat -ano | findstr 127.0.0.1:3100`
        : `lsof -ti:3100`;
      exec(cmd, (err, stdout) => {
        if (err || !stdout) {
          log('warn', '未找到运行在 3100 端口的 Bridge 进程');
          resolve(false);
          return;
        }
        if (isWin) {
          const match = stdout.match(/LISTENING\s+(\d+)/);
          if (match) {
            exec(`taskkill /F /PID ${match[1]}`, () => {
              log('ok', `已终止 Bridge 进程 (PID: ${match[1]})`);
              resolve(true);
            });
          }
        } else {
          const pids = stdout.trim().split('\n').filter(Boolean);
          for (const pid of pids) {
            try { process.kill(Number(pid), 'SIGTERM'); } catch { /* ignore */ }
          }
          log('ok', `已终止 Bridge 进程 (PID: ${pids.join(', ')})`);
          resolve(true);
        }
      });
    });
  }

  const pid = Number(readFileSync(pidFile, 'utf-8').trim());
  try {
    process.kill(pid, 'SIGTERM');
    log('ok', `已终止 Bridge 进程 (PID: ${pid})`);
    return true;
  } catch (err) {
    log('error', `终止失败: ${err.message}`);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args.includes('--newapi') ? 'newapi' : 'demo';
  const shouldStop = args.includes('--stop');

  console.log(`${COLORS.cyan}╔══════════════════════════════════════════╗${COLORS.reset}`);
  console.log(`${COLORS.cyan}║     Agent Energy Station — Bridge 启动器  ║${COLORS.reset}`);
  console.log(`${COLORS.cyan}╚══════════════════════════════════════════╝${COLORS.reset}\n`);

  if (shouldStop) {
    await stopBridge();
    return;
  }

  // 检查是否已在运行
  const status = await checkBridgeRunning();
  if (status.running) {
    log('ok', `Bridge 已在运行！`);
    console.log(`   地址: http://127.0.0.1:3100`);
    console.log(`   健康: ${status.data?.status || 'ok'}`);
    console.log(`   适配器: ${status.data?.adapter?.adapter || 'unknown'}`);
    console.log(`\n你可以直接使用 skill 脚本，无需重新启动。`);
    return;
  }

  // 查找项目根目录
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    log('error', '找不到 Bridge 服务端代码！');
    console.log(`\n${COLORS.yellow}解决方案：${COLORS.reset}`);
    console.log(`  1. 确保 skill 文件夹位于 agent-energy-bridge 项目内：`);
    console.log(`     agent-energy-bridge/skills/agent-energy-station/`);
    console.log(`  2. 或者先 clone 完整项目：`);
    console.log(`     git clone <项目地址> agent-energy-bridge`);
    console.log(`     cd agent-energy-bridge/skills/agent-energy-station`);
    console.log(`     node start-bridge.mjs`);
    process.exit(1);
  }

  log('info', `找到项目: ${projectRoot}`);

  // 检查 Node.js 版本
  const nodeVersion = process.version;
  const major = Number(nodeVersion.slice(1).split('.')[0]);
  if (major < 18) {
    log('error', `Node.js 版本过低: ${nodeVersion}，需要 >= 18`);
    process.exit(1);
  }

  try {
    const result = await startBridge(projectRoot, mode);
    log('ok', 'Bridge 启动成功！');
    console.log(`   PID: ${result.pid}`);
    console.log(`   地址: http://127.0.0.1:3100`);
    console.log(`   健康检查: http://127.0.0.1:3100/agent/v1/health`);
    console.log(`   Ops 报告: http://127.0.0.1:3100/agent/v1/ops/report`);
    console.log(`\n${COLORS.cyan}现在可以运行 skill 脚本了：${COLORS.reset}`);
    console.log(`   node scripts/energy-orchestrator.mjs health`);
    console.log(`   node scripts/energy-orchestrator.mjs check-cost --estimatedTokens 10000`);
    console.log(`\n停止命令: node start-bridge.mjs --stop`);
  } catch (err) {
    log('error', `启动失败: ${err.message}`);
    process.exit(1);
  }
}

main().catch(console.error);
