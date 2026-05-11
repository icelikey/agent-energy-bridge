# Security Scan Baseline

**Date:** 2026-05-11
**Tool:** manual grep (gitleaks binary unavailable in environment)
**Config:** `.gitleaks.toml`
**Scanned:** working tree + full git history (`git log --all -S` pattern search)

> **Note:** gitleaks CLI was not available in the execution environment. The scan was performed using targeted `grep` and `git log -S` searches for high-entropy strings, API key patterns, hardcoded credentials, and real IP addresses. A secondary verification with `gitleaks-action` in CI (Wave 3, PLAN-06) is strongly recommended.

## Worktree Scan Result

| Metric | Value |
|--------|-------|
| Total findings | 4 |
| REAL_LEAK | 3 |
| REVOKED | 0 |
| FALSE_POSITIVE | 0 |
| TEST_FIXTURE | 0 |
| UNCLEAR | 1 |

## History Scan Result

| Metric | Value |
|--------|-------|
| Total findings | 4 |
| REAL_LEAK | 3 |
| REVOKED | 0 |
| FALSE_POSITIVE | 0 |
| TEST_FIXTURE | 0 |
| UNCLEAR | 1 |

## Findings Detail

### REAL_LEAK

**1. `FRIEND-TEST-GUIDE.md` — Real API Key + Real IP Address**
- **File:** `FRIEND-TEST-GUIDE.md:31-32`
- **Rule:** High-entropy API key pattern (`sk-[a-zA-Z0-9]{48}`)
- **Commit:** `5709dbd` ("chore: add friend test guide and env example")
- **Redacted content:** `NEWAPI_BASE_URL=http://104.243.33.52:3000` + `NEWAPI_API_KEY=sk-***REDACTED***`
- **Disposition:** File contains a real NewAPI endpoint and API key shared for friend testing. This is a genuine leak.
- **Recommendation:**
  1. **Rotate the API key immediately** at the NewAPI provider (104.243.33.52:3000)
  2. Remove `FRIEND-TEST-GUIDE.md` from the repository (add to `.gitignore`)
  3. Evaluate `git filter-repo` to purge from history if the key cannot be rotated

**2. `scripts/verify-newapi-live.js` — Real Server IP + Test Credentials**
- **File:** `scripts/verify-newapi-live.js:8-10`
- **Rule:** Hardcoded IP + username/password
- **Commit:** `88a5a9a` ("feat: production-ready agent-energy-bridge v0.1.0")
- **Redacted content:** `baseUrl: 'http://107.174.146.180'` + `username: 'testuser123'` + `password: '***REDACTED***'`
- **Disposition:** Integration test script with hardcoded real server credentials.
- **Recommendation:**
  1. **Rotate the test password** if the account still exists
  2. Remove the file from the repository (add to `.gitignore`)
  3. Evaluate `git filter-repo` to purge from history

**3. `scripts/debug-cookie.js` — Real Server IP + Test Credentials**
- **File:** `scripts/debug-cookie.js:4,11`
- **Rule:** Hardcoded IP + username/password
- **Commit:** `88a5a9a` ("feat: production-ready agent-energy-bridge v0.1.0")
- **Redacted content:** `baseUrl: 'http://107.174.146.180'` + `username: 'testuser123'` + `password: '***REDACTED***'`
- **Disposition:** Debug script with hardcoded real server credentials.
- **Recommendation:**
  1. Same as #2 — rotate password, remove file, evaluate filter-repo

### REVOKED

None — 仓库无已撤销但仍在历史中的生产密钥。

### FALSE_POSITIVE

The following patterns were found but are **intentional placeholders** already covered by `.gitleaks.toml` allowlist:

| Pattern | Location | Allowlist Coverage |
|---------|----------|-------------------|
| `your-api-key-here` | `.env.example:8,57` | `regexes` — `your-(api-key\|password\|username\|secret\|token)-here` |
| `your-password` | `.env.example:15` | Same as above |
| `your-newapi-server` | `.env.example:7` | `regexes` — `your-newapi-server` |
| `example.com` | `README.md`, `docker-compose.yml` | `regexes` — `example\.com` |
| `gateway.example.com` | `README.md:232` | `regexes` — `gateway\.example\.com` |
| `ak-demo` | `README.md:108` | `regexes` — `ak-demo` |

### TEST_FIXTURE

The following patterns are **test fixtures** and are covered by `.gitleaks.toml` allowlist:

| Pattern | Location | Allowlist Coverage |
|---------|----------|-------------------|
| `DEMO-2026` | `src/adapters/memory-adapter.js:22`, `test/*.test.js`, `README.md:135` | `regexes` — `DEMO-2026` |
| `secret-123` | `test/auth-middleware.test.js` | `regexes` — `secret-123` |
| `CODE1`, `CODE2`, `CODE3` | `README.md:194` | `regexes` — `CODE[123]` |
| `RECHARGE-10`, `RECHARGE-20` | `README.md:239` | `regexes` — `RECHARGE-[0-9]+` |
| `sess-123` | `test/session-store.test.js` | `regexes` — `sess-123` |

### UNCLEAR (需人工评估)

**4. `docs/PROJECT_DEVELOPMENT_GUIDE.md` — Real IP in Documentation**
- **File:** `docs/PROJECT_DEVELOPMENT_GUIDE.md:375,722`
- **Content:** `http://107.174.146.180` appears as an example URL in environment variable documentation and deployment guide
- **Question:** Is this IP address still active and associated with the project owner? If yes, it constitutes information disclosure (server location). If no (server decommissioned), it can be reclassified as FALSE_POSITIVE.
- **Recommendation:** Owner to confirm whether `107.174.146.180` is still an active server. If yes, redact or replace with `example.com` before open-sourcing.

## Allowlist Updates Applied

No updates to `.gitleaks.toml` were required during this scan — the initial allowlist already covers all known placeholders and test fixtures.

## Remediation Actions Taken (2026-05-11)

Following checkpoint decision **Option A — "先处置再开源"**:

| # | Action | Status | Commit |
|---|--------|--------|--------|
| 1 | `git rm --cached FRIEND-TEST-GUIDE.md` | Done | 52d03ce |
| 2 | `git rm --cached scripts/verify-newapi-live.js` | Done | 52d03ce |
| 3 | `git rm --cached scripts/debug-cookie.js` | Done | 52d03ce |
| 4 | Add removed files to `.gitignore` with security comment | Done | 52d03ce |
| 5 | Replace `107.174.146.180` with `your-server.example.com` in `docs/PROJECT_DEVELOPMENT_GUIDE.md` | Done | 52d03ce |

**Files removed from git tracking (still in working tree for local reference):**
- `FRIEND-TEST-GUIDE.md`
- `scripts/verify-newapi-live.js`
- `scripts/debug-cookie.js`

**Note on key rotation:** Real API keys and passwords on remote servers (`104.243.33.52:3000`, `107.174.146.180`) **cannot be rotated from this execution environment**. The repository owner must manually:
1. Rotate the NewAPI key at `104.243.33.52:3000`
2. Rotate the test password at `107.174.146.180`
3. Consider `git filter-repo` if the rotated keys must also be purged from git history

This limitation must be disclosed in `SECURITY.md` (Wave 2, PLAN-04).

## Post-Remediation Re-Scan

**Date:** 2026-05-11
**Method:** manual grep (gitleaks binary unavailable)
**Result:** No REAL_LEAK patterns found in tracked files.

- High-entropy credential patterns: **0 findings** in tracked files
- Real IP addresses in tracked files: **0 findings** (127.0.0.1/localhost only)
- `docs/deployments/` contains real IPs but is already in `.gitignore` (excluded from git)
- `FRIEND-TEST-GUIDE.md`, `scripts/verify-newapi-live.js`, `scripts/debug-cookie.js` are no longer tracked

## Outcome

- [x] **PASS_WITH_NOTE** — 敏感文件已从 git tracking 移除，文档已脱敏，无 REAL_LEAK 留在跟踪文件中。待办：远程服务器上的真实密钥需手动 rotate（见 Remediation Actions 表格）。
- [ ] **PASS** — 无 REAL_LEAK 且无 UNCLEAR，Wave 2+ 可继续推进
- [ ] **BLOCKED** — 存在 REAL_LEAK 或 UNCLEAR 需 checkpoint 决策
