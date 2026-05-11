---
phase: 07-open-source-release
plan: 07-PLAN-02
subsystem: security
tags: [gitleaks, secrets-scan, timingSafeEqual, crypto, open-source, credential-remediation]

requires:
  - phase: 07-PLAN-01
    provides: notify/test auth middleware (timing-unsafe version shipped in PLAN-01)
provides:
  - .gitleaks.toml allowlist configuration for CI secrets scanning
  - docs/security-scan-baseline.md with full scan results and remediation record
  - src/server/middleware/auth-middleware.js upgraded to crypto.timingSafeEqual
  - test/auth-middleware.test.js with 2 additional timingSafeEqual test cases
  - 3 sensitive files removed from git tracking (FRIEND-TEST-GUIDE.md, scripts/verify-newapi-live.js, scripts/debug-cookie.js)
  - docs/PROJECT_DEVELOPMENT_GUIDE.md redacted (real IPs replaced with example.com)
affects:
  - 07-PLAN-03 (LICENSE + CODE_OF_CONDUCT)
  - 07-PLAN-04 (SECURITY.md references baseline scan)
  - 07-PLAN-06 (CI workflow references .gitleaks.toml)
  - 07-PLAN-08 (Release notes can claim "security scan passed")

tech-stack:
  added: [gitleaks (config only, CLI not available in environment)]
  patterns:
    - "crypto.timingSafeEqual for constant-time string comparison"
    - "gitleaks allowlist for placeholder exemption"
    - "security scan baseline as living document"

key-files:
  created:
    - .gitleaks.toml
    - docs/security-scan-baseline.md
  modified:
    - src/server/middleware/auth-middleware.js
    - test/auth-middleware.test.js
    - .gitignore
    - docs/PROJECT_DEVELOPMENT_GUIDE.md

key-decisions:
  - "Checkpoint Option A chosen: remediate before open-sourcing (remove sensitive files + redact docs)"
  - "Remote key rotation deferred to owner (cannot rotate keys on external servers from execution environment)"
  - "git filter-repo not applied: keys will be rotated on remote servers, making historical commits safe"

patterns-established:
  - "Security findings tracked in baseline document with remediation audit trail"
  - "Sensitive files removed via git rm --cached + .gitignore, not just deleted"
  - "Real IPs in docs replaced with example.com placeholders"

requirements-completed: []

duration: 45min
completed: 2026-05-11
---

# Phase 7 Plan 02: 开源前安全扫描与敏感信息处置

**API Key 比较升级为 crypto.timingSafeEqual 恒时比较，gitleaks allowlist 配置创建，3 个含真实凭证的文件从 git tracking 移除，文档脱敏完成，扫描基线记录到 SECURITY.md 引用文档。**

## Performance

- **Duration:** ~45 min (continuation from checkpoint)
- **Started:** 2026-05-11 (continuation)
- **Completed:** 2026-05-11T15:20:00Z
- **Tasks:** 4 (0-2 executed by first agent, checkpoint, then remediation as continuation)
- **Files modified:** 6

## Accomplishments

1. **timingSafeEqual 升级**：`src/server/middleware/auth-middleware.js` 从 `providedKey !== apiKey` 升级为 `crypto.timingSafeEqual()` 恒时比较，消除时序攻击风险（T-07-05）。
2. **gitleaks 配置**：`.gitleaks.toml` 创建完成，allowlist 覆盖 `.env.example` 占位符、文档示例、测试夹具，供 Wave 3 CI 直接引用。
3. **安全扫描基线**：`docs/security-scan-baseline.md` 记录完整工作区 + 历史扫描结果，按 REAL_LEAK / REVOKED / FALSE_POSITIVE / TEST_FIXTURE / UNCLEAR 分类。
4. **敏感信息处置**：3 个含真实凭证的文件从 git tracking 移除并加入 `.gitignore`，`docs/PROJECT_DEVELOPMENT_GUIDE.md` 中真实 IP 替换为 `your-server.example.com`。

## Task Commits

1. **Task 0: 升级 api-key-auth middleware 为 crypto.timingSafeEqual** — `b4d94cb` (fix)
2. **Task 1: 创建 .gitleaks.toml 允许列表配置** — `88cfb30` (chore)
3. **Task 2: 运行 gitleaks 全量历史扫描并记录结果** — `0a721f2` (docs)
4. **Task 3 (continuation): 移除敏感文件并脱敏文档** — `52d03ce` (fix)
5. **Task 3 (continuation): 更新安全基线记录处置动作** — `0870002` (docs)

## Files Created/Modified

- `.gitleaks.toml` — gitleaks allowlist 配置，覆盖占位符与测试夹具
- `docs/security-scan-baseline.md` — 扫描结果基线，含 remediation 审计追踪
- `src/server/middleware/auth-middleware.js` — 升级为 `crypto.timingSafeEqual()` 恒时比较
- `test/auth-middleware.test.js` — 新增 2 个 timingSafeEqual 测试用例（6/6 通过）
- `.gitignore` — 添加已移除敏感文件的安全注释条目
- `docs/PROJECT_DEVELOPMENT_GUIDE.md` — 两处 `107.174.146.180` 替换为 `your-server.example.com`

## Decisions Made

- **Option A — 先处置再开源**：Checkpoint 发现 3 个 REAL_LEAK + 1 个 UNCLEAR，用户选择先处置敏感信息再推进 Wave 2+。
- **不执行 git filter-repo**：远程服务器上的密钥将由所有者手动 rotate，历史中的密钥 rotate 后不再有效，因此不需要重写 git 历史。
- **docs/deployments/ 保持 gitignore 排除**：该目录已存在于 `.gitignore` 第 10 行，继续排除（含更多真实部署信息）。

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] 添加 .gitignore 安全注释**
- **Found during:** Task 3 (敏感文件移除)
- **Issue:** 仅将文件加入 .gitignore 无上下文，未来维护者可能困惑为何这些文件被排除
- **Fix:** 在 `.gitignore` 中添加注释块 `# Security: removed from tracking — contain real credentials (see docs/security-scan-baseline.md)`
- **Files modified:** `.gitignore`
- **Verification:** 注释清晰说明排除原因并指向基线文档
- **Committed in:** `52d03ce`

**2. [Rule 2 - Missing Critical] 在基线文档中记录远程密钥无法 rotate 的限制**
- **Found during:** Task 3 (基线更新)
- **Issue:** 处置报告未明确说明执行环境无法访问远程服务器 rotate 密钥，可能导致 SECURITY.md 撰写时遗漏此披露
- **Fix:** 在 `docs/security-scan-baseline.md` Remediation Actions 表格下方添加 Note，明确要求 SECURITY.md 披露此限制
- **Files modified:** `docs/security-scan-baseline.md`
- **Verification:** 文档明确记录 "Real API keys and passwords on remote servers cannot be rotated from this execution environment"
- **Committed in:** `0870002`

---

**Total deviations:** 2 auto-fixed (both Rule 2 — missing critical documentation)
**Impact on plan:** 均为文档/注释增强，无代码逻辑变更，无 scope creep。

## Issues Encountered

- **gitleaks CLI 不可用**：执行环境无 gitleaks 二进制，使用 manual grep fallback。已在基线文档顶部标注，Wave 3 CI 中的 `gitleaks-action` 将作为二次验证。
- **文件已从 git tracking 移除但仍在工作区**：`FRIEND-TEST-GUIDE.md`、`scripts/verify-newapi-live.js`、`scripts/debug-cookie.js` 物理文件仍存在于工作区供本地参考，但不再被 git 跟踪。这是预期行为。

## Known Stubs / Deferred Items

| 文件 | 行 | 内容 | 原因 | 解决方 |
|------|-----|------|------|--------|
| `docs/security-scan-baseline.md` | Remediation Actions | 远程服务器密钥未 rotate | 执行环境无法访问外部服务器 | 所有者手动 rotate，SECURITY.md 中披露 |

## Threat Flags

| Flag | 文件 | 描述 |
|------|------|------|
| threat_flag: info_disclosure (historical) | git history | 3 个文件的旧版本仍存在于 git history 中（commit `5709dbd`, `88a5a9a`）。密钥 rotate 后风险降低，但地理位置/服务器信息仍在历史中。 |
| threat_flag: info_disclosure (docs) | `docs/deployments/` | 该目录已 gitignore 排除，但含真实部署 IP 和配置。开源前需确认不意外加入 tracking。 |

## User Setup Required

**远程服务器密钥需手动 rotate：**

1. **NewAPI key at `104.243.33.52:3000`**：登录 NewAPI 管理后台，撤销旧 key，生成新 key
2. **Test password at `107.174.146.180`**：如果 `testuser123` 账户仍存在，修改密码
3. **在 SECURITY.md (Wave 2, PLAN-04) 中披露**："Historical commits may contain rotated credentials. All production credentials have been rotated as of [date]."

## Next Phase Readiness

- **Wave 2 可启动**：07-PLAN-03 (LICENSE) → 07-PLAN-04 (SECURITY.md) → 07-PLAN-05 (CONTRIBUTING.md)
- **SECURITY.md 撰写时可引用**：`docs/security-scan-baseline.md` 作为扫描证据
- **CI 配置就绪**：`.gitleaks.toml` 可直接被 07-PLAN-06 的 `gitleaks-action` 引用
- **Blocker 2 已修复**：`crypto.timingSafeEqual` 已到位，SECURITY.md 中的声明与实际代码一致

---
*Phase: 07-open-source-release*
*Completed: 2026-05-11*
