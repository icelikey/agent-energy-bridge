# Agent Energy Station — 朋友测试指南

## 快速开始（5分钟）

### 1. 安装 Skill

将 `agent-energy-station-skill.zip` 解压到 Claude Code 的 skills 目录：

**Windows:**
```powershell
Expand-Archive -Path agent-energy-station-skill.zip -DestinationPath "$env:USERPROFILE\.claude\skills\"
```

**macOS/Linux:**
```bash
unzip agent-energy-station-skill.zip -d ~/.claude/skills/
```

### 2. 配置 NewAPI 中转站（已提供）

在项目根目录创建 `.env` 文件：

```bash
# 复制示例配置
cp .env.example .env
```

编辑 `.env`，填入以下信息：

```env
NEWAPI_BASE_URL=http://104.243.33.52:3000
NEWAPI_API_KEY=sk-yIwsHsoTYzFHw6eNAWfKE3ASgGfm25EsYVvj9O44XgtfsHPG
```

### 3. 启动 Bridge（NewAPI 模式）

```powershell
cd skills/agent-energy-station
node start-bridge.mjs --newapi
```

### 4. 快速测试

```powershell
# 健康检查
node scripts/energy-orchestrator.mjs health

# 模型推荐
node scripts/energy-orchestrator.mjs recommend --taskType coding

# 成本检查
node scripts/energy-orchestrator.mjs check-cost --estimatedTokens 50000

# 智能调用（完整流程）
node scripts/energy-orchestrator.mjs smart-call --estimatedTokens 30000
```

### 5. Claude Code 中使用

启动 Bridge 后，Claude Code 会自动通过 hook 检查余额。

也可以手动运行 slash command：
```
/energy-check
```

## 文件清单

| 文件 | 说明 |
|------|------|
| `SKILL.md` | Skill 定义文件 |
| `scripts/energy-orchestrator.mjs` | 核心脚本（健康/推荐/成本/调用） |
| `scripts/agent_relay_smoke.mjs` | Smoke 测试 |
| `start-bridge.mjs` | 一键启动 Bridge |
| `README.md` | Skill 说明 |

## 注意事项

- 中转站地址和 API Key 仅供测试使用，请勿公开分享
- 生产环境请使用自己的 Bridge 服务器和 NewAPI 实例
- 免费模型兜底功能无需配置，余额为 0 时自动生效
