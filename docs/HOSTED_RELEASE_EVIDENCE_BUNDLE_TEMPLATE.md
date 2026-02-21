---
title: "Hosted Release Evidence Bundle Template"
---

# Hosted Release Evidence Bundle Template

Use this template for every hosted go-live decision.

Decision rule:

1. No evidence bundle, no go-live.
2. Links to artifacts are required; screenshots are supplementary only.

## 1. Release Metadata

- Release ID:
- Date (UTC):
- Commit SHA:
- Environment:
- Scope(s):
- Tenant(s):
- Operator:

## 2. Narrative Block (Fixed Format)

1. Problem
- What production risk or customer need this release addresses.

2. Architecture principle mapping
- `Audit-first`
- `Derived async`
- `Memory -> Policy`

3. Evidence summary
- Which hard gates passed and where to verify.

4. Boundary
- What this release explicitly does not solve.

5. Next step
- Next decision point and required trigger metrics.

## 3. Required Gate Evidence

Attach links/paths for each artifact:

1. Hosted preflight
- Command:
  - `npm run -s preflight:hosted -- --run-gates`
- Artifact:
  - `artifacts/hosted_preflight/<run_id>/summary.json`
- Status:

2. Core production gate
- Command:
  - `npm run -s gate:core:prod -- --base-url "http://localhost:${PORT:-3001}" --scope <scope> --run-perf <true|false>`
- Artifact:
  - `artifacts/core_gate/<run_id>/summary.json`
- Status:

3. Governance weekly report (release hard-gate mode)
- Command:
  - `npm run -s job:governance-weekly-report -- --scope <scope> --window-hours 168 --strict-warnings --out-dir artifacts/governance/release/<run_id>`
- Artifact:
  - `artifacts/governance/release/<run_id>/summary.json`
- Status:

## 4. Build and Package Evidence

1. GitHub
- Release PR / commit:
- Required workflow runs:
  - Core Production Gate
  - Hosted Staging Gate
  - Docs Pages (if docs changed)

2. Docker
- Image repo:
- Release tag:
- Digest:
- Pull verification:
  - `docker pull <image>:<tag>`

3. SDKs (if version changed)
- npm package:
  - Version:
  - `npm view @cognary/aionis-sdk version`
- PyPI package:
  - Version:
  - `pip index versions aionis-sdk`

## 5. Data Safety and Rollback Evidence

1. Partition/cutover readiness (if release touches partition path)
- Command:
  - `npm run -s job:partition-cutover-readiness -- --scope <scope> --tenant-id <tenant>`
- Artifact path:
- Status:

2. Rollback plan verification
- Previous stable image tag:
- Rollback command tested:
- Recovery time observed:

3. Dead-letter and replay drill
- Drill run ID:
- Replay artifact:
- Status:

## 6. SLO and Risk Summary

- Recall p95:
- Write p95:
- Error rate:
- Budget posture:
- Open risks:

Release recommendation:

- `GO`
- `NO-GO`
- `GO WITH GUARDRAILS`

## 7. Sign-off

- Engineering:
- Ops/SRE:
- Product:
- Timestamp (UTC):

## Suggested Folder Layout

Store per release under:

`artifacts/release_evidence/<release_id>/`

Recommended content:

1. `EVIDENCE_BUNDLE.md` (this completed template)
2. `hosted_preflight_summary.json`
3. `core_gate_summary.json`
4. `governance_summary.json`
5. `docker_release.txt`
6. `sdk_release.txt` (if applicable)

## Verification Stamp

1. Last reviewed: `2026-02-21`
2. Owner: `ops + release engineering`
