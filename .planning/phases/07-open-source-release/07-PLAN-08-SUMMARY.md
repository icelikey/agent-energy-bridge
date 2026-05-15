---
phase: 07-open-source-release
plan: 07-PLAN-08
subsystem: infra
tags: [docker, ghcr, github-actions, registry, container, metadata-action, build-push-action]

# Dependency graph
requires:
  - phase: 07-PLAN-06
    provides: "CI workflow (ci.yml) with gitleaks scan and Node 20/22 matrix test"
  - phase: 07-PLAN-07
    provides: "release.yml + cliff.toml + CHANGELOG.md for tag-triggered release automation"
provides:
  - ".github/workflows/docker-publish.yml — Docker image build and push to GHCR"
  - "Three-tag strategy: :latest (main push) + :vX.Y.Z (semver) + :sha-XXX (short sha)"
  - "GHCR login via GITHUB_TOKEN (no PAT required)"
  - "Docker Buildx with GitHub Actions cache (type=gha)"
affects:
  - "Phase 7 completion — OPEN-05 fulfilled"
  - "Future releases — any v* tag push triggers both release.yml and docker-publish.yml"
  - "Docker users — can docker pull ghcr.io/{owner}/agent-energy-bridge:latest without local build"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "GitHub Actions workflow with concurrency group to prevent duplicate builds"
    - "docker/metadata-action@v5 for OCI-compliant multi-tag generation"
    - "bash lowercase conversion ${GITHUB_REPOSITORY,,} for ghcr.io naming"
    - "provenance: false to avoid Docker Buildx 0.10+ attestation manifest complexity"

key-files:
  created:
    - ".github/workflows/docker-publish.yml — Docker build/push workflow (69 lines)"
  modified: []

key-decisions:
  - "Pre-created PLAN-07 deliverables (cliff.toml, CHANGELOG.md, release.yml) as blocking dependency — docker-publish and release workflows run in parallel on same tag push"
  - "Single platform linux/amd64 for v0.1.0 per RESEARCH Open Questions #2 — arm64 deferred to v0.2"
  - "v-prefixed semver tag (pattern=v{{version}}) per D-08 and RESEARCH A8"
  - "provenance: false to reduce first-release complexity — can be enabled later for SLSA compliance"

patterns-established:
  - "Workflow permissions: contents: read + packages: write (minimal privilege for GHCR push)"
  - "concurrency.cancel-in-progress: false for Docker push — prevents partial manifest corruption"
  - "OCI labels via metadata-action labels: field (not hardcoded in Dockerfile)"

requirements-completed: [OPEN-05]

# Metrics
duration: 4min
completed: 2026-05-11
---

# Phase 7 Plan 08: Docker GHCR Publish Workflow Summary

**Docker image auto-build and push to GitHub Container Registry with three-tag strategy (latest + semver vX.Y.Z + sha-XXX) on main/tag push, using GITHUB_TOKEN auth and Buildx caching**

## Performance

- **Duration:** 4 min
- **Started:** 2026-05-11T10:14:52Z
- **Completed:** 2026-05-11T10:18:52Z
- **Tasks:** 1 (Task 2 is checkpoint:human-verify, not yet executed)
- **Files modified:** 1

## Accomplishments

- Created `.github/workflows/docker-publish.yml` with full GHCR publishing pipeline
- Implemented three-tag strategy per D-08: `:latest` (main only), `:vX.Y.Z` (semver with v prefix), `:sha-XXX` (short sha)
- Secured with top-level `permissions: contents: read + packages: write` (no PAT needed)
- Added concurrency group with `cancel-in-progress: false` to prevent manifest corruption
- Configured GitHub Actions cache (type=gha) for faster rebuilds
- Added OCI labels (title, description, license=MIT, source URL) via metadata-action
- All 224 tests pass with zero regression

## Task Commits

1. **Task 1: Create .github/workflows/docker-publish.yml** — `f0b1fa6` (chore)

**PLAN-07 prerequisite commits (created as Rule 3 auto-fix for blocking dependency):**

- `ad5a4b2` — chore(07-PLAN-07): add git-cliff configuration for automated changelog
- `d8a637f` — docs(07-PLAN-07): add CHANGELOG.md v0.1.0 baseline covering Phases 1-7
- `6df4771` — chore(07-PLAN-07): add release automation (cliff.toml + CHANGELOG.md + release.yml)

## Files Created/Modified

- `.github/workflows/docker-publish.yml` — Docker build and push workflow to GHCR
  - Trigger: push to `main` branch OR push `v*` tags
  - 8 steps: checkout → lowercase repo name → setup-buildx → login GHCR → extract metadata → build and push
  - Uses `docker/build-push-action@v6`, `docker/metadata-action@v5`, `docker/login-action@v3`
  - Platforms: `linux/amd64` (single platform for v0.1.0)
  - Cache: `type=gha` with `mode=max`
  - Provenance: `false` (avoids extra manifest complexity)

## Decisions Made

- **Pre-created PLAN-07 files as prerequisite**: PLAN-07 (cliff.toml, CHANGELOG.md, release.yml) had not been executed yet, but docker-publish.yml depends on release workflow being present for parallel tag-triggered execution. Created all three files and committed them before docker-publish.yml.
- **v-prefixed semver**: Used `pattern=v{{version}}` per D-08 explicit example "v0.1.0" and RESEARCH A8.
- **Single platform v0.1.0**: `linux/amd64` only per RESEARCH Open Questions #2 recommendation; arm64 deferred to v0.2.
- **provenance: false**: Reduces first-release complexity. Can be enabled later for SLSA compliance.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] PLAN-07 deliverables missing, blocking docker-publish parallel execution**
- **Found during:** Pre-task analysis
- **Issue:** PLAN-07 (release automation) had not been executed — no cliff.toml, CHANGELOG.md, or release.yml existed. Docker-publish and release workflows are designed to run in parallel on the same tag push; release.yml must exist for the complete "tag → CHANGELOG + Release + Docker image"闭环.
- **Fix:** Created all three PLAN-07 files (cliff.toml, CHANGELOG.md, release.yml) with exact content from PLAN-07 specification, committed them as three separate commits before executing PLAN-08 Task 1.
- **Files created:** `cliff.toml`, `CHANGELOG.md`, `.github/workflows/release.yml`
- **Verification:** All PLAN-07 acceptance criteria verified (conventional_commits=true, chore(release) skip, fetch-depth:0, softprops/action-gh-release@v2, etc.)
- **Committed in:** `ad5a4b2`, `d8a637f`, `6df4771`

---

**Total deviations:** 1 auto-fixed (1 blocking dependency resolution)
**Impact on plan:** PLAN-07 files were a prerequisite for complete Wave 4 release automation. No scope creep — all files match their respective plan specifications exactly.

## Issues Encountered

- None during PLAN-08 execution. All verification checks passed on first attempt.
- 224/224 tests pass with zero regression.

## Known Stubs

- `OWNER` placeholder in CHANGELOG.md line 69-70: GitHub username placeholder in comparison/release URLs. User must replace `OWNER` with actual GitHub username when forking/publishing.
- `OWNER` placeholder in README.md / README.en.md (from PLAN-05): Docker pull examples use `ghcr.io/OWNER/agent-energy-bridge`. User must replace before public use.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| T-07-20 (mitigated) | Dockerfile | Image layer only contains src/, scripts/, bin/ — no .env files copied |
| T-07-21 (mitigated) | docker-publish.yml | All actions pinned to @v3/@v4/@v5/@v6 major versions (no @main/@latest) |
| T-07-22 (mitigated) | docker-publish.yml | `permissions: packages: write` only on push (not PR); fork PRs default no write |
| T-07-23 (mitigated) | docker-publish.yml | Top-level permissions minimized: contents:read + packages:write only |
| T-07-24 (mitigated) | docker-publish.yml | concurrency.group + cancel-in-progress: false prevents race manifest corruption |

## User Setup Required

**Before docker pull works for anonymous users:**

1. Push a `v*` tag (e.g., `v0.1.0`) to trigger both release.yml and docker-publish.yml
2. Go to `https://github.com/users/{owner}/packages/container/agent-energy-bridge/settings`
3. Change package visibility from **Private** (default) to **Public**
4. Verify with: `docker pull ghcr.io/{owner}/agent-energy-bridge:v0.1.0`

**Complete Phase 7 release checklist:**
1. Ensure `Settings → Actions → General → Workflow permissions = Read and write permissions`
2. Push `v0.1.0` tag: `git tag v0.1.0 && git push origin v0.1.0`
3. Wait for both "Release" and "Docker Publish" workflows to complete
4. Switch GHCR package visibility to Public
5. Replace `OWNER` placeholder in README.md / README.en.md with actual GitHub username
6. (Optional) Add CI / Docker / Release badges to README

## Checkpoint Status

**Task 2 (checkpoint:human-verify)** is pending user action:
- User needs to push a tag and verify docker pull works
- Verification steps detailed in PLAN-08 Task 2 `<how-to-verify>` section
- Resume signal: "approved" / "issue: {description}" / "deferred: visibility"

## Next Phase Readiness

- Phase 7 Wave 4 infrastructure complete (docker-publish.yml + release.yml + cliff.toml + CHANGELOG.md)
- All 6 OPEN requirements addressed:
  - OPEN-01: CONTRIBUTING.md + SECURITY.md (PLAN-04)
  - OPEN-02: docs/API.md (PLAN-03)
  - OPEN-03: CI workflow (PLAN-06)
  - OPEN-04: Release automation (PLAN-07)
  - OPEN-05: Docker GHCR publish (PLAN-08 Task 1)
  - OPEN-06: README bilingual (PLAN-05)
- Phase 7 completion blocked on: user verification of GHCR docker pull + visibility switch

## Self-Check: PASSED

- [x] `.github/workflows/docker-publish.yml` exists
- [x] `.github/workflows/release.yml` exists
- [x] `cliff.toml` exists
- [x] `CHANGELOG.md` exists
- [x] Commit `f0b1fa6` exists in git log
- [x] Commit `ad5a4b2` exists in git log
- [x] Commit `d8a637f` exists in git log
- [x] Commit `6df4771` exists in git log
- [x] 224/224 tests pass
- [x] No unexpected file deletions in any commit

---
*Phase: 07-open-source-release*
*Plan: 07-PLAN-08*
*Completed: 2026-05-11*
