---
name: relay-ops-copilot
description: Use when operating an AI relay station or LLM gateway and the task involves health checks, upstream线路, container status, route smoke tests, error logs, daily reports, anomaly detection, fallback planning, or safe repair suggestions for sub2api/new-api/one-api style gateways.
---
# Relay Ops Copilot

## 何时使用

当用户需要以下能力时触发本 skill：

- 检查中转站域名、健康接口、容器、日志是否正常
- 检查哪些上游线路、路由、模型当前能通，哪些是假通
- 分析 `503`、`没有可用渠道`、模型回落、错误率上升等异常
- 输出运营日报、异常清单、修复建议和回退建议
- 在不影响现有 key 和现有路由的前提下，给出影子切换建议

## 工作流程

1. 先收集站点快照：域名可用性、`/health`、容器状态、最近错误日志、最新日报。
2. 对关键路由做最小化冒烟测试，不直接对生产客户 key 做破坏性改动。
3. 将结果分为 `available`、`degraded`、`unavailable`、`fake-available` 四类。
4. 优先输出证据和风险，再输出修复建议；默认只做影子建议，不直接动现网。
5. 如果用户明确要求修复，再按最小影响原则处理：优先隐藏故障路由、保留现有 key、启用健康备选方案。

## 输出要求

- 不暴露服务器 IP、上游真实密钥、管理员密钥
- 说明测试时间、测试对象、返回状态和风险等级
- 明确区分“网络可达”和“模型真实可用”
- 对所有变更优先给出“影子建议”和“人工确认点”
- 如果发现某条路由是假通，明确标注为不可售卖

## 参考文件

- 日常巡检时读取 `references/monitoring-checklist.md`
- 需要给事故分级和处理建议时读取 `references/incident-response.md`

## 自动触发关键词

- 健康检查
- 运维巡检
- 日报
- 错误日志
- 线路状态
- 路由异常
- 503
- 无可用渠道
- 自动修复
