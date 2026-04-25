# Gateway Adapter Contract

## Required methods

- `listModels()`
  - 返回网关可用模型或路由列表
- `getUsage(identity)`
  - 返回 `dailySpentUsd`, `hourlyTokensUsed`, `autoRefuelsToday`, `autoPurchasedUsdToday`
- `getBalance(identity)`
  - 返回 `availableUsd` 或 `balanceUsd`
- `redeemCode(payload)`
  - 入参建议包含 `code`, `identity`
- `issueKey(payload)`
  - 入参建议包含 `owner`, `group`, `plan`, `metadata`
- `rotateKey(payload)`
  - 用于轮换泄漏或到期的 key
- `renderDocs(payload)`
  - 根据模板渲染接入说明

## Suggested response shapes

### Usage

```json
{
  "dailySpentUsd": 6.4,
  "hourlyTokensUsed": 28000,
  "autoRefuelsToday": 1,
  "autoPurchasedUsdToday": 5
}
```

### Balance

```json
{
  "availableUsd": 3.5
}
```

### Redeem

```json
{
  "ok": true,
  "creditUsd": 10,
  "code": "DEMO-2026"
}
```

### Issue key

```json
{
  "apiKey": "ak-demo",
  "group": "all-protocol-router",
  "expiresAt": null
}
```

## Notes

- 如果目标中转站不是 OpenAI 风格接口，就在 adapter 内部完成协议适配
- 不要把业务规则写到 adapter；adapter 只做平台差异转换
- 所有对外文档字段都应支持域名占位，而不是硬编码 IP
