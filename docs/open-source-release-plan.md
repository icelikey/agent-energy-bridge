# 开源发布计划

## 开源边界

建议把以下能力开源：

- 预算护栏
- 能量评分
- 模型推荐
- 通用网关适配器接口
- 补给编排器
- Skill 示例与接入流程

建议不要开源以下内容：

- 真实上游渠道配置
- 私有模型映射和采购价格
- 代理商价格系数
- 生产环境域名、Webhook、商户号、激活码库存
- 客户资料与账单明细

## 仓库建议结构

- `src/core/`：通用业务规则
- `src/adapters/`：适配任意中转站
- `src/service/`：编排补给与接入
- `skills/`：给 Agent 的技能说明
- `docs/`：私有改造和运营手册
- `test/`：Node 内置测试

## 兼容策略

为不同中转站实现 adapter，而不是把逻辑写死到某个后台里。

第一批建议支持：

- `sub2api`
- `new-api`
- `one-api compatible`
- `generic OpenAI gateway`

统一 adapter 能力：

- `listModels()`
- `getUsage()`
- `getBalance()`
- `redeemCode()`
- `issueKey()`
- `rotateKey()`
- `renderDocs()`

## GitHub 发布步骤

1. 清理私有域名、私钥、账号、成本数据
2. 保留 mock transport 和测试夹具
3. 补上 README 示例和 adapter 接口说明
4. 跑 `node --test`
5. 打 `v0.1.0` 标签
6. 发布 Release，并附带：
   - 使用场景
   - 接口契约
   - 风控默认值
   - 示例 Skill

## 版本路线图

### v0.1

- 通用桥接层
- 基础预算策略
- 全能渠道推荐
- 激活码优先补给
- 文档渲染入口

### v0.2

- 真实账本抽象
- 多租户策略模板
- 代理商分佣字段
- 日报聚合器

### v0.3

- 闲鱼/发卡平台 Webhook 适配器
- 自动发卡文档模板
- 购买后自动开 Key + 发说明

## 发布注意事项

- 任何 demo 都不要暴露真实服务器地址
- 所有文档默认使用域名占位符
- 高价模型在示例中默认关闭自动补给
- 保留预算护栏为默认开启状态
