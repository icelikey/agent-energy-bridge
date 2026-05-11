# Requirements: Agent Energy Bridge

**Defined:** 2026-05-04
**Core Value:** 让 Agent 在正确的时间，用正确的模型，花正确的钱。自动的 token 加油（auto-refuel）是最核心的业务。

## v1 Requirements

### Security Hardening

- [ ] **SECU-01**: 移除所有硬编码密码和密钥（NewAPIAdapter、ConfigProvider 等）
- [ ] **SECU-02**: 替换 Math.random 生成的 API Key 为 crypto.randomBytes
- [ ] **SECU-03**: 敏感信息（密码、密钥、token）全部环境变量化
- [ ] **SECU-04**: 添加输入验证和 sanitization 防止注入攻击
- [ ] **SECU-05**: API 端点添加速率限制保护

### Testing Coverage

- [ ] **TEST-01**: ops handlers 核心模块单元测试覆盖
- [ ] **TEST-02**: session-summary 模块测试覆盖
- [ ] **TEST-03**: usage 计量模块测试覆盖
- [ ] **TEST-04**: AutoRefuelDecorator 测试覆盖
- [ ] **TEST-05**: ModelSelector 路由决策测试覆盖
- [ ] **TEST-06**: 集成测试：端到端调用流程验证

### Concurrency Safety

- [ ] **CONC-01**: AutoRefuel 操作加锁防止竞态条件
- [ ] **CONC-02**: setInterval 定时器清理机制防止资源泄漏
- [ ] **CONC-03**: alert/notification 数组上限防止内存无限增长
- [ ] **CONC-04**: 并发请求下余额查询一致性保证

### Token Metering

- [ ] **METR-01**: 按模型维度精细化 token 统计
- [ ] **METR-02**: 按用户维度 token 用量追踪
- [ ] **METR-03**: 按任务类型 token 用量归因
- [ ] **METR-04**: 实时 token 消耗流式更新
- [ ] **METR-05**: token 用量历史记录与查询 API

### API Auto-Switching

- [ ] **ROUT-01**: 主中转站故障时自动检测（健康检查 + 超时）
- [ ] **ROUT-02**: 自动切换到备用中转站（多 provider 路由）
- [ ] **ROUT-03**: 切换后流量自动恢复（主站恢复时切回）
- [ ] **ROUT-04**: 多 provider 负载均衡策略
- [ ] **ROUT-05**: 切换事件通知与日志记录

### Auto-Refuel & Activation

- [ ] **FUEL-01**: 激活码兑换直接对接 NewAPI 额度系统（quota 兑换）
- [ ] **FUEL-02**: 余额低于阈值时多渠道提醒通知（控制台 / Webhook / 邮件 / 短信）
- [ ] **FUEL-03**: 额度耗尽时自动降级到免费模型兜底
- [ ] **FUEL-04**: 充值 / 提醒 / 降级事件状态回调与日志记录
- [ ] **FUEL-05**: 提醒策略可配置（阈值、冷却时间、通知渠道、免打扰时段）

### Notifications

- [ ] **NOTF-01**: 控制台实时余额告警（warn / critical 级别）
- [ ] **NOTF-02**: Webhook 回调通知（低余额、充值成功 / 失败、降级事件）
- [ ] **NOTF-03**: 邮件通知支持（SMTP 配置）
- [ ] **NOTF-04**: 短信 / 钉钉 / 企业微信通知支持（Webhook 模板）
- [ ] **NOTF-05**: 通知去重与频率限制（避免告警风暴）

### Open Source Community

- [x] **OPEN-01**: CONTRIBUTING.md 贡献者指南
- [ ] **OPEN-02**: 完整 API 文档（OpenAPI/Swagger 规范）
- [ ] **OPEN-03**: GitHub Actions CI/CD 流水线
- [ ] **OPEN-04**: 自动化版本发布流程（changelog + tag）
- [ ] **OPEN-05**: Docker 镜像自动构建与发布
- [ ] **OPEN-06**: README 多语言支持（中英双语）

## v2 Requirements

### Multi-Tenant

- **MULT-01**: 多租户隔离（用户/团队级别额度隔离）
- **MULT-02**: 租户级别用量报表与审计

### Data Persistence

- **PERS-01**: 数据持久化存储（SQLite/PostgreSQL 可选）
- **PERS-02**: 进程重启数据不丢失

### Web Dashboard

- **DASH-01**: 用量可视化仪表盘
- **DASH-02**: 实时成本监控图表

### Agentic Auto-Refuel (Experimental)

- **AUTO-01**: 余额低于阈值时自动调用 NewAPI 直充接口（需用户明确授权 + 单笔下限）
- **AUTO-02**: 基于 Mandate / x402 协议的 agent 自主消费授权（参考 Google AP2、Coinbase x402）
- **AUTO-03**: Circuit Breaker（断路器）——异常消费自动熔断

## Out of Scope

| Feature | Reason |
|---------|--------|
| 多租户隔离（v1） | 当前为单用户/单中转站设计，v2 考虑 |
| Web UI 管理后台 | 专注 API + CLI + Skill 集成，v2 考虑 |
| 数据持久化数据库 | v1 保持内存存储，简化运维 |
| 支持非 NewAPI 中转系统 | v1 专注 QuantumNous/new-api 生态 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SECU-01 | Phase 1 | Pending |
| SECU-02 | Phase 1 | Pending |
| SECU-03 | Phase 1 | Pending |
| SECU-04 | Phase 1 | Pending |
| SECU-05 | Phase 1 | Pending |
| TEST-01 | Phase 2 | Pending |
| TEST-02 | Phase 2 | Pending |
| TEST-03 | Phase 2 | Pending |
| TEST-04 | Phase 2 | Pending |
| TEST-05 | Phase 2 | Pending |
| TEST-06 | Phase 2 | Pending |
| CONC-01 | Phase 3 | Pending |
| CONC-02 | Phase 3 | Pending |
| CONC-03 | Phase 3 | Pending |
| CONC-04 | Phase 3 | Pending |
| METR-01 | Phase 4 | Pending |
| METR-02 | Phase 4 | Pending |
| METR-03 | Phase 4 | Pending |
| METR-04 | Phase 4 | Pending |
| METR-05 | Phase 4 | Pending |
| ROUT-01 | Phase 5 | Pending |
| ROUT-02 | Phase 5 | Pending |
| ROUT-03 | Phase 5 | Pending |
| ROUT-04 | Phase 5 | Pending |
| ROUT-05 | Phase 5 | Pending |
| FUEL-01 | Phase 6 | Pending |
| FUEL-02 | Phase 6 | Pending |
| FUEL-03 | Phase 6 | Pending |
| FUEL-04 | Phase 6 | Pending |
| FUEL-05 | Phase 6 | Pending |
| NOTF-01 | Phase 6 | Pending |
| NOTF-02 | Phase 6 | Pending |
| NOTF-03 | Phase 6 | Pending |
| NOTF-04 | Phase 6 | Pending |
| NOTF-05 | Phase 6 | Pending |
| OPEN-01 | Phase 7 | Complete |
| OPEN-02 | Phase 7 | Pending |
| OPEN-03 | Phase 7 | Pending |
| OPEN-04 | Phase 7 | Pending |
| OPEN-05 | Phase 7 | Pending |
| OPEN-06 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 43 total
- Mapped to phases: 43
- Unmapped: 0

---
*Requirements defined: 2026-05-04*
*Last updated: 2026-05-05 after recharge strategy revision*
