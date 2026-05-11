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

## Outcome

- [ ] **PASS** — 无 REAL_LEAK 且无 UNCLEAR，Wave 2+ 可继续推进
- [ ] **PASS_WITH_NOTE** — 有 REVOKED finding，但无 REAL_LEAK，已记录到 SECURITY.md（Wave 2）
- [x] **BLOCKED** — 存在 REAL_LEAK 和 UNCLEAR 需 checkpoint 决策

**Blocking reasons:**
1. **3 REAL_LEAK findings** require immediate key rotation and file removal
2. **1 UNCLEAR finding** (IP in docs) requires owner confirmation
3. **History purge decision** needed: whether to use `git filter-repo` or accept that rotated keys in history are acceptable risk

**Recommended immediate actions before Wave 2:**
1. Rotate API key at `104.243.33.52:3000`
2. Rotate test password at `107.174.146.180`
3. Add `FRIEND-TEST-GUIDE.md`, `scripts/verify-newapi-live.js`, `scripts/debug-cookie.js` to `.gitignore` and `git rm --cached`
4. Owner confirms status of `107.174.146.180` and decides on `docs/PROJECT_DEVELOPMENT_GUIDE.md` redaction
5. Decide on `git filter-repo` vs. "rotate + accept history" approach
