# Phase 7: Open Source Release - Research

**Researched:** 2026-05-11
**Domain:** GitHub Actions CI/CD + 开源发布工程（changelog、Docker 镜像、文档、安全扫描、API 认证）
**Confidence:** HIGH（对 GitHub Actions 生态、git-cliff、docker actions 等核心工具有官方文档与多源交叉验证）

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**API 文档**
- **D-01:** 格式为 Markdown 手写，文件路径 `docs/API.md`
- **D-02:** 中英双语（同一文件，中英对照）
- **D-03:** 每个端点包含标准字段：方法 + 路径、请求参数、响应示例、错误码

**版本发布策略**
- **D-04:** 采用 Conventional Commits 规范（feat/fix/chore 前缀）
- **D-05:** 打 semver tag（v0.1.0 格式）自动触发 GitHub Actions release 工作流
- **D-06:** 自动生成 changelog + 创建 GitHub Release

**Docker 镜像**
- **D-07:** 推送到 GitHub Container Registry（ghcr.io）
- **D-08:** 镜像打三种 tag：`latest` + semver（如 `v0.1.0`）+ sha（如 `sha-abc1234`）

**README 双语结构**
- **D-09:** `README.md` 保持中文（主文件，GitHub 默认展示）
- **D-10:** 新建 `README.en.md` 英文版，两个文件各自独立

**CI 工作流**
- **D-11:** PR 触发 CI，仅运行 `node --test`（213 个测试）
- **D-12:** 测试矩阵：Node.js 20 + 22

**CONTRIBUTING.md**
- **D-13:** 完整集：开发环境搭建 + PR 流程 + commit 规范 + 代码规范 + 测试要求 + 分支策略 + 安全报告流程 + 路线图

**开源安全边界**
- **D-14:** `POST /notify/test` 端点添加 X-API-Key 认证，与其他管理端点保持一致
- **D-15:** Phase 7 执行前增加一个安全扫描任务（Wave 1），检查代码库中是否存在硬编码密钥、真实地址、私有配置

### Claude's Discretion

- GitHub Actions workflow 文件的具体 YAML 结构和 job 命名
- CONTRIBUTING.md 的具体排版和章节顺序
- changelog 的具体生成工具（可选 git-cliff、conventional-changelog-cli 或纯 GitHub Actions 内置）
- docs/API.md 中端点的分组方式

### Deferred Ideas (OUT OF SCOPE)

- Web Dashboard（v2 需求 DASH-01/02）
- 多租户隔离（v2 需求 MULT-01/02）
- npm 包发布到 npmjs.com（未在 OPEN-01~06 中）
- OpenAPI/Swagger 规范文件（用户选择 Markdown 手写，OpenAPI 可作为 v2 增强）
- release-please 自动化（用户选择更简单的 tag 触发方式）

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OPEN-01 | CONTRIBUTING.md 贡献者指南 | §CONTRIBUTING.md 章节结构、Node.js OSS 行业模板 |
| OPEN-02 | 完整 API 文档（用户最终选 Markdown 手写，非 OpenAPI） | §API.md 结构与字段标准（D-01~03 已锁定） |
| OPEN-03 | GitHub Actions CI/CD 流水线 | §标准 Stack、§CI workflow YAML 模式 |
| OPEN-04 | 自动化版本发布流程（changelog + tag） | §git-cliff + softprops/action-gh-release 组合 |
| OPEN-05 | Docker 镜像自动构建与发布（到 ghcr.io） | §docker/build-push-action + metadata-action 三标签方案 |
| OPEN-06 | README 多语言支持（中英双语） | §README.en.md 单独文件方案、§README 链接 |

**新增非编号需求：**
- 安全扫描（D-15）：使用 gitleaks + 自定义 grep 规则在 Wave 1 拦截私有配置进入开源仓库
- POST /notify/test 认证（D-14）：与现有 middleware 模式一致的 X-API-Key 中间件

</phase_requirements>

## Summary

Phase 7 是一个纯工程化的"打磨"阶段，不涉及业务逻辑变更。技术选型已大部分被 CONTEXT.md 锁定，研究的主要价值在于：

1. **填充 Claude's Discretion 区域的具体工具选择**：CI 用 `actions/setup-node@v4`，changelog 用 `orhun/git-cliff-action@v4`，Release 用 `softprops/action-gh-release@v2`，Docker 用 `docker/build-push-action@v6` + `docker/metadata-action@v5`，安全扫描用 `gitleaks/gitleaks-action@v2`。
2. **识别零依赖项目的特殊处理**：`node --test` 直接调用，`npm ci` 可以工作（项目有 stub `package-lock.json`），但缓存的收益有限，可以省略 `cache: 'npm'`。
3. **确保 Workflow 文件遵循"最小权限"原则**：CI workflow `contents: read`；Release/Docker workflow 需要 `contents: write` + `packages: write`。
4. **明确安全扫描边界**：`.gitignore` 已排除 `docs/reseller-pack/`、`docs/deployments/`、`docs/private-*.md`，所以扫描重点在 `src/`、`skills/`、`tests/`、`bin/`、`scripts/`、根目录 `*.md`、`docker-compose.yml`、`.env.example`。
5. **新增的 X-API-Key 中间件需复用现有 `(req, res, next)` 中间件模式**（参考 `src/server/middleware/rate-limiter.js`），不引入外部依赖。

**Primary recommendation:** 把 Phase 7 拆为 4 个 Wave，按顺序执行：(1) 安全扫描 + X-API-Key 加固 → (2) API.md + CONTRIBUTING.md + SECURITY.md + README.en.md 文档集 → (3) CI workflow（`ci.yml`） → (4) Release + Docker 工作流（`release.yml`），让安全门槛先达成，再补文档，最后接 CI/CD 闭环。

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| X-API-Key 认证（/notify/test） | API / Backend（middleware） | — | 与现有 `rate-limiter.js`、`json-body.js` 同层；context 注入式 DI |
| CI 测试编排 | CI / GitHub Actions | — | 不进运行时；纯 workflow YAML |
| Changelog 生成 | CI / GitHub Actions | Git 历史（数据源） | 由 `git-cliff` 解析 Conventional Commits 元数据 |
| Docker 镜像构建 | CI / GitHub Actions | Docker registry（ghcr.io） | docker buildx + push-action 双方协作 |
| 文档（API.md / CONTRIBUTING.md / SECURITY.md / README.en.md） | 仓库根 / `docs/` | — | 纯 Markdown 静态文件，无运行时依赖 |
| 安全扫描（私有信息检测） | CI / 本地 Pre-commit | Source tree | 在合并/发布前拦截，不进入生产 |

**为什么这个映射很重要：** Phase 7 的所有"实施"几乎都发生在仓库层和 CI 层，运行时代码改动**仅限**新增 1 个中间件（X-API-Key auth）。Planner 不应把 changelog/CI 任务误归到 `src/` 改动。

---

## Standard Stack

### Core (GitHub Actions)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `actions/checkout` | `@v4` | Checkout 代码 | GitHub 官方，行业标配 [VERIFIED: setup-node v4 docs] |
| `actions/setup-node` | `@v4` | 设置 Node.js 环境 + npm cache | 官方推荐配置，支持 .nvmrc / version-file [CITED: github.com/actions/setup-node] |
| `docker/setup-buildx-action` | `@v3` | 启用 buildx 多平台构建 | 官方 Docker action [CITED: docs.docker.com/build/ci/github-actions] |
| `docker/login-action` | `@v3` | 登录 ghcr.io | 官方 Docker action |
| `docker/metadata-action` | `@v5` | 生成 tags + labels（含 semver / sha / latest） | 官方 Docker action [CITED: github.com/docker/metadata-action] |
| `docker/build-push-action` | `@v6` | 构建并推送镜像 | 官方 Docker action |
| `softprops/action-gh-release` | `@v2`（保守）或 `@v3`（如果 runner Node 24 ready） | 创建 GitHub Release（含 body + assets） | 9.6k stars，事实标准 [CITED: github.com/softprops/action-gh-release] |
| `orhun/git-cliff-action` | `@v4` | 从 Conventional Commits 生成 CHANGELOG.md | git-cliff 是 Rust 实现，10.9k stars [CITED: github.com/orhun/git-cliff] |
| `gitleaks/gitleaks-action` | `@v2` | 密钥扫描 | 由 gitleaks 官方维护 [CITED: github.com/gitleaks/gitleaks-action] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `cliff.toml` (git-cliff 配置) | N/A | 自定义 changelog 模板 + 分组规则 | 用户希望中英分组、自定义 emoji、过滤 chore | 
| `.gitleaks.toml` (gitleaks 配置) | N/A | 允许特定 false positive（如 `your-api-key-here` 占位符） | `.env.example` 中已包含占位符词，需要 allowlist | 

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `git-cliff` | `conventional-changelog-cli` (Node.js)<br>`TriPSs/conventional-changelog-action` | git-cliff 更快（Rust 编译），配置更灵活；conventional-changelog 生态更广但需要 Node 运行环境。AEB 项目"零依赖"原则下 git-cliff 更契合（不需要 npm install） |
| `softprops/action-gh-release` | `release-drafter`<br>`semantic-release` | release-drafter 基于 PR 标签持续草拟，不匹配本项目"tag 触发"决策；semantic-release 自动 bump 版本但隐藏控制权，与"手动打 tag"决策冲突 |
| `gitleaks` | `trufflehog`<br>纯 grep 脚本 | trufflehog 有 800+ detector 还能联网验证，但慢且需 Python 环境；gitleaks 纯 Go 二进制，CI 友好，且本项目无真实密钥需验证 |
| `softprops/action-gh-release@v3` | `softprops/action-gh-release@v2` | v3 用 Node 24，runner 兼容性还在过渡；**推荐先用 v2.6.2（最后 Node 20 兼容版）以避免 runner 兼容问题** |
| Single workflow file | 三个独立 workflow（ci / release / docker-publish） | 独立文件可读性更好、触发条件清晰、权限隔离；这是 GitHub Actions 社区主流做法 |

**Installation:**

不需要任何 npm 安装。所有工具均通过 GitHub Actions marketplace 引用。本地开发者如希望预运行 git-cliff，可：

```bash
# Linux/macOS
curl -L https://github.com/orhun/git-cliff/releases/latest/download/git-cliff-x86_64-unknown-linux-gnu.tar.gz | tar xz

# Windows
winget install git-cliff
```

**Version verification:**

| Package | Verified | Date Checked | Notes |
|---------|----------|--------------|-------|
| `actions/setup-node@v4` | ✓ | 2026-05-11 | v4.x 当前稳定线 [CITED: github.com/actions/setup-node] |
| `actions/checkout@v4` | ✓ | 2026-05-11 | v4.x 当前稳定线 |
| `docker/build-push-action@v6` | ✓ | 2026-05-11 | v6 当前推荐版本 [CITED: docs.docker.com] |
| `docker/metadata-action@v5` | ✓ | 2026-05-11 | v5 配对 build-push v6 |
| `docker/login-action@v3` | ✓ | 2026-05-11 | v3 当前推荐 |
| `softprops/action-gh-release@v2` | ✓ | 2026-05-11 | v3.0.0 已发布但需要 Node 24 runner；**推荐 v2.x** [VERIFIED: WebSearch] |
| `orhun/git-cliff-action@v4` | ✓ | 2026-05-11 | v4 当前 [CITED: github.com/orhun/git-cliff-action] |
| `gitleaks/gitleaks-action@v2` | ✓ | 2026-05-11 | v2 当前 |

---

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────── Developer / Contributor ───────────────────────┐
│                                                                       │
│  git commit (Conventional Commits)                                    │
│        │                                                              │
│        ▼                                                              │
│  git push origin feature-branch                                       │
│        │                                                              │
│        ▼                                                              │
│  Open Pull Request ───────────────────────┐                          │
│        │                                  │                           │
└────────┼──────────────────────────────────┼───────────────────────────┘
         │                                  │
         │  trigger: pull_request           │  trigger: push to main
         │                                  │
         ▼                                  ▼
┌────────────────────────────────────────────────────────────┐
│                  GitHub Actions: ci.yml                    │
│   ┌────────────┐  ┌────────────┐  ┌──────────────────┐    │
│   │ Test       │  │ Test       │  │ Security Scan    │    │
│   │ Node 20    │  │ Node 22    │  │ (gitleaks)       │    │
│   │ node --test│  │ node --test│  │                  │    │
│   └────────────┘  └────────────┘  └──────────────────┘    │
│         All jobs must pass for PR mergeability             │
└────────────────────────────────────────────────────────────┘
                                  │
                                  │  After merge, maintainer pushes tag
                                  │  git tag v0.1.0 && git push --tags
                                  ▼
┌────────────────────────────────────────────────────────────┐
│              GitHub Actions: release.yml                   │
│                  trigger: push tags v*                     │
│                                                            │
│   ┌─────────────────────────────────────────────────────┐ │
│   │ 1. checkout (fetch-depth: 0)                        │ │
│   │ 2. git-cliff-action → generate CHANGELOG body       │ │
│   │ 3. softprops/action-gh-release → create Release     │ │
│   │    with body=changelog + auto-attached source tar   │ │
│   └─────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
                                  │
                                  │  in parallel
                                  ▼
┌────────────────────────────────────────────────────────────┐
│              GitHub Actions: docker-publish.yml            │
│   trigger: push tags v* (and optional: push to main→latest)│
│                                                            │
│   ┌─────────────────────────────────────────────────────┐ │
│   │ 1. setup-buildx                                     │ │
│   │ 2. login to ghcr.io (GITHUB_TOKEN)                  │ │
│   │ 3. metadata-action → tags: latest, vX.Y.Z, sha-XXX  │ │
│   │ 4. build-push-action → push 3 tags to ghcr.io       │ │
│   └─────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                ┌─────────────────────────────────┐
                │  ghcr.io/{owner}/agent-energy-  │
                │  bridge:latest                  │
                │  bridge:v0.1.0                  │
                │  bridge:sha-abc1234             │
                └─────────────────────────────────┘

                Concurrent runtime path:
┌────────────────────────────────────────────────────────────┐
│  HTTP request → src/server/index.js                        │
│     │                                                      │
│     ▼                                                      │
│  setSecurityHeaders → rateLimiter middleware →             │
│     [NEW] apiKeyAuth middleware (only for admin routes)    │
│     → handleRequest → router → handler                     │
└────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
H:/projects/smart-relay-station/
├── .github/                        # 新建目录
│   ├── workflows/
│   │   ├── ci.yml                  # PR + push:main → 测试矩阵 + gitleaks
│   │   ├── release.yml             # push:tags 'v*' → CHANGELOG + Release
│   │   └── docker-publish.yml      # push:tags 'v*' → ghcr.io 3 tags
│   ├── ISSUE_TEMPLATE/             # 可选 (D-13 没明确要求，但社区标配)
│   │   ├── bug_report.md
│   │   └── feature_request.md
│   └── pull_request_template.md    # 可选
├── docs/
│   ├── API.md                      # 新增：16 个端点 中英对照
│   └── (现有文档保持不变)
├── src/
│   └── server/
│       ├── middleware/
│       │   ├── api-key-auth.js     # 新增：X-API-Key 认证
│       │   ├── rate-limiter.js
│       │   ├── json-body.js
│       │   └── error-handler.js
│       ├── handlers/
│       │   └── notify.js           # 修改：postNotifyTest 标记 requireAuth
│       ├── router.js               # 修改：注入 apiKeyAuth 中间件
│       └── index.js                # 修改：buildContext 注入 adminApiKey
├── test/
│   └── api-key-auth.test.js        # 新增：中间件测试
├── CHANGELOG.md                    # 新增：首版由 git-cliff 生成
├── CONTRIBUTING.md                 # 新增
├── SECURITY.md                     # 新增
├── README.md                       # 已存在 (中文)
├── README.en.md                    # 新增 (英文)
├── cliff.toml                      # git-cliff 配置
├── .gitleaks.toml                  # gitleaks 配置 (allowlist 占位符)
└── .env.example                    # 现有，需新增 AEB_ADMIN_API_KEY
```

### Pattern 1: CI Workflow（PR + push:main 矩阵测试）

**What:** 在 PR 和 main 分支推送时跑 Node 20 + Node 22 双版本测试，外加 gitleaks 扫描。
**When to use:** OPEN-03 的核心实现。
**Example:**

```yaml
# .github/workflows/ci.yml
# Source: https://docs.github.com/en/actions/automating-builds-and-tests/building-and-testing-nodejs
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  test:
    name: Test (Node ${{ matrix.node }})
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        node: [20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: 'npm'        # 本项目有 stub package-lock.json，可启用
      - run: npm ci           # 在 zero-deps 项目上也能正常工作（lockfileVersion 3）
      - run: node --test

  secrets-scan:
    name: Secrets Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0      # gitleaks 需要全部 git 历史
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # 本项目为个人 owner 仓库时无需 license key
          # 若 organization 仓库需补 GITLEAKS_LICENSE secret
```

**关键决策点：**
- 矩阵 `os: [ubuntu-latest]` 单平台即可（D-12 锁定，且 Node `node --test` 跨平台行为一致；多 OS 是边际收益）。
- `fail-fast: false` 让 Node 20 失败也不取消 Node 22，便于诊断版本特定问题。
- `permissions: contents: read` 最小化权限。

### Pattern 2: Release Workflow（tag 推送 → CHANGELOG + Release）

**What:** 推送 `v*` tag 时自动从 Conventional Commits 生成 changelog 并发布 GitHub Release。

```yaml
# .github/workflows/release.yml
# Source: https://github.com/orhun/git-cliff-action#example-workflow
name: Release

on:
  push:
    tags: ['v*']

permissions:
  contents: write   # softprops/action-gh-release 需要

jobs:
  release:
    name: Create Release
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0   # git-cliff 必须有完整历史

      - name: Generate changelog
        id: changelog
        uses: orhun/git-cliff-action@v4
        with:
          config: cliff.toml
          args: -vv --latest --strip header
        env:
          OUTPUT: CHANGES.md

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          body: ${{ steps.changelog.outputs.content }}
          draft: false
          prerelease: false
          # GITHUB_TOKEN 自动可用，无需声明
```

### Pattern 3: Docker Publish Workflow（tag → 3 tags 到 ghcr.io）

```yaml
# .github/workflows/docker-publish.yml
# Source: https://docs.docker.com/build/ci/github-actions/manage-tags-labels/
name: Docker Publish

on:
  push:
    tags: ['v*']
    branches: [main]   # 同时让 main push 更新 latest（可选）

permissions:
  contents: read
  packages: write    # ghcr.io 推送需要

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Lowercase repo name
        run: echo "REPO_LC=${GITHUB_REPOSITORY,,}" >> $GITHUB_ENV

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ env.REPO_LC }}
          tags: |
            type=raw,value=latest,enable={{is_default_branch}}
            type=semver,pattern={{version}}
            type=sha,prefix=sha-,format=short

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          # 单平台即可；多平台 (linux/arm64) 留作 v2 增强
          platforms: linux/amd64
```

**注意：** D-08 锁定的"三种 tag"在 `metadata-action` 里需要 **3 行 `tags:` 配置**对应：
- `latest` → `type=raw,value=latest,enable={{is_default_branch}}`
- `v0.1.0` semver → `type=semver,pattern={{version}}`（注意：是 `v0.1.0` 还是 `0.1.0`？metadata-action 默认产生 **不带 v** 的版本号；如果用户期望 `v0.1.0` 字面 tag，需要改成 `pattern=v{{version}}` 或 `type=ref,event=tag`）— **planner 在 plan 中应明确这个 pattern 选择，并在 PR 中说明**
- `sha-abc1234` → `type=sha,prefix=sha-,format=short`

### Pattern 4: X-API-Key 中间件（运行时变更）

**What:** 用零依赖的 Node.js 中间件实现 X-API-Key 认证，匹配现有 `rate-limiter.js` 的 `(req, res, next)` 签名。

```javascript
// src/server/middleware/api-key-auth.js
// Source: 自创，基于现有 rate-limiter.js 模式

const { timingSafeEqual } = require('crypto');

const DEFAULT_OPTIONS = {
  headerName: 'x-api-key',
  apiKey: null,           // 由 buildContext 注入，源自 process.env.AEB_ADMIN_API_KEY
};

function createApiKeyAuth(options = {}) {
  const headerName = options.headerName ?? DEFAULT_OPTIONS.headerName;
  const apiKey = options.apiKey ?? DEFAULT_OPTIONS.apiKey;

  return (req, res, next) => {
    // 若未配置 API key，跳过认证（向后兼容已部署的实例）
    if (!apiKey) return next();

    const provided = req.headers[headerName];
    if (!provided) {
      const error = new Error('Missing X-API-Key header');
      error.statusCode = 401;
      error.code = 'AUTH_REQUIRED';
      return next(error);
    }

    // 使用 timingSafeEqual 防止时序攻击
    const a = Buffer.from(provided);
    const b = Buffer.from(apiKey);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      const error = new Error('Invalid API key');
      error.statusCode = 401;
      error.code = 'AUTH_INVALID';
      return next(error);
    }

    next();
  };
}

module.exports = { createApiKeyAuth };
```

**集成点：**
- `src/server/index.js` `buildContext()` 新增 `adminApiKey: process.env.AEB_ADMIN_API_KEY || null` 注入
- `src/server/router.js` 在路由表上为需要保护的端点添加 `requiresAuth: true` 标记，在 `handleRequest` 中按需调用 `apiKeyAuth`
- 仅 `POST /agent/v1/notify/test` 强制要求（D-14）；架构上设计为**可扩展**到其他端点（例如未来的 `/notify/config` 修改、`/ops/start|stop`）

**关键设计原则：**
- 未设置 `AEB_ADMIN_API_KEY` 时**跳过认证**（兼容现有部署，避免破坏性变更）
- 用 `timingSafeEqual` 而不是 `===`（防时序攻击）
- 错误码遵循现有约定（`AUTH_REQUIRED` / `AUTH_INVALID`），与 `rate-limiter.js` 的 `RATE_LIMIT_EXCEEDED` 同风格

### Pattern 5: cliff.toml 配置（Conventional Commits → 中文友好 changelog）

```toml
# cliff.toml
# Source: https://git-cliff.org/docs/configuration

[changelog]
header = "# Changelog\n\nAll notable changes documented here.\n"
body = """
{% if version %}\
## [{{ version | trim_start_matches(pat="v") }}] - {{ timestamp | date(format="%Y-%m-%d") }}
{% else %}\
## Unreleased
{% endif %}\
{% for group, commits in commits | group_by(attribute="group") %}
### {{ group | upper_first }}
{% for commit in commits %}
- {{ commit.message | upper_first }}
{% endfor %}
{% endfor %}\n
"""
footer = ""
trim = true

[git]
conventional_commits = true
filter_unconventional = true
split_commits = false
commit_parsers = [
    { message = "^feat", group = "Features" },
    { message = "^fix", group = "Bug Fixes" },
    { message = "^docs", group = "Documentation" },
    { message = "^perf", group = "Performance" },
    { message = "^refactor", group = "Refactor" },
    { message = "^test", group = "Tests" },
    { message = "^chore\\(release\\)", skip = true },
    { message = "^chore", group = "Chores" },
]
protect_breaking_commits = false
filter_commits = false
tag_pattern = "v[0-9]*"
```

**Bootstrap 策略（首次生成 CHANGELOG.md）：** 项目还没有规范化的历史 commit，初次发布 `v0.1.0` 时使用：

```bash
# 本地一次性
git-cliff -o CHANGELOG.md
git add CHANGELOG.md
git commit -m "chore(release): initialize CHANGELOG.md"
git tag v0.1.0
git push origin main --tags
```

之后所有的 Release workflow 会用 `--latest --strip header` 只取最新版的部分，避免重复整文。

### Anti-Patterns to Avoid

- **❌ 用 `package-lock.json: false` 跳过锁文件，再让 CI 跑 `npm install`**：会导致跨次 CI 拿到不同的 transitive deps；本项目已经有 stub lockfile，**保留**并让 `npm ci` 正常工作即可。
- **❌ Workflow 用 `@main` 或 `@latest` 引用 action**：会被供应链攻击 / breaking change 影响；**全部 pin 到 `@v4`、`@v5`、`@v6` 主版本号**（GitHub Actions 社区共识 = 中位安全策略，下面 LOW 风险见 §Common Pitfalls）。
- **❌ 在 docker-publish workflow 用 `username: ${{ github.repository_owner }}` 推送 ghcr.io**：repository_owner 可能是大写而 ghcr.io 镜像名必须小写；用 `${{ github.actor }}` + 显式 `REPO_LC` 转小写。
- **❌ 把 X-API-Key 直接放进 README/docs 示例 curl**：示例必须用 `your-api-key-here` 占位符并加 `[REPLACE_ME]` 注释。
- **❌ Release workflow 直接跑 git-cliff 但不 fetch-depth: 0**：会得到空 CHANGELOG（详见 §Common Pitfall #1）。
- **❌ CI workflow 设置 `permissions: write-all`**：违背最小权限原则；CI 只需要 `contents: read`。
- **❌ 用 `releases: published` trigger 替代 `push: tags`**：会产生循环（action-gh-release 创建 release 又触发自己）。
- **❌ 一边 `softprops/action-gh-release@v2` 一边 `@v3` 混用**：v3 要求 Node 24 runner，可能在 self-hosted 上失败；统一用 v2.x。

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 解析 Conventional Commits → Changelog | 自己写 `git log` + sed/awk pipeline | `git-cliff` (Rust binary) | 800+ 项目使用；多种边角情况（BREAKING CHANGE、scope、merge commits）已被处理 |
| Docker 多标签生成 | shell 拼 `docker tag` 命令 | `docker/metadata-action@v5` | 标签命名规则与 OCI 规范契合（小写约束、tag 长度限制、字符集） |
| GitHub Release 创建 | `gh release create` 在 workflow 里跑 | `softprops/action-gh-release@v2` | 上传 asset、grouping、edit existing release 的边角已被处理 |
| 密钥扫描 | 自写 grep 模式 | `gitleaks-action@v2` | 150+ 内置规则 + SARIF 输出 + PR 评论 |
| 时序安全的 API key 比较 | `if (provided === apiKey)` | `crypto.timingSafeEqual()` | 防止 timing attack（Node 内置，零依赖） |
| 版本号 bump | shell 脚本编辑 package.json | 手动改 `package.json` + tag（用户已锁定 D-05 手动 tag） | 用户明确不要 release-please，保留人工控制 |
| 中英双语 changelog 输出 | 维护两份 changelog 文件 | 直接在 cliff.toml 模板里输出英文 type 名 + 中文 description | 单一来源，仍可阅读 |

**Key insight:** Phase 7 几乎所有工作都是"组合已有 GitHub Action 工具"。任何自己写 shell 拼接 docker/git 命令的设计都是 anti-pattern。**唯一例外**是 X-API-Key 中间件，因为它是项目运行时代码，必须遵循"零依赖"约束。

---

## Common Pitfalls

### Pitfall 1: git-cliff 在 CI 拿到空 changelog
**What goes wrong:** Release workflow 跑出来 CHANGELOG 为空或缺失大部分历史。
**Why it happens:** `actions/checkout@v4` 默认 `fetch-depth: 1`（浅克隆），只有最新 commit。git-cliff 需要遍历 tag 之间的完整历史。
**How to avoid:** 在 release workflow 的 checkout step **必须**写 `fetch-depth: 0`。
**Warning signs:** 第一次 Release 看 changelog 只有 "Initial release"；或 GitHub Release 详情页空空如也。

### Pitfall 2: ghcr.io 推送权限被拒绝
**What goes wrong:** `docker push` 时报 `denied: permission_denied` 或 `403 unauthorized`。
**Why it happens:** Workflow 缺少 `permissions: packages: write`，或 GHCR 包默认 visibility 是 private 但 workflow token 没权限。
**How to avoid:** Workflow top-level 显式声明 `permissions: { contents: read, packages: write }`；首次发布后，到 GitHub UI 的 Packages 页面把可见性设为 public，否则匿名 docker pull 会失败。
**Warning signs:** 第一次 release 失败在 "Build and push" step；或 `docker pull ghcr.io/...` 在另一台机器报 "manifest unknown"。

### Pitfall 3: metadata-action 产生 0.x.x 时的 major tag
**What goes wrong:** `type=semver,pattern={{major}}` 会为 v0.1.0 产生一个 `0` 的 tag，但 OCI spec 不推荐用纯数字作为 tag 名头一字符（虽然合法），更重要的是"0"作为镜像 tag 没有意义。
**Why it happens:** semver pattern 是默认 docker recipe 的一部分；本项目还在 0.x 期。
**How to avoid:** **不要**在 metadata-action 的 tags 中包含 `type=semver,pattern={{major}}`；保留 D-08 锁定的三个 tag（latest / 完整 semver / sha）即可。
**Warning signs:** 镜像 registry 出现 `:0` 这种奇怪 tag。

### Pitfall 4: X-API-Key 中间件破坏现有部署
**What goes wrong:** 用户更新到 0.2.0 后，原来能调用的 `/notify/test` 突然返回 401。
**Why it happens:** 默认要求 API key，但用户没有迁移指南。
**How to avoid:** **未设置 `AEB_ADMIN_API_KEY` 环境变量时跳过认证**（中间件中已设计），并在 CHANGELOG / Release notes 中明确："如需保护 admin 端点，请设置 `AEB_ADMIN_API_KEY` 环境变量"。
**Warning signs:** 用户 issue / 部署回滚。

### Pitfall 5: gitleaks 误报 `.env.example` 中的占位符
**What goes wrong:** `your-api-key-here`、`your-username` 这些占位符被 gitleaks 高熵规则检测为"可能的密钥"。
**Why it happens:** 高熵字符串检测器。
**How to avoid:** 提供 `.gitleaks.toml` allowlist：

```toml
[allowlist]
description = "Allowlist for env templates"
paths = [
    '''\.env\.example$''',
    '''docs/.*\.md$''',
]
regexes = [
    '''your-(api-key|password|username)-here''',
    '''<YOUR_[A-Z_]+>''',
]
```
**Warning signs:** CI 红色，错误指向 `.env.example`。

### Pitfall 6: Workflow 触发 race / 多次跑同一份代码
**What goes wrong:** 推送 `v0.1.0` tag 时，如果 main 分支同时也有未推送的 commit，可能让 docker-publish 同时跑两次（main push + tag push）。
**Why it happens:** Trigger 同时匹配 `push.branches: [main]` 和 `push.tags: ['v*']`。
**How to avoid:** 用 `concurrency` group 限流：
```yaml
concurrency:
  group: docker-publish-${{ github.ref }}
  cancel-in-progress: false
```
**Warning signs:** 同一 SHA 出现两个 `sha-XXX` workflow run。

### Pitfall 7: README.en.md 文件名不被 GitHub 识别
**What goes wrong:** GitHub 自动展示 README，但不会自动 link 到英文版。
**Why it happens:** GitHub 默认只渲染根目录 README.md；其他翻译需要在 README.md 顶部手动写链接。
**How to avoid:** 在 README.md 顶部第一行加 `> [English](./README.en.md) | 中文`；对应在 README.en.md 顶部加 `> English | [中文](./README.md)`。
**Warning signs:** 国际用户找不到英文文档。

### Pitfall 8: changelog 把 chore(release) 也收录
**What goes wrong:** 每次发版自动写入的 `chore(release): v0.1.0` commit 也出现在 changelog 中，造成噪音。
**Why it happens:** 默认 cliff.toml 不过滤这种 commit。
**How to avoid:** 在 `cliff.toml` 的 `commit_parsers` 加 `{ message = "^chore\\(release\\)", skip = true }`（上文 Pattern 5 已包含）。

---

## Runtime State Inventory

> 本阶段主要是"添加新文件"和"添加新 workflow"，但 D-14 引入一个新的中间件，且 D-15 涉及一次性扫描。

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | None — 项目内存存储，无持久数据需迁移 | None |
| **Live service config** | 已部署的 AEB 实例若开启 `AEB_ADMIN_API_KEY`，原 `POST /notify/test` 会突然 401 | **代码层兼容设计**：未配置 API key 时跳过认证（中间件已设计），无需 data migration；用户升级文档需说明 |
| **OS-registered state** | None — AEB 不注册 systemd / Task Scheduler 项 | None |
| **Secrets and env vars** | 新增 `AEB_ADMIN_API_KEY` 环境变量；`.env.example` 需更新；docker-compose.yml 可选透传 | 代码读取 `process.env.AEB_ADMIN_API_KEY`，文档更新，docker-compose.yml 加注释行 |
| **Build artifacts / installed packages** | Docker 镜像 tag 之前如有用户发布到自己 registry，名称无关；ghcr.io 是新 registry | None — ghcr.io 仓库首次创建 |

**关键迁移考虑（D-15 安全扫描）：**

| 区域 | 是否有私有信息 | 处理 |
|------|------------|------|
| `docs/reseller-pack/` | YES — 含 reseller-accounts.csv/json 等 | **已被 .gitignore 排除**（已验证），但需确认 git 历史中无暴露 |
| `docs/deployments/` | 可能有真实地址 | **已被 .gitignore 排除**（已验证） |
| `docs/private-*.md` | YES | **已被 .gitignore 排除**（已验证） |
| `docs/*.md`（其余） | 占位符或示例域名 | 扫描确认无 |
| `src/` | 测试用 mock 数据 | 扫描确认无；`test/refuel-orchestrator.test.js` 等可能含 `'ak-demo'` 字面量（OK） |
| `skills/` | Node.js 脚本 | 扫描确认无真实 URL/key |
| `.env.example` | 占位符 (`your-api-key-here`) | gitleaks allowlist 排除 |
| `README.md` | 示例 IP/域名 | 扫描确认全部为 `example.com` / `gateway.example.com` 占位符 |
| Git 历史 | 可能含早期硬编码（已在 Phase 1 修复） | gitleaks 全历史扫描确认 |

---

## Common Pitfalls (额外：Phase 7 特有的迁移风险)

### Pitfall 9: Git 历史里仍有早期硬编码密码
**What goes wrong:** Phase 1 SECU-01 修复了硬编码密码，但 git 历史里**仍然有**这些字符串。gitleaks 全历史扫描会报警，且任何 git clone 用户都能 `git log -S 'password'` 找到。
**Why it happens:** Git 删改文件不会删历史。
**How to avoid:**
1. 用 `gitleaks detect --redact` 在 Wave 1 全历史扫描，列出所有发现
2. 若发现**真实密钥**，必须用 `git filter-repo` 重写历史（**破坏性操作，与所有 fork 兼容性丧失**）
3. 若发现的是已撤销/测试密钥，记录在 SECURITY.md 中说明
**Warning signs:** 首次 push 公开仓库后，gitleaks 在 GitHub 报警；或安全研究人员开 issue。

---

## Code Examples

### Example: 集成 X-API-Key 中间件到 router

```javascript
// src/server/router.js 改动示例
// 在 ROUTES 数组中标记需要保护的路由

const ROUTES = [
  { method: 'GET',  path: '/agent/v1/health',            handler: getHealth },
  // ... 其他公开端点 ...
  // 标记需要 admin 认证的端点
  { method: 'POST', path: '/agent/v1/notify/test',       handler: postNotifyTest, requiresAuth: true },
  // (可选预留) 未来需要保护的端点：
  // { method: 'POST', path: '/agent/v1/ops/start',     handler: postOpsStart, requiresAuth: true },
];

// 在 handleRequest 中按需调用 auth middleware
async function handleRequest(req, res, context, options = {}) {
  const request = createRequestObject(req);

  if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
    request.body = await parseJsonBody(req, { maxBodySize: options.maxBodySize });
  }

  const route = ROUTES.find((r) => r.method === request.method && r.path === request.path);
  if (!route) {
    const error = new Error(`Not found: ${request.method} ${request.path}`);
    error.statusCode = 404;
    error.code = 'NOT_FOUND';
    throw error;
  }

  // [NEW] Check auth requirement
  if (route.requiresAuth && context.apiKeyAuth) {
    await new Promise((resolve, reject) => {
      context.apiKeyAuth(req, res, (err) => (err ? reject(err) : resolve()));
    });
  }

  const result = await route.handler(request, res, context);

  if (!res.headersSent) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(result));
  }
}
```

```javascript
// src/server/index.js buildContext 改动示例
const { createApiKeyAuth } = require('./middleware/api-key-auth');

function buildContext(options = {}) {
  const adminApiKey = options.adminApiKey ?? process.env.AEB_ADMIN_API_KEY ?? null;
  return {
    // ... existing fields ...
    notificationService: options.notificationService || null,
    // [NEW]
    adminApiKey,
    apiKeyAuth: adminApiKey ? createApiKeyAuth({ apiKey: adminApiKey }) : null,
  };
}
```

### Example: API.md 端点条目格式

```markdown
## POST /agent/v1/notify/test

发送测试通知 / Send a test notification

**Auth:** Required (`X-API-Key` header)
**Method:** `POST`

### Request

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| channel | string | No | 通知渠道 / Channel name (webhook, feishu, dingtalk, slack, wecom, email) |
| url | string | Conditional | 指定 channel 时必填 / Required when channel is specified |
| level | string | No | 级别：info / warn / critical（默认 info）|
| title | string | No | 通知标题 / Notification title |
| message | string | No | 通知正文 / Notification body |

### Response (200)

\```json
{
  "sent": ["webhook", "feishu"],
  "failed": [],
  "skipped": ["dingtalk"]
}
\```

### Errors

| Code | Status | Meaning |
|------|--------|---------|
| `AUTH_REQUIRED` | 401 | Missing `X-API-Key` header |
| `AUTH_INVALID` | 401 | Wrong API key |
| `MISSING_URL` | 400 | `channel` specified but no `url` |
| `SERVICE_NOT_CONFIGURED` | 503 | Notification service not initialized |

### Example

\```bash
curl -X POST http://localhost:3100/agent/v1/notify/test \
  -H "X-API-Key: $AEB_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"channel":"webhook","url":"https://example.com/hook","level":"info"}'
\```
```

### Example: README.en.md 顶部头部

```markdown
> English | [中文](./README.md)

# Agent Energy Bridge

[![CI](https://github.com/{owner}/agent-energy-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/{owner}/agent-energy-bridge/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-22%2B-brightgreen.svg)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/docker-ghcr.io-blue.svg)](https://github.com/{owner}/agent-energy-bridge/pkgs/container/agent-energy-bridge)

A sidecar service for AI agents that handles budget guard, model recommendation, auto-refuel, and session scoring — built for use alongside your existing LLM gateway (new-api, sub2api, OpenAI-compatible).

## Quick Start
...
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `actions/checkout@v3` + `node-version: '20'` | `actions/checkout@v4` + `node-version: 20` (number not string) | 2024Q1 | v4 默认 Node 20 runner, v3 进入 deprecation |
| `docker/build-push-action@v5` | `@v6` | 2024Q2 | v6 默认启用 attestations 提升供应链安全 |
| `softprops/action-gh-release@v1` | `@v2`（Node 20）或 `@v3`（Node 24） | 2024-2025 | v1 已 EOL；v3 要求新 runner |
| `release-please` 自动 bump 版本 | 用户**手动** tag（D-05 锁定） | — | 维护者保留版本控制权 |
| OpenAPI/Swagger spec | 手写 Markdown（D-01 锁定） | — | 用户优先简洁；OpenAPI 留作 v2 |
| `gitleaks-action@v1` | `@v2` | 2024 | v2 改进了 SARIF 输出、license 检查行为 |

**Deprecated/outdated:**
- `actions/checkout@v3` 及更低 — 进入 EOL，仅维护安全更新 [CITED: github.com/actions/checkout]
- `softprops/action-gh-release@v1` — 不再维护 [CITED: github.com/softprops/action-gh-release]
- `docker/build-push-action@v4` 及更低 — 不支持新版 buildx [CITED: docs.docker.com]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `softprops/action-gh-release@v2` 是当前最稳定的 GitHub Releases action 选择 | §Standard Stack | LOW — 也可选 v3，但需要 Node 24 runner，可能在某些 self-hosted 上失败 |
| A2 | GHCR (ghcr.io) 通过 `GITHUB_TOKEN` 自动认证无需额外 PAT | §Pattern 3 | LOW — 这是 GitHub 官方推荐路径，若失败则切换到 PAT (`secrets.GHCR_TOKEN`) |
| A3 | 仓库 owner 名称在 ghcr.io 镜像路径中是小写化的 `${{ github.repository_owner }}` | §Pattern 3 | MEDIUM — 已加入 `REPO_LC` 转小写步骤防御 |
| A4 | 本项目个人账户仓库，无需 `GITLEAKS_LICENSE` secret | §Pattern 1 CI workflow | LOW — 若迁移到 organization，需要补 license secret，CI 会明确报错指引 |
| A5 | git-cliff 默认 cliff.toml 模板对中文 commit message 友好 | §Pattern 5 | LOW — 已自定义模板，模板字段都是 ASCII，commit body 中的中文按 UTF-8 输出 |
| A6 | 项目当前 `package-lock.json` 是 stub (16 行，lockfileVersion 3)，`npm ci` 能正常工作 | §Pattern 1 | LOW — 已验证文件存在，命令行为符合预期 |
| A7 | Phase 1 SECU-01 已经把所有运行时硬编码密码移除，git 历史不需要重写 | §Pitfall 9 | **MEDIUM — 待 Wave 1 安全扫描确认**；如发现历史中有真密钥，需要触发紧急讨论 |
| A8 | 用户期望"v0.1.0"作为 docker semver tag（带 v 前缀） | §Pattern 3 | LOW-MEDIUM — D-08 写"semver（如 `v0.1.0`）"暗示带 v；planner 在 metadata-action tags 配置中应明确（推荐用 `pattern={{raw}}` 或 `type=ref,event=tag`） |

---

## Open Questions

1. **Docker 镜像 semver tag 究竟带不带 `v` 前缀？**
   - What we know: D-08 写"semver（如 `v0.1.0`）"暗示带 v；但 `metadata-action` 默认 `pattern={{version}}` 产生 `0.1.0`。
   - What's unclear: 用户期望 `ghcr.io/.../bridge:v0.1.0` 还是 `ghcr.io/.../bridge:0.1.0`？
   - Recommendation: planner 在 plan 中给出**默认配置 = 带 v 前缀**（`pattern=v{{version}}` 或 `type=ref,event=tag`），并在 PR 描述中明确询问。

2. **是否需要 multi-platform Docker build（linux/arm64）？**
   - What we know: 当前 Dockerfile 用 `node:22-alpine`，能跑 amd64 + arm64；用户没有锁定。
   - What's unclear: 是否在 v0.1.0 就支持 arm64？
   - Recommendation: v0.1.0 只构建 linux/amd64（更快、更简单）；arm64 留到 v0.2 增强（在 ROADMAP 增加一项）。

3. **GHCR 镜像 visibility 默认 private，需要手工切换 public？**
   - What we know: GitHub 包默认 visibility 继承仓库 visibility，但 ghcr.io 的语义是 package-level。
   - What's unclear: 首次推送后是否自动 public？
   - Recommendation: 在 Phase 7 完成后的 "post-release checklist" 中手动验证；如需 public，去 GitHub UI 切换。

4. **是否在 README/README.en.md 中添加 docker pull 示例？**
   - What we know: 用户期望"快速开始"。
   - What's unclear: 占位符 `{owner}` 用什么——`yourusername`、`example`、还是用户实际 GitHub 用户名？
   - Recommendation: 实际 owner 由用户决定后再 fill；默认占位符用 `OWNER`，并加注 "Replace OWNER with your GitHub username/org."

5. **新增的 X-API-Key 认证是否需要"宽限期"机制？**
   - What we know: 我们设计了"未配置时跳过"的兼容方案。
   - What's unclear: 是否仍需要在某个版本中默认拒绝（强制要求设置 key）？
   - Recommendation: v0.1.0 保持向后兼容（未配置=跳过），在 ROADMAP 中标注 v0.x.y 引入"默认要求"行为。

6. **gitleaks 发现的历史泄露如何处理？**
   - What we know: A7 是假设，未实际扫描。
   - What's unclear: 需要等 Wave 1 扫描结果确定后续动作。
   - Recommendation: Wave 1 完成扫描后，根据结果走以下分支：
     - 0 发现 → 继续 Phase 7
     - 仅 false positive → 加 gitleaks allowlist 后继续
     - 真实历史泄露 → 暂停 Phase 7，触发 `/gsd-discuss-phase` 讨论 git filter-repo / 直接 reset 历史 / 接受历史并撤销密钥等选项

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 20 | CI matrix | CI runner | 20.x | — |
| Node.js 22 | CI matrix + 运行时 | 本地 + CI runner | 22.x | — |
| GitHub Actions | 所有 CI/CD workflow | GitHub.com | 当前 | — |
| ghcr.io | Docker registry | GitHub.com | 当前 | Docker Hub (需用户决策切换 D-07) |
| Docker buildx | CI runner | ubuntu-latest 内置 | 当前 | — |
| `git-cliff` | Release workflow | 通过 GitHub Action 获取 | v4 action | 本地手动跑 `git-cliff` CLI |
| `gitleaks` | CI workflow | 通过 GitHub Action 获取 | v2 action | 本地 `gitleaks detect` |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None — 全部为云端 / Action 提供。

**Repository / Account requirements:**
- GitHub 用户名/组织名 — 用户决定，影响 `ghcr.io/{owner}/agent-energy-bridge` 路径
- GitHub Personal Access Token — **不需要**；使用内置 `GITHUB_TOKEN` 即可
- 仓库 Settings → Actions → General → Workflow permissions = **"Read and write permissions"** — 用户首次启用 release workflow 前需检查

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (`node --test`), Node 20+ |
| Config file | None (zero-config) |
| Quick run command | `node --test test/api-key-auth.test.js` |
| Full suite command | `node --test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OPEN-01 | CONTRIBUTING.md 存在且包含 D-13 列举的全部章节 | manual + smoke | `node -e "require('fs').readFileSync('CONTRIBUTING.md','utf8').match(/##.*$/gm)"` | ❌ Wave 0 |
| OPEN-02 | docs/API.md 覆盖全部 16 endpoints 并含标准字段 | manual + smoke | grep router.js routes vs API.md sections | ❌ Wave 0 |
| OPEN-03 | CI workflow 在 PR 跑 `node --test`，Node 20 + 22 都通过 | integration | 实际推一个 PR 触发 / `act` 本地模拟 | ❌ Wave 0 |
| OPEN-04 | 推 tag `v0.1.0` 后 GitHub Release 自动创建 + changelog 非空 | integration | 实际打 tag 触发 / `act` 模拟 release.yml | ❌ Wave 0 |
| OPEN-05 | tag 推送后 `ghcr.io/.../bridge:v0.1.0`、`:latest`、`:sha-XXX` 三个 tag 出现 | integration | `docker pull ghcr.io/.../bridge:v0.1.0` 验证 | ❌ Wave 0 |
| OPEN-06 | README.md (zh) + README.en.md 各自独立 + 互相 link | manual | grep README.md for `README.en.md` link | ❌ Wave 0 |
| **D-14** | POST /notify/test 无 X-API-Key 返回 401；正确 key 返回 200；错误 key 返回 401 | unit | `node --test test/api-key-auth.test.js` | ❌ Wave 0 |
| **D-14 (向后兼容)** | 未配置 AEB_ADMIN_API_KEY 时不强制（兼容旧部署） | unit | 同上测试文件中的 case | ❌ Wave 0 |
| **D-15** | Wave 1 安全扫描跑通 gitleaks，无 finding | one-shot | `gitleaks detect --source . --no-banner` | N/A（CI 步骤） |

### Sampling Rate

- **Per task commit:** `node --test test/api-key-auth.test.js`（中间件单元测试）
- **Per wave merge:** `node --test`（完整 213+ N 测试）
- **Phase gate:** 全套绿，外加在私有分支推一个 dry-run tag (`v0.1.0-rc1`) 触发 release.yml / docker-publish.yml 验证 workflow

### Wave 0 Gaps

- [ ] `test/api-key-auth.test.js` — 覆盖 D-14（新增）
- [ ] CHANGELOG.md — 由 git-cliff 首次生成（Wave 4）
- [ ] `cliff.toml` — git-cliff 配置（Wave 4）
- [ ] `.gitleaks.toml` — gitleaks allowlist（Wave 1）
- [ ] `.github/workflows/ci.yml` — CI 工作流（Wave 3）
- [ ] `.github/workflows/release.yml` — Release 工作流（Wave 4）
- [ ] `.github/workflows/docker-publish.yml` — Docker 工作流（Wave 4）
- [ ] `CONTRIBUTING.md` — 贡献者指南（Wave 2）
- [ ] `SECURITY.md` — 安全报告（Wave 2）
- [ ] `docs/API.md` — API 文档（Wave 2）
- [ ] `README.en.md` — 英文 README（Wave 2）
- [ ] `src/server/middleware/api-key-auth.js` — X-API-Key 中间件（Wave 1）

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (D-14) | X-API-Key header + `crypto.timingSafeEqual` |
| V3 Session Management | no | 项目无 session 概念，纯 stateless API |
| V4 Access Control | yes (D-14) | 路由级 `requiresAuth` 标记 |
| V5 Input Validation | partial | 现有 `json-body.js` 已限 1MB；新中间件不接受 body 输入 |
| V6 Cryptography | yes | `crypto.timingSafeEqual()` for key comparison |
| V7 Error Logging | yes | 错误日志不应泄露提供的 key 值（仅记录 `AUTH_INVALID`） |
| V14 Configuration | yes | API key 必须来自环境变量，不能 hardcode |

### Known Threat Patterns for Node.js HTTP middleware + OSS release

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Timing attack on string comparison | Information Disclosure | `crypto.timingSafeEqual()` ✓ |
| Supply chain attack via unpinned GitHub Action | Tampering | Pin action versions to `@v4`、`@v5` 主版本号 ✓ |
| Hardcoded secrets leaking via PR review | Information Disclosure | gitleaks-action + pre-commit hook ✓ |
| GHCR image takeover by misconfigured permissions | Elevation of Privilege | Workflow `permissions: packages: write` 只在 release/docker workflow 声明 ✓ |
| Workflow command injection via tag name | Tampering | 避免 `${{ github.ref_name }}` 进 shell；使用 metadata-action 处理 ✓ |
| Replay of stolen X-API-Key | Spoofing | 文档要求用户定期 rotate key；考虑 v2 引入 JWT/short-lived token |
| Brute force on X-API-Key | Spoofing | 现有 `rate-limiter.js` 已限制每个 IP 每分钟 100 次，足够 |
| Leak via verbose error stack | Information Disclosure | `error-handler.js` 已只在 NODE_ENV=development 输出 stack ✓ |

---

## Project Constraints (from CLAUDE.md)

> Phase 7 plans MUST honor these — extracted from `H:/projects/smart-relay-station/CLAUDE.md`:

1. **能量检查规则：** 任何涉及 LLM API 调用的操作前必须先调用 `smart-call` 检查余额。**Phase 7 不涉及任何 LLM 调用**，本约束自动满足。
2. **上报要求：** 每次 LLM 调用完成后必须 POST 到 `/agent/v1/session/report`。**Phase 7 不调用 LLM**，本约束自动满足。
3. **禁止行为：** 余额为 0 时不可调用付费模型。同 #1。

**项目 zero-dependency 约束（来自 .planning/codebase/STACK.md）：**
- ❌ 不得在 `package.json` 添加 `dependencies` 字段
- ❌ 不得在新增 `api-key-auth.js` 中 `require` 非 Node.js 内置模块（`crypto` 内置 OK）
- ✅ `package.json` 中保留 v0.1.0 → v0.2.0 升级，但不要新增依赖

**Brownfield 约束（来自 .planning/PROJECT.md）：**
- 修改 `src/server/router.js`、`src/server/index.js` 时**不得破坏现有 213 个测试**
- 修改 `src/server/handlers/notify.js` 时保持现有 export 签名

---

## Sources

### Primary (HIGH confidence)

- [actions/setup-node](https://github.com/actions/setup-node) — v4 官方文档，覆盖 matrix、caching、Node 版本管理
- [GitHub Docs: Building and testing Node.js](https://docs.github.com/en/actions/automating-builds-and-tests/building-and-testing-nodejs) — 官方 Node.js CI workflow 指南
- [docker/metadata-action](https://github.com/docker/metadata-action) — v5 官方 README，tags pattern 文档
- [docker/build-push-action](https://github.com/docker/build-push-action) — v6 官方文档
- [Docker Docs: Manage tags and labels](https://docs.docker.com/build/ci/github-actions/manage-tags-labels/) — 官方 ghcr.io 多 tag 模式
- [orhun/git-cliff-action](https://github.com/orhun/git-cliff-action) — v4 官方 README，含 fetch-depth: 0 警告
- [orhun/git-cliff](https://github.com/orhun/git-cliff) — git-cliff 本体 (10.9k stars)
- [softprops/action-gh-release](https://github.com/softprops/action-gh-release) — v2/v3 文档，含 Node 24 runner notice
- [gitleaks/gitleaks-action](https://github.com/gitleaks/gitleaks-action) — v2 官方文档
- [Conventional Commits 1.0.0 spec](https://www.conventionalcommits.org/en/v1.0.0/) — 官方规范
- [Node.js CONTRIBUTING.md](https://github.com/nodejs/node/blob/main/CONTRIBUTING.md) — 行业标杆
- [Node.js SECURITY.md](https://github.com/nodejs/node/blob/main/SECURITY.md) — 行业标杆
- [GitHub Docs: Adding a security policy](https://docs.github.com/en/code-security/getting-started/adding-a-security-policy-to-your-repository) — 官方 SECURITY.md 指南
- 本仓库源代码（已直接读取）：
  - `src/server/middleware/rate-limiter.js` — 现有中间件模式参考
  - `src/server/middleware/json-body.js` — 同上
  - `src/server/router.js` — 路由表注入点
  - `src/server/handlers/notify.js` — D-14 修改目标
  - `src/server/index.js` — buildContext 注入点
  - `package.json`、`package-lock.json`（stub）— CI 配置依据
  - `.gitignore` — 私有目录排除状态
  - `Dockerfile`、`docker-compose.yml` — Docker 工作流参考

### Secondary (MEDIUM confidence)

- [Medium: Publishing Semantic Versioned Docker Images to GitHub Packages](https://medium.com/@jaredhatfield/publishing-semantic-versioned-docker-images-to-github-packages-using-github-actions-ebe88fa74522) — 实战 ghcr.io 案例
- [Codefresh: GitHub Actions Matrix Best Practices](https://codefresh.io/learn/github-actions/github-actions-matrix/) — matrix 策略详解
- [contributing.md: How to Build a CONTRIBUTING.md](https://contributing.md/how-to-build-contributing-md/) — CONTRIBUTING 模板汇总
- [OpenSSF OSS Vulnerability Guide](https://github.com/ossf/oss-vulnerability-guide) — SECURITY.md 行业模板
- [TruffleHog Pre-commit Hooks Docs](https://docs.trufflesecurity.com/pre-commit-hooks) — 备选扫描方案
- [Electron SECURITY.md](https://github.com/electron/electron/blob/main/SECURITY.md) — Node.js 生态 SECURITY.md 参考

### Tertiary (LOW confidence)

- [Rafter: Secret Scanning in CI/CD comparison](https://rafter.so/blog/secrets/secret-scanning-tools-comparison) — 多工具对比，非官方
- [appsecsanta: Gitleaks vs TruffleHog 2026](https://appsecsanta.com/sast-tools/gitleaks-vs-trufflehog) — 对比博文
- [DEV.to: Automating Tag Creation, Release, and Docker Image Publishing](https://dev.to/natilou/automating-tag-creation-release-and-docker-image-publishing-with-github-actions-49jg) — 完整端到端示例

---

## Metadata

**Confidence breakdown:**
- Standard stack (GitHub Actions): **HIGH** — 全部主流 action 版本与官方文档交叉验证
- Architecture（X-API-Key middleware）: **HIGH** — 直接复用现有 rate-limiter 模式，已读源码
- Pitfalls: **HIGH** — 关键陷阱（fetch-depth、ghcr permissions、metadata-action 0.x major tag）由官方 issue 与多源博文验证
- Security scan strategy: **MEDIUM** — gitleaks 工具是 HIGH，但 git 历史中是否有真实泄露需要 Wave 1 实际跑出来才知道（A7 假设）
- 文档章节结构: **HIGH** — CONTRIBUTING/SECURITY 模板由 OpenSSF + Node.js + Electron 等权威源对照
- API 文档格式: **MEDIUM-HIGH** — D-01~03 已锁定，结构是 Claude 推荐的常见 Markdown 端点格式

**Research date:** 2026-05-11
**Valid until:** 2026-06-11 (30 days for stable GitHub Actions ecosystem; revisit if `softprops/action-gh-release@v3` runner compatibility changes)
