# Agent Energy Bridge

`agent-energy-bridge` 是一套面向 Claude Code、Codex、OpenClaw、Harness 等智能体场景的通用中转增强层。

它不直接替代你的中转站，而是补在网关旁边，专门负责这些 Agent-first 能力：

- 调用前预算判断
- 模型能力推荐
- 低余额补给与激活码兑换
- 接入文档生成
- 影子路由建议
- token 价值评估与节流策略

## 适合什么场景

- 你已经有 `sub2api`、`new-api`、`one-api` 或 OpenAI 兼容网关
- 你想让智能体在调用前先判断预算和能力
- 你想做“兑换码补给”“自动发 key”“自动给接入文档”
- 你不希望影响现有生产 key 和既有路由

## 核心模块

- `BudgetGuard`: 预算护栏、单次调用上限、自动补给限制
- `CompatibilityGuard`: 默认只给影子建议，不覆盖现网 key 和路由
- `EnergyEngine`: 计算 token 消耗效率与能量分
- `ModelCapabilityBenchmark`: 评估模型在不同任务下的能力表现
- `ModelSelector`: 基于任务、预算、协议选择推荐模型和路由
- `GenericOpenAIGatewayAdapter`: 适配 OpenAI 风格网关
- `NewAPIGatewayAdapter`: 对接 new-api 开源中转系统
- `AutoRefuelDecorator`: 装饰器模式自动充值，余额低时自动触发补给
- `RefuelOrchestrator`: 编排补给、发 key、生成接入说明
- `ReferralEngine`: 生成适合代理商或下游分发的推荐卡片
- `OpsEngine`: 运营监控引擎，定时抓取用量与余额，生成趋势报告

## 目录

- `src/core/`: 通用业务规则
- `src/adapters/`: 网关适配器（含 new-api 专用适配器与自动充值装饰器）
- `src/service/`: 补给与接入编排
- `src/server/`: HTTP Server 服务层
- `src/utils/`: 工具类（日志、配置加载）
- `skills/`: 给 Agent 用的 skill 示例
- `docs/`: 公开设计文档与说明
- `test/`: 单元测试
- `tests/`: 联调 smoke 脚本
- `bin/`: CLI 入口

## 安装与验证

### 本地开发验证

```bash
node --test
```

```bash
node tests/openclaw-agent-relay-smoke.mjs
```

默认 smoke 地址是 `http://127.0.0.1:3100`。如果你已经有自己的 Agent sidecar，可用环境变量覆盖：

```powershell
$env:AGENT_RELAY_URL='https://agent.example.com'
$env:AGENT_ID='openclaw-demo'
node tests/openclaw-agent-relay-smoke.mjs
```

### Skill 安装位置

- Claude Code: `~/.claude/skills/agent-energy-station`
- OpenClaw: `~/.openclaw/skills/agent-energy-station`
- 共享技能目录: `~/.agents/skills/agent-energy-station`
- Codex 桌面端可放到当前平台约定的技能目录后重启加载

### 让智能体更容易触发

建议在系统提示或工作流提示里补一句：

```text
当任务涉及 token 消耗、额度不足、模型选择、激活码充值、预算控制、API key、接入文档时，优先使用 agent-energy-station skill，先查余额和用量，再决定是否调用高成本模型。
```

## 最小接入示例

```js
const {
  BudgetGuard,
  ModelSelector,
  RefuelOrchestrator,
} = require('./src');

const adapter = {
  async getUsage() {
    return {
      dailySpentUsd: 3.2,
      hourlyTokensUsed: 18000,
      autoRefuelsToday: 0,
      autoPurchasedUsdToday: 0,
    };
  },
  async getBalance() {
    return { availableUsd: 1.6 };
  },
  async redeemCode({ code }) {
    return { ok: true, code, creditUsd: 10 };
  },
  async issueKey() {
    return { apiKey: 'ak-demo', expiresAt: null };
  },
  async renderDocs({ data }) {
    return {
      markdown: `Base URL: ${data.baseUrl}\nAPI Key: ${data.apiKey}`,
    };
  },
};

const budgetGuard = new BudgetGuard({
  dailyBudgetUsd: 12,
  hourlyTokenLimit: 120000,
  autoPurchaseEnabled: true,
  maxAutoRefuelsPerDay: 2,
  maxRefuelAmountUsd: 8,
  maxAutoPurchasedUsdPerDay: 16,
  fallbackModel: 'all-protocol-router',
});

const orchestrator = new RefuelOrchestrator({
  adapter,
  budgetGuard,
  modelSelector: new ModelSelector(),
});

(async () => {
  const result = await orchestrator.prepareSession({
    activationCode: 'DEMO-2026',
    taskType: 'coding',
    protocol: 'openai',
    budgetTier: 'balanced',
    estimatedCostUsd: 1.2,
    requestedTokens: 9000,
    routeName: 'all-protocol-router',
    currentRoute: 'legacy-premium-route',
  });

  console.log(result.routingPlan);
  console.log(result.refuel.action);
})();
```

## Skill 示例

仓库内置了一个可复用 skill：

- `skills/agent-energy-station`

这个 skill 面向 OpenClaw、Claude Code、Codex 等 Agent，负责：

- 查询余额和用量
- 调用前请求推荐和预算判断
- 余额不足时提示兑换码补给
- 建议先压缩上下文，再切换更便宜的路由

Skill 编写说明见：

- `docs/skill-authoring-guide.md`
- `docs/agent-skill-install-playbook.md`

## 对接 new-api 实例

如果你使用 [Calcium-Ion/new-api](https://github.com/Calcium-Ion/new-api) 作为网关，可按以下方式对接：

### 环境变量配置

```bash
# 切换到 new-api 模式（设置后不再使用 MemoryAdapter 演示）
# 注意：QuantumNous/new-api v1.0.0+ 默认使用 80 端口，不是 3000
export NEWAPI_BASE_URL="http://your-newapi.example.com"
export NEWAPI_API_KEY="your-api-key"

# QuantumNous/new-api v1.0.0+ 需要以下额外配置
# 管理 API 需要 userId + session（二选一）：
# 方式 A：提供用户名密码自动登录
export NEWAPI_USERNAME="your-username"
export NEWAPI_PASSWORD="your-password"
# 方式 B：提供 userId（如果 apiKey 可直接访问管理 API）
export NEWAPI_USER_ID="1"
# 可选：自定义配额转换比例（默认自动从 /api/status 获取）
export NEWAPI_QUOTA_PER_UNIT="500000"

# 自动充值配置
export AUTO_REFUEL_ENABLED="true"
export AUTO_REFUEL_THRESHOLD_USD="3"
export AUTO_REFUEL_AMOUNT_USD="10"
export AUTO_REFUEL_CODES="CODE1,CODE2,CODE3"

# 运营监控间隔（默认 5 分钟）
export OPS_MONITOR_INTERVAL_MS="300000"
```

### 启动服务

```bash
npm start
# 或
node scripts/start-server.js
```

### new-api 适配器特性

- `getBalance()` → 自动调用 `/api/user/self`，支持多种余额字段提取：
  - `data.balance`（直接 USD 值）
  - `data.quota`（配额点数，自动除以 `quota_per_unit` 转换）
  - 自动从 `/api/status` 获取 `quota_per_unit`（默认 100000）
- `getUsage()` → 调用 `/api/usage/token/`，提取 `daily_cost` / `hourly_tokens` / `used_quota`
- `redeemCode()` / `topUp()` → 调用配置的充值端点（默认 `/api/topup`）
- **QuantumNous/new-api v1.0.0+ 认证**：支持 `apiKey + userId` 或 `username + password` 自动登录获取 session

### 自动充值（AutoRefuelDecorator）

`AutoRefuelDecorator` 以装饰器模式包装任何 `GatewayAdapter`：

- 每次查询余额时自动检测是否低于阈值
- 低于阈值时自动触发充值（兑换码或 topUp）
- 支持冷却期（cooldown）防止频繁充值
- 支持每小时最大充值次数限制
- 充值成功后自动刷新余额返回
- 内置告警日志，可配置 `onRefuel` / `onAlert` 回调

```js
const { NewAPIGatewayAdapter, AutoRefuelDecorator } = require('agent-energy-bridge');

const newApi = new NewAPIGatewayAdapter({ baseUrl: 'https://gateway.example.com', apiKey: 'ak-xxx' });

const adapter = new AutoRefuelDecorator(newApi, {
  lowBalanceThresholdUsd: 5,
  refuelAmountUsd: 10,
  refuelStrategy: 'fixed',     // fixed | proportional | dynamic
  autoRefuelEnabled: true,
  refuelCodes: ['RECHARGE-10', 'RECHARGE-20'],
  onRefuel: (event) => console.log('Refueled:', event),
  onAlert: (alert) => console.log('Alert:', alert),
});
```

### 运营监控（OpsEngine）

```js
const { OpsEngine, Logger } = require('agent-energy-bridge');

const ops = new OpsEngine({
  adapter,
  energyEngine,
  sessionStore,
  logger: new Logger({ namespace: 'ops' }),
  monitoringIntervalMs: 300000, // 5 分钟
});

ops.startMonitoring();
// 定时自动抓取余额/用量快照

// 获取运营报告
const report = ops.generateReport({ limit: 168 }); // 最近 168 次快照
console.log(report.trend, report.avgBalanceUsd, report.alerts);

// 获取能量效率报告
const energy = ops.getEnergyReport();
```

### HTTP 运营端点

Server 启动后，可通过以下端点获取运营数据：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/agent/v1/ops/snapshot` | GET | 手动抓取当前快照 |
| `/agent/v1/ops/report` | GET | 生成运营趋势报告 |
| `/agent/v1/ops/energy` | GET | 获取能量效率报告 |
| `/agent/v1/ops/start` | POST | 启动定时监控 |
| `/agent/v1/ops/stop` | POST | 停止定时监控 |

## 推荐生产接入顺序

1. 先在 sidecar 层打通 `/health`、`/balance`、`/usage/summary`
2. 再接 `/recommend` 和 `/optimize`
3. 最后接 `/refuel/redeem`、`issueKey()`、`renderDocs()`
4. 对生产网关保持兼容保护，默认只输出影子建议
5. 对外分发时只使用域名，不暴露源站 IP

## 开源边界

这个仓库默认只保留通用能力，不包含这些私有内容：

- 真实上游地址
- 生产域名
- 账号密码
- 激活码库存
- 代理商结算数据
- 客户资料与账单

如果你要给自己站点落地，请通过环境变量、私有配置或私有 adapter 注入。
