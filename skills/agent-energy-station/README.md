# Agent Energy Station — Skill 使用指南

> 一键管理 LLM 调用成本、自动充值、免费模型兜底、路由健康检查
>
> **安装后自动同步余额到 Agent 交互界面，无需任何手动配置！**

---

## 零配置快速开始（1 步）

```bash
node install.mjs
```

安装器会自动完成：
1. ✅ 安装 skill 文件到 Claude Code / OpenClaw
2. ✅ 自动配置 `~/.claude/settings.json`（hook + 环境变量）
3. ✅ 自动检测/获取/启动 Bridge 服务端
4. ✅ 验证一切正常

**无需手动编辑任何配置文件！**

---

## 手动安装（如果自动安装失败）

```bash
# 将整个 agent-energy-station 文件夹复制到 Agent skill 目录：
#   Claude Code: ~/.claude/skills/agent-energy-station
#   OpenClaw:    ~/.openclaw/skills/agent-energy-station
#   Codex:       ~/.codex/skills/agent-energy-station

# 然后手动启动 Bridge
node start-bridge.mjs           # 演示模式（零配置）
node start-bridge.mjs --newapi  # 真实 NewAPI 模式
```

---

## 使用模式

| 模式 | 说明 | 配置 |
|------|------|------|
| **演示模式** | 余额 $5（虚拟），开箱即用 | 无需配置 |
| **真实 NewAPI** | 连接你的 new-api 中转站 | 创建 `.env` 文件 |

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
# 健康检查 — 检查 Bridge 和路由状态
node scripts/energy-orchestrator.mjs health

# 成本透明 — 查看余额、预计成本、剩余次数
node scripts/energy-orchestrator.mjs check-cost --estimatedTokens 50000

# 模型推荐 — 获取主选/降级/免费兜底三层推荐
node scripts/energy-orchestrator.mjs recommend --taskType coding

# 自动充值 — 低余额时尝试兑换码充值
node scripts/energy-orchestrator.mjs auto-refuel

# 智能调用 — 完整闭环：检查成本 → 推荐模型 → 判断执行
node scripts/energy-orchestrator.mjs smart-call --estimatedTokens 10000
```

---

## Agent 交互界面自动同步

安装后，Agent 会自动：

- **每次输入长文本时**，自动检查余额并在界面上显示警告
- **余额耗尽时**，自动推荐免费模型（gemini-2.5-flash-free）
- **余额紧张时**，建议压缩上下文或切换 cheaper 模型

无需手动运行任何命令！

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AGENT_RELAY_URL` | `http://127.0.0.1:3100` | Bridge 地址 |
| `AGENT_ID` | `claude-code-main` | Agent 标识 |

这些变量由 install.mjs 自动配置，通常无需手动修改。

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

**Q: 安装后 Agent 没有自动同步余额？**

1. 确认 Bridge 已启动：`curl http://127.0.0.1:3100/agent/v1/health`
2. 重启 Claude Code（settings.json 修改后需要重启才能生效）
3. 输入较长文本（> 50 字符）触发 hook 检查

**Q: 如何连接自己的 new-api 中转站？**

1. 编辑项目根目录的 `.env` 文件
2. 设置 `NEWAPI_BASE_URL=http://your-server.com`
3. 设置 `NEWAPI_USERNAME` 和 `NEWAPI_PASSWORD`
4. 运行 `node start-bridge.mjs --newapi`

**Q: 自动充值需要什么？**

需要在 new-api 管理后台预先创建兑换码，然后填入 `AUTO_REFUEL_CODES` 环境变量。

**Q: 安装器提示 "无法获取 Bridge 服务端代码"？**

请确保已安装 git，或手动克隆项目：`git clone https://github.com/icelikey/agent-energy-bridge.git`

---

## 目录说明

```
agent-energy-station/
├── SKILL.md                    # Skill 元数据（Agent 识别用）
├── README.md                   # 本文件
├── start-bridge.mjs            # 一键启动 Bridge 服务端
├── install.mjs                 # 智能一键安装器（自动配置一切）
├── scripts/
│   ├── energy-orchestrator.mjs # 主 Skill 脚本
│   ├── claude-energy-guard.mjs # Claude Code Hook 脚本（余额自动检查）
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
