# Phase 7: Open Source Release - Context

**Gathered:** 2026-05-10
**Status:** Ready for planning

<domain>
## Phase Boundary

让 agent-energy-bridge 达到开源社区发布标准：完整文档（CONTRIBUTING.md、API 文档）、GitHub Actions CI/CD 流水线、自动化版本发布（changelog + tag + release）、Docker 镜像自动构建并推送到 ghcr.io、README 中英双语。

不包含：新功能开发、架构变更、v2 需求（多租户、Web Dashboard、数据持久化）。

</domain>

<decisions>
## Implementation Decisions

### API 文档
- **D-01:** 格式为 Markdown 手写，文件路径 `docs/API.md`
- **D-02:** 中英双语（同一文件，中英对照）
- **D-03:** 每个端点包含标准字段：方法 + 路径、请求参数、响应示例、错误码

### 版本发布策略
- **D-04:** 采用 Conventional Commits 规范（feat/fix/chore 前缀）
- **D-05:** 打 semver tag（v0.1.0 格式）自动触发 GitHub Actions release 工作流
- **D-06:** 自动生成 changelog + 创建 GitHub Release

### Docker 镜像
- **D-07:** 推送到 GitHub Container Registry（ghcr.io）
- **D-08:** 镜像打三种 tag：`latest` + semver（如 `v0.1.0`）+ sha（如 `sha-abc1234`）

### README 双语结构
- **D-09:** `README.md` 保持中文（主文件，GitHub 默认展示）
- **D-10:** 新建 `README.en.md` 英文版，两个文件各自独立

### CI 工作流
- **D-11:** PR 触发 CI，仅运行 `node --test`（213 个测试）
- **D-12:** 测试矩阵：Node.js 20 + 22

### CONTRIBUTING.md
- **D-13:** 完整集：开发环境搭建 + PR 流程 + commit 规范 + 代码规范 + 测试要求 + 分支策略 + 安全报告流程 + 路线图

### 开源安全边界
- **D-14:** `POST /notify/test` 端点添加 X-API-Key 认证，与其他管理端点保持一致
- **D-15:** Phase 7 执行前增加一个安全扫描任务，检查代码库中是否存在硬编码密钥、真实地址、私有配置（按 `docs/open-source-release-plan.md` 中的开源边界执行）

### Claude's Discretion
- GitHub Actions workflow 文件的具体 YAML 结构和 job 命名
- CONTRIBUTING.md 的具体排版和章节顺序
- changelog 的具体生成工具（可选 git-cliff、conventional-changelog-cli 或纯 GitHub Actions 内置）
- docs/API.md 中端点的分组方式

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 项目需求与范围
- `.planning/REQUIREMENTS.md` — OPEN-01~06 需求定义，Phase 7 全部 6 个需求
- `.planning/ROADMAP.md` §Phase 7 — 成功标准（6 条验收条件）
- `.planning/STATE.md` — 已知问题：POST /notify/test 无认证保护

### 开源边界与发布计划
- `docs/open-source-release-plan.md` — 开源边界定义（哪些内容不能开源）、GitHub 发布步骤、版本路线图

### 现有文档（需更新/参考）
- `README.md` — 现有中文 README，Phase 7 需同步更新并新建英文版
- `docker-compose.yml` — 现有 Docker 配置，CI/CD 构建镜像时参考
- `Dockerfile` — 现有容器配置（node:22-alpine，端口 3100，非 root 用户）
- `package.json` — 当前版本 v0.1.0，scripts 定义

### 安全相关
- `src/server/handlers/notify.js` — POST /notify/test 端点，需添加认证
- `src/server/middleware/` — 现有中间件模式，认证中间件参考

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/server/middleware/rate-limiter.js` — 现有中间件模式，新增认证中间件可参考此结构
- `src/server/router.js` — 路由注册模式，认证中间件注入点
- `src/server/handlers/notify.js` — 需修改的目标文件（添加 X-API-Key 校验）
- `test/*.test.js` — Node.js 内置测试框架，CI 直接运行 `node --test`

### Established Patterns
- 零外部依赖：所有新增代码（认证中间件、CI 脚本）不得引入 npm 依赖
- 处理器模式：`(request, response, context)` 三参数，context 为 DI 容器
- 环境变量命名：`AEB_` 前缀用于核心配置，新增 API Key 环境变量应遵循此规范
- 文件命名：全小写连字符，如 `auth-middleware.js`

### Integration Points
- `src/server/index.js` `buildContext()` — 新增认证配置注入点
- `src/server/router.js` — 路由级认证中间件挂载点
- `.github/workflows/` — 新建目录，存放 CI/CD 工作流文件

</code_context>

<specifics>
## Specific Ideas

- API 文档覆盖全部 16 个端点（含 Phase 6 新增的 `/notify/config`、`/notify/test`、`/refuel/status`）
- Docker 镜像名称：`ghcr.io/{owner}/agent-energy-bridge`
- Release 工作流触发条件：`push: tags: ['v*']`
- CI 工作流触发条件：`pull_request` + `push: branches: [main]`
- 安全扫描任务应在所有其他 Phase 7 任务之前执行（Wave 1）

</specifics>

<deferred>
## Deferred Ideas

- Web Dashboard（v2 需求 DASH-01/02）
- 多租户隔离（v2 需求 MULT-01/02）
- npm 包发布到 npmjs.com（未在 OPEN-01~06 中）
- OpenAPI/Swagger 规范文件（用户选择 Markdown 手写，OpenAPI 可作为 v2 增强）
- release-please 自动化（用户选择更简单的 tag 触发方式）

</deferred>

---

*Phase: 7-open-source-release*
*Context gathered: 2026-05-10*
