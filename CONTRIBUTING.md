# Contributing to Agent Energy Bridge

感谢你考虑为 Agent Energy Bridge 做贡献！本指南帮助你在最短时间内提交高质量 PR。

> [English](#english-version) | 中文版

---

## 中文版

### 1. 开发环境搭建

**前置要求：**

- **Node.js**：v20 或 v22（CI 覆盖此两版本）。推荐 v22 LTS。
- **操作系统**：macOS / Linux / Windows 均可。
- **零外部依赖**：本项目运行时不依赖任何 npm 包，仅使用 Node.js 内置模块（`http`, `fs`, `crypto`, `url`, 全局 `fetch`）。

**快速启动：**

```bash
git clone https://github.com/OWNER/agent-energy-bridge.git
cd agent-energy-bridge
cp .env.example .env
node --test
npm start
```

注意：项目无 `npm install` 步骤；`package-lock.json` 仅为 stub。

### 2. PR 流程

Fork → branch → commit → push → PR 的标准流程：

1. **Fork** 本仓库到你的 GitHub 账号
2. **创建分支**：`git checkout -b feat/your-feature-name`
3. **提交更改**：遵循 [Conventional Commits](#3-commit-规范) 规范
4. **推送分支**：`git push origin feat/your-feature-name`
5. **创建 Pull Request**：填写 PR 模板，说明变更原因和影响范围

**PR 评审标准：**

- CI 必须通过（`node --test` 219+ 测试全部绿）
- 不得添加 npm 外部依赖（`package.json` `dependencies` 字段保持为空）
- 新功能必须附带测试用例
- 代码必须符合项目编码规范（见第 4 节）
- PR 描述清晰，包含变更动机和测试方式

### 3. Commit 规范

采用 [Conventional Commits 1.0.0](https://www.conventionalcommits.org/zh-hans/v1.0.0/) 规范。

| 前缀 | 用途 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat: add quiet-hours support` |
| `fix` | 修复 bug | `fix: resolve race condition in refuel` |
| `docs` | 文档变更 | `docs: update README quickstart` |
| `test` | 测试用例 | `test: add cases for auth middleware` |
| `refactor` | 重构（无功能变更） | `refactor: extract helper from refuel` |
| `perf` | 性能改进 | `perf: cache balance for 30s` |
| `chore` | 构建/工具/杂项 | `chore: bump version to 0.2.0` |

可选 scope：`feat(auth): ...`。本项目使用 `git-cliff` 从 Conventional Commits 自动生成 CHANGELOG。

### 4. 代码规范

**硬性约束：**

- 不得添加 npm 外部依赖（`package.json` `dependencies` 字段保持为空）
- 不得使用 ESM 语法 — 全项目使用 CommonJS
- 不得引入 TypeScript 编译步骤
- 所有抛出的 `Error` 必须包含 `statusCode` 和 `code` 字段
- 2 空格缩进、单引号字符串、分号结尾
- 文件命名：全小写连字符（kebab-case）
- 类名：PascalCase
- 环境变量：`AEB_` / `NEWAPI_` / `AUTO_REFUEL_` 前缀

详见 `.planning/codebase/CONVENTIONS.md`。

### 5. 测试要求

测试框架：Node.js 内置 `node:test`（零外部依赖）。

```bash
node --test                                  # 全量测试（219+）
node --test test/auth-middleware.test.js     # 单文件
node tests/openclaw-agent-relay-smoke.mjs    # smoke
```

PR 必须：

- `node --test` 全部通过（CI 绿）
- 新功能附测试用例
- 修复 bug 先添加复现失败的测试，再修复

### 6. 分支策略

- `main` — 受保护分支；只接受通过 CI 的 PR
- `feat/*` — 新功能特性分支
- `fix/*` — 缺陷修复分支
- `docs/*` — 文档专属分支
- `refactor/*` — 重构分支
- `chore/*` — 维护性分支

禁止直接推送到 `main`。

### 7. 安全报告流程

发现安全漏洞时**不要**直接开 Issue。请按以下流程上报：

1. 使用 GitHub **Private Vulnerability Reporting**（仓库主页 → Security → Advisories → Report a vulnerability）
2. 报告内容包含：漏洞类型 / 复现步骤（PoC） / 受影响版本 / 期望处置方式
3. 维护者将在 72 小时内回复确认

完整流程见 `SECURITY.md`。

### 8. 路线图

完整开发计划见 `.planning/ROADMAP.md`。

- **M1: Production Ready** (Phase 1-3) — 安全加固、测试基线、并发安全 — 已完成
- **M2: Core Features Complete** (Phase 4-6) — Token 计量、多 Provider 路由、自动充值 — 已完成
- **M3: Open Source Launch** (Phase 7) — 文档、CI/CD、版本管理 — 进行中

新需求建议：开 GitHub Discussion 或 Issue 提议；不在此范围内的需求标注为 v2 候选。

---

## English Version

### 1. Development Setup

- Node.js v20 or v22 (CI matrix tests both); recommend v22 LTS.
- Zero runtime dependencies — pure Node.js built-ins.

```bash
git clone https://github.com/OWNER/agent-energy-bridge.git
cd agent-energy-bridge
cp .env.example .env
node --test
npm start
```

### 2. Pull Request Flow

Fork → branch (`feat/...`) → commit → push → PR. CI must be green before merge.

PR review checklist:
- All 219+ tests pass (`node --test`)
- No npm dependencies added
- New features include tests
- Code follows conventions (see Section 4)

### 3. Commit Convention

[Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/):

| Prefix | Use |
|--------|-----|
| `feat` | New feature |
| `fix`  | Bug fix |
| `docs` | Docs only |
| `test` | Tests |
| `refactor` | No behavior change |
| `perf` | Performance |
| `chore` | Build/tooling |

The `git-cliff` tool consumes these to auto-generate CHANGELOG entries.

### 4. Coding Standards

- No npm dependencies; runtime uses Node.js built-ins only
- CommonJS, not ESM
- 2-space indent, single quotes, semicolons
- kebab-case filenames, PascalCase classes
- Errors must carry `statusCode` and `code` fields

See `.planning/codebase/CONVENTIONS.md` for details.

### 5. Testing

```bash
node --test                                  # full suite (219+)
node --test test/auth-middleware.test.js     # single file
node tests/openclaw-agent-relay-smoke.mjs    # smoke test
```

New features require tests. Bug fixes require a failing test reproducing the bug first.

### 6. Branch Strategy

`main` is protected. Use `feat/*`, `fix/*`, `docs/*`, `refactor/*`, `chore/*` for branches. Never push directly to `main`.

### 7. Security Reports

Do not open public issues. Email `security@your-org.com` with the `[SECURITY]` subject prefix. See `SECURITY.md` for the full disclosure policy and response timeline.

### 8. Roadmap

See `.planning/ROADMAP.md`. Current milestones:
- M1 Production Ready (Phases 1-3) — Complete
- M2 Core Features (Phases 4-6) — Complete
- M3 Open Source Launch (Phase 7) — In Progress

---

## License

By contributing, you agree your contributions will be licensed under the project's MIT License.
