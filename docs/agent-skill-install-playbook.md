# Agent Skill 安装与触发手册

## 安装目录

- Claude Code: `~/.claude/skills/agent-energy-station`
- OpenClaw: `~/.openclaw/skills/agent-energy-station`
- 共享技能目录: `~/.agents/skills/agent-energy-station`

## 最小安装步骤

1. 复制整个 `skills/agent-energy-station` 文件夹
2. 放到目标智能体的技能目录
3. 重启智能体客户端
4. 用 smoke 脚本或实际任务验证触发情况

## 推荐验证命令

```powershell
$env:AGENT_RELAY_URL='https://agent.example.com'
$env:AGENT_ID='demo-agent'
node scripts/agent_relay_smoke.mjs
```

## 推荐触发词

- 帮我看下 token 消耗
- 额度不够了，先帮我控预算
- 帮我选一个便宜但能做 coding 的模型
- 用激活码给这个 agent 加油
- 给我接入地址和使用说明

## 自动触发增强

建议在系统提示中补充：

```text
涉及 token 消耗、额度不足、模型选择、激活码充值、预算控制、API key、接入文档时，优先使用 agent-energy-station skill。先查余额和用量，再判断是否使用高成本模型。
```

## 常见原因

如果 skill 没触发，通常是：

- `description` 关键词覆盖不够
- 技能目录放错位置
- 客户端未重启
- sidecar 地址没配置
- 测试任务里没有出现足够明确的预算或路由意图
