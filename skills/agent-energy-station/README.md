# Agent Energy Station — Skill 使用指南

> 一键管理 LLM 调用成本、自动充值、免费模型兜底、路由健康检查

---

## 快速开始（3 步）

### 1. 安装 Skill

```bash
# 方式 A：自动安装（推荐）
node install.mjs

# 方式 B：手动复制
# 将整个 agent-energy-station 文件夹复制到你的 Agent skill 目录：
#   Claude Code: ~/.claude/skills/agent-energy-station
#   OpenClaw:    ~/.openclaw/skills/agent-energy-station
#   Codex:       ~/.codex/skills/agent-energy-station
```

### 2. 启动 Bridge 服务端

```bash
# 演示模式（零配置，余额 $5，立即体验）
node start-bridge.mjs

# 真实 NewAPI 模式（连接你的中转站）
node start-bridge.mjs --newapi
```

### 3. 运行 Skill

```bash
# 健康检查
node scripts/energy-orchestrator.mjs health

# 智能调用（一键判断余额 + 推荐模型）
node scripts/energy-orchestrator.mjs smart-call --estimatedTokens 10000
```

---

## 两种使用模式

| 模式 | 命令 | 配置 | 用途 |
|------|------|------|------|
| **演示模式** | `node start-bridge.mjs` | 无需配置 | 开箱即用，体验全部功能 |
| **真实 NewAPI** | `node start-bridge.mjs --newapi` | 需配置 `.env` | 连接你的 new-api 中转站 |

### 演示模式

- 余额：$5 USD（虚拟）
- 今日消耗：$2 USD（虚拟）
- 兑换码：`DEMO-2026`（可体验充值流程）
- 所有功能可用，但不连接真实中转站

### 真实 NewAPI 模式

1. 复制 `.env.example` 为 `.env`
2. 填入你的 new-api 地址和认证信息
3. 运行 `node start-bridge.mjs --newapi`

---

## Skill 命令

```bash
# 1. 健康检查 — 检查 Bridge 和路由状态
node scripts/energy-orchestrator.mjs health

# 2. 成本透明 — 查看余额、预计成本、剩余次数
node scripts/energy-orchestrator.mjs check-cost --estimatedTokens 50000 --modelPricePer1k 0.02

# 3. 模型推荐 — 获取主选/降级/免费兜底三层推荐
node scripts/energy-orchestrator.mjs recommend --taskType coding --budgetTier balanced

# 4. 自动充值 — 低余额时尝试兑换码充值
node scripts/energy-orchestrator.mjs auto-refuel --thresholdUsd 2

# 5. 智能调用 — 完整闭环：检查成本 → 推荐模型 → 判断执行
node scripts/energy-orchestrator.mjs smart-call --taskType coding --estimatedTokens 10000
```

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AGENT_RELAY_URL` | `http://127.0.0.1:3100` | Bridge 地址 |
| `AGENT_ID` | `agent-energy-station` | Agent 标识 |

---

## 免费模型兜底

当余额为 0 时，系统自动推荐免费模型：

| 模型 | 提供商 | 免费额度 |
|------|--------|---------|
| Gemini 2.5 Flash | Google | 1,500 RPM |
| OpenRouter Free | OpenRouter | 20 RPM |
| Groq Llama 3 | Groq | 20 RPM |
| Local Ollama | 本地 | 无限制 |

---

## 常见问题

**Q: 提示 "Bridge 服务端未运行"**

先运行 `node start-bridge.mjs` 启动服务端。

**Q: 如何连接自己的 new-api 中转站？**

1. 编辑项目根目录的 `.env` 文件
2. 设置 `NEWAPI_BASE_URL=http://your-server.com`
3. 设置 `NEWAPI_USERNAME` 和 `NEWAPI_PASSWORD`
4. 运行 `node start-bridge.mjs --newapi`

**Q: 自动充值需要什么？**

需要在 new-api 管理后台预先创建兑换码，然后填入 `AUTO_REFUEL_CODES` 环境变量。

**Q: Skill 没触发怎么办？**

- 确认 skill 目录位置正确
- 重启 Agent 客户端
- 在提示中明确提到"余额"、"预算"、"模型选择"等关键词

---

## 目录说明

```
agent-energy-station/
├── SKILL.md                    # Skill 元数据（Agent 识别用）
├── README.md                   # 本文件
├── start-bridge.mjs            # 一键启动 Bridge 服务端
├── install.mjs                 # 一键安装到 Agent skill 目录
├── scripts/
│   ├── energy-orchestrator.mjs # 主 Skill 脚本
│   └── agent_relay_smoke.mjs   # 测试脚本
├── references/
│   └── agent-relay-api.md      # API 契约文档
└── agents/
    └── openai.yaml             # OpenAI 风格 Agent 配置
```

---

## 停止 Bridge

```bash
node start-bridge.mjs --stop
```

---

*更多详情见项目根目录 `docs/PROJECT_DEVELOPMENT_GUIDE.md`*
