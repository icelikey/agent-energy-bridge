# Security Policy

> [English](#english) | [中文](#中文)

---

## English

## Supported Versions

| Version | Supported          |
|---------|-------------------|
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

This project is in early open-source release stage. Only the latest minor version receives security patches. We commit to backporting critical security fixes to the most recent two minor versions once we reach v1.0.

## Reporting a Vulnerability

**Please do not open public GitHub Issues for security vulnerabilities.**

Email `security@your-org.com` (replace with the project maintainer's email when forking) with the subject prefix `[SECURITY]`. Include:

1. **Vulnerability type** (e.g. Authentication Bypass, Information Disclosure, Remote Code Execution, Supply Chain)
2. **Affected versions** (commit hash, tag, or `main` HEAD)
3. **Proof of concept** — minimal reproduction steps, code, or HTTP request samples
4. **Expected disposition** — Coordinated Disclosure, private patch, or CVE request
5. **Discovery method** — how you found the issue (helps us improve our scanning baseline)

You will receive an acknowledgement within **72 hours** of report. We aim to:
- **Triage and confirm:** within 7 days
- **Patch and release:** within 30 days for critical issues, 90 days for medium/low

After patching, we publish a security advisory via GitHub Security Advisories with a CVE if applicable.

### Disclosure Policy

We follow **Coordinated Disclosure**: the reporter and maintainers agree on a disclosure timeline. Default is 90 days from confirmed triage, but we are flexible if active exploitation is observed (faster) or complex fixes are required (slower with reporter consent).

### Security Hardening Baseline

This project has completed the following security hardening (Phase 1, see `.planning/REQUIREMENTS.md`):

- **SECU-01:** No hardcoded credentials in production source (`src/**`)
- **SECU-02:** API keys generated via `crypto.randomBytes` (no `Math.random`)
- **SECU-03:** All secrets sourced from environment variables
- **SECU-04:** Input validation on all HTTP endpoints
- **SECU-05:** Rate limiting on all HTTP endpoints (token bucket, 100 req/min default)

Prior to the v0.1.0 open-source release, we ran a full repository scan (`gitleaks` + manual review) documented in `docs/security-scan-baseline.md`. Known false positives (placeholders in `.env.example`, README example URLs) are allowlisted in `.gitleaks.toml`.

### Threat Model Summary

Trust boundaries (see `.planning/phases/07-open-source-release/07-RESEARCH.md` §Security Domain):

| Component | Threat | Mitigation |
|-----------|--------|------------|
| `POST /agent/v1/notify/test` | Unauthorized invocation triggering external notification | X-API-Key middleware (set `AEB_API_KEY` env var; no-op if unset for backward compatibility) |
| All HTTP endpoints | Brute force / DoS | Token-bucket rate limiter (`src/server/middleware/rate-limiter.js`) |
| API key comparison | Timing attack | `crypto.timingSafeEqual()` used in `src/server/middleware/auth-middleware.js` |
| Error responses | Stack trace leak | `src/server/middleware/error-handler.js` redacts stack outside `NODE_ENV=development` |
| GitHub Actions workflows | Supply chain (action takeover) | All actions pinned to major version (`@v4`, `@v5`, `@v6`); never `@main` or `@latest` |

### Cryptographic Algorithms

- **API Key generation:** `crypto.randomBytes(32).toString('hex')` (256-bit entropy)
- **API Key comparison:** `crypto.timingSafeEqual()` (constant-time)
- **Hashing for cache keys:** SHA-256 via `crypto.createHash('sha256')`
- **No custom cryptography.** All operations use Node.js built-in `crypto` module.

### Out of Scope

The following are explicitly out of scope for this security policy:

- DoS via direct OS-level resource exhaustion (use process limits / cgroups)
- Vulnerabilities in downstream LLM gateways (`new-api`, `one-api`, etc.) — report directly to those projects
- Issues that require physical access to the deployment host

---

## 中文

## 支持版本

| 版本 | 支持状态 |
|------|---------|
| 0.1.x | :white_check_mark: |
| < 0.1 | :x: |

项目处于早期开源阶段，仅最新次要版本接收安全补丁。v1.0 之后我们承诺向后兼容最近两个次要版本的关键安全修复。

## 报告漏洞

**请不要直接为安全漏洞开公开的 GitHub Issue。**

发邮件到 `security@your-org.com`（fork 时由维护者替换为真实邮箱），主题以 `[SECURITY]` 开头。邮件内容包括：

1. **漏洞类型**（认证绕过 / 信息泄漏 / RCE / 供应链等）
2. **受影响版本**（commit hash、tag 或 `main` HEAD）
3. **Proof of concept**（最小复现步骤、代码片段、HTTP 请求示例）
4. **期望处置方式**（协调披露 / 私下修复 / 申请 CVE）
5. **发现方式**（帮助我们改进扫描基线）

你将在 **72 小时内**收到确认回复。我们的目标：

- **分类确认：** 7 天内
- **修复发布：** 关键级 30 天，中低风险 90 天

修复后会通过 GitHub Security Advisories 发布安全公告，必要时申请 CVE。

### 披露策略

我们遵循**协调披露**：报告者与维护者协商时间线。默认从确认分类开始 90 天，活跃利用场景下加速，复杂修复在报告者同意下延期。

### 安全加固基线

项目已完成以下安全加固（Phase 1，详见 `.planning/REQUIREMENTS.md`）：

- **SECU-01:** 生产代码中无硬编码凭据
- **SECU-02:** API Key 使用 `crypto.randomBytes` 生成
- **SECU-03:** 所有敏感配置来自环境变量
- **SECU-04:** 所有 HTTP 端点输入验证
- **SECU-05:** 所有 HTTP 端点速率限制（默认 100 req/min）

v0.1.0 开源发布前，我们运行了 `gitleaks` 全量扫描（结果见 `docs/security-scan-baseline.md`），已知占位符通过 `.gitleaks.toml` allowlist 处理。

### 威胁模型摘要

信任边界（详见 `.planning/phases/07-open-source-release/07-RESEARCH.md` §Security Domain）：

| 组件 | 威胁 | 缓解措施 |
|------|------|---------|
| `POST /agent/v1/notify/test` | 未授权调用触发外部通知 | X-API-Key 中间件（设置 `AEB_API_KEY` 环境变量；未设置时跳过以保持向后兼容） |
| 所有 HTTP 端点 | 暴力破解 / DoS | 令牌桶速率限制器（`src/server/middleware/rate-limiter.js`） |
| API Key 比较 | 时序攻击 | `crypto.timingSafeEqual()`（`src/server/middleware/auth-middleware.js`） |
| 错误响应 | 堆栈信息泄漏 | `src/server/middleware/error-handler.js` 在非开发环境脱敏堆栈 |
| GitHub Actions 工作流 | 供应链攻击 | 所有 action 固定到主版本号（`@v4`、`@v5`、`@v6`），不使用 `@main` 或 `@latest` |

### 加密算法

- **API Key 生成：** `crypto.randomBytes(32).toString('hex')`（256-bit 熵）
- **API Key 比较：** `crypto.timingSafeEqual()`（恒时比较）
- **哈希：** SHA-256，通过 Node.js 内置 `crypto`
- **不使用自定义加密算法**

### 超出范围

- OS 层 DoS（用进程限制 / cgroups 解决）
- 下游 LLM 网关（`new-api` / `one-api` 等）漏洞 — 请直接报告给上游项目
- 需要物理访问部署主机的问题

---

*Last updated: 2026-05-11. Aligned with project roadmap milestone M3.*
