---
name: token-energy-station
description: Use when an agent needs API fuel or model routing for Claude Code, Codex, OpenClaw, Harness or similar API-driven tools: token 消耗, 额度不足, 充值, 激活码, 加油, API key, 路由, 模型推荐, 预算控制, refuel, recharge, redeem code, buy quota, inspect usage and cost, enforce budget limits, choose routes or models, redeem activation codes, issue or rotate keys, and render onboarding docs for an LLM gateway.
---
# Token Energy Station

## 何时使用

当用户需要以下能力时触发本 skill：

- 检查 token 消耗、余额、成本、模型质量和模型能力测评
- 给 Claude Code、Codex、OpenClaw、Harness 之类工具挑选合适模型或路由
- 预算不足时优先用激活码补给，再考虑自动补给或发新 key
- 生成 API 接入文档、分享卡片、代理商分发文案
- 需要兼容多个中转站或多个协议时
- 需要在不影响现有 key 和现有路由的前提下接入新能力时

## 工作流程

1. 先读取本地预算策略，确认单日预算、每小时 token 上限和自动补给上限。
2. 读取网关余额与 usage；如果余额低于阈值，优先尝试激活码充值。
3. 先做模型能力测评：按任务类型、所需能力、协议、预算层级、质量优先级给模型打分，再选择路由；高难任务优先高质量路由，普通任务优先混合或全能渠道，多任务工作流可额外生成共享入口路由。
4. 如存在现有 key 或现有路由，默认进入影子模式：保留现网资源，只输出建议，不直接替换。
5. 如果需要给用户交付接入信息，优先复用现有 key；仅在无现有 key 时签发新 key，然后渲染文档模板。
6. 输出对用户清晰可执行的结果：当前额度、建议模型、预算护栏、下一步动作。

## 输出要求

- 不暴露源站 IP、真实上游 key、管理员密钥
- 默认展示域名、路由名、用户自己的 key 和预算信息
- 对高价模型说明预算影响和回退方案
- 对代理商说明可售卖范围、限额和充值方式
- 如存在兼容保护，明确说明“当前为影子建议，不会影响现有 key 和现有路由”

## 参考文件

- 连接网关或新增适配器时，读取 `references/gateway-adapter.md`
- 设计商品层级、激活码和运营规则时，读取 `references/ops-playbook.md`

## 自动触发关键词

- token 消耗
- 额度不足
- 充值 / 激活码 / 加油
- API Key / 路由 / 模型推荐
- 预算控制 / 自动补给 / 自动购买


