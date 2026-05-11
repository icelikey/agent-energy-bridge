---
phase: "07-open-source-release"
plan: "07-PLAN-04"
subsystem: docs
tags: [contributing, security, open-source, governance]
dependency_graph:
  requires: ["07-PLAN-02"]
  provides: ["07-PLAN-05", "07-PLAN-06"]
  affects: ["OPEN-01"]
tech-stack:
  added: []
  patterns: [markdown-docs, github-security-policy, conventional-commits]
key-files:
  created:
    - CONTRIBUTING.md
    - SECURITY.md
  modified: []
decisions: []
metrics:
  duration: "~15 minutes"
  completed_date: "2026-05-11"
---

# Phase 7 Plan 04: CONTRIBUTING.md + SECURITY.md 开源治理双文档

**One-liner:** 创建 D-13 锁定的完整贡献者指南（8 章节中英双语）和 GitHub 自动识别的安全策略文件（含漏洞上报流程、支持版本、威胁模型、加密算法）。

---

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | 创建 CONTRIBUTING.md（D-13 完整集，8 章节） | ae18c1d | CONTRIBUTING.md |
| 2 | 创建 SECURITY.md（GitHub Security Policy 模板） | bc27c05 | SECURITY.md |

---

## Key Deliverables

### CONTRIBUTING.md (209 行)

- **中文版 8 章节**：开发环境搭建 / PR 流程 / Commit 规范 / 代码规范 / 测试要求 / 分支策略 / 安全报告流程 / 路线图
- **英文版精简摘要**：对应 8 节的 condensed 版本
- **零依赖约束**：明确声明不得添加 npm 外部依赖
- **Conventional Commits 引用**：含 7 前缀表格 + git-cliff 对接说明
- **占位符安全**：`OWNER` 仓库路径、`security@your-org.com` 邮箱
- **关键引用**：`.planning/ROADMAP.md`、`.planning/codebase/CONVENTIONS.md`、`SECURITY.md`

### SECURITY.md (154 行)

- **GitHub 自动识别字段**：`## Supported Versions` 和 `## Reporting a Vulnerability`（H2 层级）
- **中英双语独立完整**：英文段 + 中文段各自包含全部子章节
- **支持版本表**：0.1.x 受支持，< 0.1 不受支持
- **漏洞上报流程**：72 小时确认、7 天分类、30/90 天修复
- **协调披露策略**：默认 90 天，灵活调整
- **安全加固基线**：SECU-01~05 引用 `.planning/REQUIREMENTS.md`
- **威胁模型表**：5 个组件 × 威胁 × 缓解措施
- **加密算法说明**：randomBytes(32)、timingSafeEqual、SHA-256
- **Wave 1 产出引用**：`docs/security-scan-baseline.md`、`.gitleaks.toml`
- **超出范围声明**：下游 LLM 网关漏洞、OS 层 DoS、物理访问

---

## Deviations from Plan

**None** — 计划执行完全符合 07-PLAN-04 规范，无偏差。

---

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_accept: info-disclosure | SECURITY.md | 使用占位符邮箱 `security@your-org.com`，由 fork 者替换（T-07-07 disposition = accept） |

---

## Known Stubs

**None** — 两份文档均为完整内容，无占位符或 TODO/FIXME 残留。

---

## Verification Results

| Check | Result |
|-------|--------|
| CONTRIBUTING.md ≥ 120 行 | PASS (209 行) |
| CONTRIBUTING.md 8 个 `### N.` 章节 | PASS (16 个，中英各 8 个) |
| CONTRIBUTING.md 含 Conventional Commits | PASS |
| CONTRIBUTING.md 含 node --test | PASS (9 处) |
| CONTRIBUTING.md 含零依赖约束 | PASS |
| CONTRIBUTING.md 含 security@your-org.com | PASS |
| CONTRIBUTING.md 含 git-cliff | PASS |
| CONTRIBUTING.md 含 ROADMAP.md 引用 | PASS |
| CONTRIBUTING.md 含 OWNER 占位符 | PASS |
| CONTRIBUTING.md 无 TODO/FIXME | PASS |
| SECURITY.md ≥ 40 行 | PASS (154 行) |
| SECURITY.md H2 Supported Versions | PASS |
| SECURITY.md H2 Reporting a Vulnerability | PASS |
| SECURITY.md H2 支持版本 | PASS |
| SECURITY.md H2 报告漏洞 | PASS |
| SECURITY.md 无 H3 Supported Versions | PASS |
| SECURITY.md 无 H3 Reporting a Vulnerability | PASS |
| SECURITY.md 含 security-scan-baseline | PASS |
| SECURITY.md 含 .gitleaks.toml | PASS |
| SECURITY.md 含 timingSafeEqual | PASS |
| SECURITY.md 含 SECU-01 | PASS |
| SECURITY.md 中英双语 | PASS |
| SECURITY.md 无真实邮箱 | PASS |
| SECURITY.md 无 TODO/FIXME | PASS |
| 测试回归 | PASS (224/224) |

---

## Self-Check: PASSED

- [x] CONTRIBUTING.md exists (209 lines)
- [x] SECURITY.md exists (154 lines)
- [x] Commit ae18c1d exists in git log
- [x] Commit bc27c05 exists in git log
- [x] 224/224 tests pass

---

*Summary created: 2026-05-11*
*Phase: 07-open-source-release | Plan: 07-PLAN-04*
