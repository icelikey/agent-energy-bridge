# Discussion Log — Phase 7: Open Source Release

**Date:** 2026-05-10
**Phase:** 7 — Open Source Release
**Areas discussed:** API 文档格式与托管、版本发布策略、Docker 镜像发布目标、README 双语结构、CI 工作流内容、CONTRIBUTING.md 范围、开源安全边界

---

## Area 1: API 文档格式与托管

| Question | Options | Selected |
|----------|---------|----------|
| 16 个端点的 API 文档用什么格式？ | OpenAPI 3.0 YAML / Markdown 手写 / README 内嵌 | Markdown 手写 |
| API 文档放在哪里？ | docs/API.md / API.md（根目录）/ README 内嵌 | docs/API.md |
| docs/API.md 用什么语言？ | 中文 / 英文 / 中英双语 | 中英双语 |
| 每个端点包含哪些内容？ | 标准字段 / 标准字段+curl 示例 / 简洁表格 | 标准字段（方法+路径、请求参数、响应示例、错误码） |

---

## Area 2: 版本发布策略

| Question | Options | Selected |
|----------|---------|----------|
| commit 和 changelog 用什么规范？ | Conventional Commits / Keep-a-Changelog 手写 / 自由格式 | Conventional Commits |
| Release 如何触发？ | 打 tag 自动触发 / 手动创建 Release / release-please 自动化 | 打 tag 自动触发 |
| tag 命名规范？ | semver（v0.1.0）/ 无前缀 semver / CalVer | semver（v0.1.0 格式） |

---

## Area 3: Docker 镜像发布目标

| Question | Options | Selected |
|----------|---------|----------|
| Docker 镜像推送到哪里？ | Docker Hub / ghcr.io / 两个都推 | GitHub Container Registry (ghcr.io) |
| 镜像打哪些 tag？ | latest + semver + sha / 只 semver / 只 latest | latest + semver + sha |

---

## Area 4: README 双语结构

| Question | Options | Selected |
|----------|---------|----------|
| README 双语如何组织？ | 两个文件 / 单文件中英对照 / README.md 英文+README.zh.md 中文 | 两个文件 |
| 哪个是主文件（GitHub 默认展示）？ | README.md 中文 / README.md 英文 | README.md 中文（保持现状） |

---

## Area 5: CI 工作流内容

| Question | Options | Selected |
|----------|---------|----------|
| PR CI 运行哪些检查？ | 仅测试 / 测试+npm audit / 测试+npm audit+CodeQL | 仅测试（node --test） |
| CI 测试哪些 Node.js 版本？ | Node 20+22 / 只 Node 22 / Node 18+20+22 | Node 20 + 22 |

---

## Area 6: CONTRIBUTING.md 范围

| Question | Options | Selected |
|----------|---------|----------|
| CONTRIBUTING.md 包含哪些内容？ | 最小集 / 标准集 / 完整集 | 完整集（开发环境+PR 流程+commit 规范+代码规范+测试要求+分支策略+安全报告流程+路线图） |

---

## Area 7: 开源安全边界

| Question | Options | Selected |
|----------|---------|----------|
| POST /notify/test 开源后如何处理认证？ | 添加 API Key 认证 / 限制 localhost-only / 不加认证文档警示 | 添加 X-API-Key 认证 |
| 开源前是否需要安全扫描？ | 按现有边界文档执行 / 增加安全扫描任务 | 增加开源前安全扫描任务 |

---

## Deferred Ideas

- npm 包发布到 npmjs.com（未在 OPEN-01~06 范围内）
- OpenAPI/Swagger 规范文件（用户选择 Markdown，OpenAPI 可作为 v2 增强）
- release-please 自动化（用户选择更简单的 tag 触发方式）
- Web Dashboard、多租户（v2 需求）

---

*Log generated: 2026-05-10*
