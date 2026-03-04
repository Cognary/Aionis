# Replay Automation Plan (v0.1 -> v1.0)

Updated: 2026-03-05

## 1. Goal

Build a replay system that is **not** a brittle script recorder.

Target behavior:

1. Replay-first path executes known-good steps.
2. Every step has pre/post validation.
3. Validation failures trigger fallback reasoning (guided repair).
4. New repaired path is versioned and promoted through governance.

Execution loop:

`Memory -> Policy -> Action -> Replay`

## 2. Design Principles

1. **Replay-first, Reason-if-needed**: deterministic path first, LLM repair second.
2. **Append-only provenance**: all replay mutations flow through commit chain.
3. **Minimal schema intrusion**: v0.x reuses `memory_nodes` + `memory_edges`.
4. **Governed adaptation**: repaired steps start in draft/shadow before active.
5. **Safe by default**: allowlists, safety level, and budgets gate execution.

## 3. Object Model (Canonical)

1. **Run**: one task lifecycle (`run_id`, goal, status, snapshot refs).
2. **Decision**: policy decision point (`decision_id`, tool choice, policy hash).
3. **Step**: replayable action unit (`tool`, input, pre/post, retry, safety).
4. **Artifact**: output/diff/log references with hashes/URI links.
5. **Playbook**: reusable compiled template with versioning and matchers.

## 4. Storage Mapping (v0.x, No New Tables)

Use existing graph objects:

1. `memory_nodes`:
   - run: `type=event`, `slots.replay_kind="run"`
   - step: `type=procedure`, `slots.replay_kind="step"`
   - step_result: `type=evidence`, `slots.replay_kind="step_result"`
   - run_end: `type=event`, `slots.replay_kind="run_end"`
   - playbook: `type=procedure`, `slots.replay_kind="playbook"`
2. `memory_edges`:
   - `part_of`: step/result/end -> run
   - `related_to`: step_result -> step
   - `derived_from`: playbook -> run/steps
3. Commit lineage stays native through `applyMemoryWrite`.

## 5. API Surface

### 5.1 Recorder API (v0.1)

1. `POST /v1/memory/replay/run/start`
2. `POST /v1/memory/replay/step/before`
3. `POST /v1/memory/replay/step/after`
4. `POST /v1/memory/replay/run/end`

### 5.2 Readback API (v0.1)

1. `POST /v1/memory/replay/runs/get`
2. `POST /v1/memory/replay/playbooks/get`

### 5.3 Compiler API (v0.2)

1. `POST /v1/memory/replay/playbooks/compile_from_run`
2. `POST /v1/memory/replay/playbooks/promote`

### 5.4 Executor API (v0.3+)

1. `POST /v1/memory/replay/playbooks/run` (simulate + strict + guided; strict/guided use local executor gate)
2. `POST /v1/memory/replay/playbooks/repair`
3. `POST /v1/memory/replay/playbooks/repair/review` (approve/reject + auto shadow validation)

## 6. Mode Semantics

1. **strict**: fail when preconditions fail; no repair.
2. **guided** (default target): replay step; repair only failing steps.
3. **simulate**: dry-run checks only; no destructive execution.

## 7. Governance Model

1. New compiled playbooks start `draft`.
2. Promotion path: `draft -> shadow -> active`.
3. Gate checks before promotion:
   - replay success rate
   - repair ratio
   - safety policy violations
   - deterministic replay stability

## 8. Security Requirements

1. Per-step `safety_level`: `auto_ok|needs_confirm|manual_only`.
2. Tool allowlist/denylist enforced by policy layer.
3. Sandbox execution strongly preferred for risky actions.
4. Tenant and scope isolation remains mandatory.

## 9. MVP (Two-Week Deliverable)

Playbook target:

1. `install_clawbot_with_aionis_plugin`

MVP acceptance:

1. Record one full successful run through replay recorder endpoints.
2. Compile one draft playbook from that run.
3. Query run/playbook with URI-linked evidence.
4. Demonstrate one replay simulation report.

## 10. Delivery Roadmap

### v0.1 Foundation (now)

1. Recorder endpoints.
2. Readback endpoint (`runs/get`).
3. Graph storage mapping with commit-chain provenance.

Status:

1. [x] Recorder API implemented.
2. [x] Run readback implemented.
3. [x] Playbook compile-from-run implemented.
4. [x] Playbook get implemented.
5. [x] Playbook promote implemented.
6. [x] Playbook run simulate implemented.

### v0.2 Compiler Hardening

1. Better parameterization (slots/variables extraction).
2. Step quality scoring and dedup.
3. Promote endpoint + state machine.

Status:

1. [x] Promote endpoint + versioned status lifecycle (draft/shadow/active/disabled).
2. [x] Simulate runner with precondition readiness report.
3. [x] Parameterization and quality scoring improvements.

### v0.3 Guided Replay

1. Runtime precondition checker.
2. Guided fallback repair path.
3. Repair patch event model and shadow validation.

Status:

1. [x] Runtime precondition checker in `simulate` and execution modes.
2. [x] Strict mode fail-fast execution path with replay writeback.
3. [x] Guided mode fallback patch with strategy profiles (`deterministic_skip|heuristic_patch|http_synth`) and replay writeback.
4. [x] Repair endpoint to persist patch into a new playbook version.
5. [x] Repair review endpoint with approve/reject and automatic shadow-readiness validation.
6. [x] Repair review supports `shadow_validation_mode=execute` (strict local execution validation).
7. [x] Repair review supports `shadow_validation_mode=execute_sandbox` (strict sandbox sync execution validation).
8. [x] Repair review supports gate-based auto-promotion (`auto_promote_on_pass` + threshold policy).
9. [x] Built-in LLM-assisted repair generation (OpenAI-compatible) with deterministic/heuristic fallback.
10. [ ] Deeper sandbox-policy shadow validation workflow.

### v0.4 Sandbox-Native Replay

1. Bind replay execution to sandbox runs.
2. Replay artifact v2 coverage in ops diagnostics.
3. Project budget policy enforcement on replay runs.

### v1.0 Production Replay

1. Stable replay SLOs and gate integration.
2. Diff-based execution review for sensitive steps.
3. Full policy-governed adaptive replay lifecycle.

## 11. Known Gaps (Current)

1. Embedded backend currently supports replay write path, but replay read/compile APIs require postgres in this phase.
2. `playbooks/run` strict/guided currently execute local command tools only (`command|shell|exec|bash`) under allowlist.
3. Built-in LLM repair synthesis is OpenAI-compatible (`builtin_llm`); provider-specific adaptive templates are not implemented yet.
4. Sandbox shadow validation policy currently supports timeout/stop defaults; remote/scheduled validation policy is not yet configurable.
5. Global policy defaults, named profile presets, and tenant/route scoped policy maps are supported for review auto-promotion.

## 12. Next Implementation Steps

1. Extend strict/guided executor beyond local command tools to sandbox-native actions.
2. Add LLM-assisted repair synthesis (`repair_reason`, `patch`, `shadow_result`).
3. Extend sandbox shadow validation policy beyond timeout/stop defaults (profile classes + async queue mode).
4. [x] Add replay metrics in tenant diagnostics and governance weekly report.
5. [x] Add global auto-promote policy defaults (request-level fields still override).
6. [x] Add named global auto-promote policy profiles (`strict|staged|aggressive` + `custom`).
7. [x] Add tenant/route scoped replay auto-promote policy maps.
8. [x] Add tenant+scope scoped replay auto-promote policy maps.
9. [x] Add policy observability output (resolved source trace) in review response.
