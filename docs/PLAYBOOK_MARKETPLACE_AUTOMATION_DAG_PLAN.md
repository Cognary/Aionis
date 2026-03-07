---
title: "Playbook Marketplace and Automation DAG Plan"
---

# Playbook Marketplace and Automation DAG Plan

Status: `proposed` (`2026-03-06`)  
Owner: Aionis Core  
Track: `post-v1 replay productization`

Related execution docs:

1. `/Users/lucio/Desktop/Aionis/docs/internal/plans/AUTOMATION_PHASE1_IMPLEMENTATION_SPEC.md`
2. `/Users/lucio/Desktop/Aionis/docs/internal/plans/AUTOMATION_BETA_RELEASE_READINESS_CHECKLIST.md`
3. `/Users/lucio/Desktop/Aionis/docs/internal/plans/AUTOMATION_BETA_LIMITATIONS_AND_SUPPORT_BOUNDARY.md`
4. `/Users/lucio/Desktop/Aionis/docs/internal/plans/AUTOMATION_BETA_MIGRATION_REHEARSAL_2026-03-07.md`
5. `/Users/lucio/Desktop/Aionis/docs/internal/plans/AUTOMATION_BETA_OPERATOR_RUNBOOK.md`
6. `/Users/lucio/Desktop/Aionis/docs/internal/plans/AUTOMATION_GA_GAP_CLOSURE_PLAN.md`

Implementation status snapshot (`2026-03-07`):

1. `Automation DAG MVP`: `mostly_complete`, with the core Phase 1 runtime and compensation skeleton implemented.
2. `Marketplace package/install layer`: `not_started`.
3. `Governance integration above replay`: `partial`, including promotion states, explicit shadow execution, repair approval/rejection, compensation retry controls, a minimal ops governance console, a first compensation failure-class/operator-guidance surface, and a shadow review report surface with recorded verdicts, review history, shadow validation request tracking, and a background validation dispatch skeleton.
4. `Beta operator support boundary`: `implemented`, with release checklist, limitation boundary, migration rehearsal, and operator runbook published.

Current code-aligned status:

1. implemented
   - automation definition schema
   - DAG validation
   - sequential DAG scheduler
   - layered run and node state model
   - run-scoped control action serialization for `cancel`, `resume`, `approve_repair`, `reject_repair`, and `compensation/retry`
   - run inspector APIs
   - `run`, `get`, `promote`, `cancel`, `resume`, `validate`, `approve_repair`, `reject_repair`, and `compensation/retry` automation actions
   - approval pause and guided-repair pause handling
   - replay-linked node execution with `playbook_run_id`, including shadow simulate evidence
   - minimal ops automation governance surface for reviewer-filtered actionable run queue, promotion queue, compensation failures inbox, compensation workflow buckets, owner/escalation-owner/SLA filtering, overdue and unassigned compensation queue views, a compensation policy matrix, run inspection, reviewer assignment, compensation assessment, recorded manual-cleanup and engineering-escalation workflow actions, compensation owner assignment, SLA tracking, escalation owner tracking, a first telemetry/SLO surface, repeat-action guidance, shadow evidence review, shadow-vs-active node delta reporting, recent shadow/active history, recorded shadow review verdicts and history, shadow validation request tracking, review notes, operator action guidance, and run-scoped control actions
   - live smoke coverage for control-plane conflicts, concurrent control actions, replay failure, and compensation failure
   - injected DB failure coverage on the `resume` fail-closed path
   - injected DB failure coverage on compensation finalization fail-closed behavior
   - live smoke coverage now exists for `enqueue -> dispatch -> report completed` shadow validation flow
2. partially implemented
   - failure policy is stop-only in runtime; branching is not implemented
   - repair approval/rejection actions are implemented, and there is now a minimal reviewer-filtered queue plus write-capable run and promotion console, but there is still no reviewer assignment policy engine, inbox routing policy, or multi-stage approval policy
   - automation/version `disabled` gating, explicit status promotion, explicit `execution_mode=shadow` runs, approved-shadow-review gating for `shadow -> active` promotion, and a minimal shadow review report with recorded review verdicts, history, validation request tracking, and dispatch controls are implemented, but there is still no hosted/managed async shadow validator service or fuller multi-stage review workflow
   - playbook-based reverse-order compensation runs on reject/cancel/retry are implemented, and there is now a first compensation failure-class/operator-guidance surface, a compensation failures inbox, a policy matrix API/UI, recorded manual-cleanup / engineering-escalation workflow actions, and compensation owner/SLA/escalation-owner tracking, but there is still no non-playbook compensator or deeper policy automation
3. not implemented
   - marketplace package/install APIs and tables
   - package trust badges, reputation, and marketplace UX
   - marketplace-facing governance surfaces and a dedicated reviewer queue

## 1. Goal

Extend Aionis replay from a single reusable playbook into a product surface with three first-class objects:

1. `Playbook`: a reusable execution unit compiled from successful runs.
2. `Automation`: a dependency graph composed of playbooks and simple control nodes.
3. `Marketplace`: the discovery, install, validation, versioning, and governance layer for playbooks and automations.

Target outcome:

1. users can publish and install reusable playbooks such as `install_env`, `setup_ci`, and `deploy`
2. operators can compose them into an automation DAG
3. every node still inherits Aionis replay governance, evidence, and repair lifecycle

## 2. Why This Matters

Current Aionis already supports:

1. compile a run into a replayable playbook
2. simulate, strictly execute, or guided-repair a playbook
3. version, review, shadow-validate, and promote a playbook

Current gap:

1. playbooks are stored as reusable templates, but not yet packaged as installable assets
2. execution is step-sequential inside one playbook, not graph-native across playbooks
3. there is no first-class catalog, install flow, dependency resolution, or compatibility contract

This proposal productizes replay into a reusable ecosystem without breaking the existing replay model.

## 3. Core Positioning

Recommended product framing:

1. Aionis is the governed replay kernel.
2. A `Playbook` is the smallest reusable governed execution asset.
3. An `Automation` is a DAG orchestrator that invokes one or more playbooks.
4. A `Marketplace` is the distribution and trust layer for both.

In short:

```text
Execution Trace
-> Playbook
-> Automation DAG
-> Marketplace Distribution
```

## 4. Design Principles

1. Replay-first: keep single-playbook replay as the execution primitive.
2. Minimal kernel disruption: do not force the current playbook runner to become a graph engine in v1.
3. Governance inheritance: every installed asset must preserve replay evidence, repair review, and promotion semantics.
4. Contract-first composition: playbooks compose through declared inputs, outputs, permissions, and environment requirements.
5. Safe installation: install should validate compatibility before activation.
6. Append-only provenance: installation, upgrades, activation, and graph executions should remain auditable.
7. Bounded orchestration scope: automation must remain a thin orchestrator, not a general-purpose workflow engine.

## 5. Non-Goals for v1

1. turning `steps_template` itself into a parallel graph runtime
2. arbitrary code package execution without replay or sandbox controls
3. a public multi-tenant marketplace with billing, ranking, and payments
4. automatic LLM synthesis of full DAGs without explicit operator review
5. building an Airflow-, Temporal-, or Prefect-style workflow platform inside Aionis
6. cron, external event buses, and broad workflow-trigger semantics in the initial automation layer

## 6. Fit With Current Aionis

Current system fit:

1. `playbooks/compile_from_run`, `get`, `promote`, `repair`, `repair/review`, and `run` already exist
2. playbooks already have version and status lifecycle: `draft`, `shadow`, `active`, `disabled`
3. replay execution already supports safety levels, preconditions, postconditions, local or sandbox execution, and guided repair

Current structural limit:

1. a playbook stores `steps_template`
2. runner execution is ordered over a step list
3. there is no first-class `automation` object or DAG scheduler yet

Conclusion:

1. Aionis can and should do playbooks now
2. Aionis can support a marketplace with moderate product and API work
3. automation DAG should be added as an orchestration layer above the current playbook runner

## 7. Canonical Object Model

### 7.1 Playbook

A reusable replay unit.

Required fields:

1. `playbook_id`
2. `name`
3. `version`
4. `status`
5. `matchers`
6. `steps_template`
7. `risk_profile`
8. `input_contract`
9. `output_contract`
10. `env_requirements`
11. `permission_requirements`
12. `publisher`
13. `source_run_ids`
14. `estimated_runtime`
15. `resource_requirements`
16. `risk_level`

Suggested examples:

1. `install_env`
2. `setup_ci`
3. `deploy`

### 7.2 Automation

A DAG of nodes that orchestrates playbooks and simple control flow.

Node kinds for v1:

1. `playbook`
2. `approval`
3. `condition`
4. `artifact_gate`

Edge semantics:

1. `depends_on`
2. `on_success`
3. `on_failure`

Automation responsibilities:

1. dependency scheduling
2. parameter passing between nodes
3. artifact and output propagation
4. retries and failure policy
5. pause and approval points

### 7.3 Marketplace Package

A distributable asset descriptor wrapping a playbook or automation.

Kinds:

1. `playbook_package`
2. `automation_package`

Required fields:

1. `package_id`
2. `kind`
3. `name`
4. `summary`
5. `publisher`
6. `asset_ref`
7. `version`
8. `compatibility`
9. `install_checks`
10. `verification_badges`
11. `changelog`

### 7.4 Installed Asset

An installed package bound to one tenant or scope.

Required fields:

1. `installation_id`
2. `package_id`
3. `installed_version`
4. `tenant_id`
5. `scope`
6. `install_status`
7. `config_overrides`
8. `activated_at`

## 8. Data Model Direction

## 8.1 Storage Strategy

Recommended v1 strategy:

1. keep reusing `memory_nodes` and `memory_edges` for playbook lineage and replay evidence
2. add first-class DB tables for marketplace and automation orchestration metadata
3. reference graph objects from these tables through stable IDs and URIs

Reason:

1. marketplace queries need indexed package/version/install lookups
2. DAG scheduling state is operational state, not just memory graph content
3. replay evidence should remain in the existing append-only graph

## 8.2 Proposed Tables

1. `automation_defs`
   - `automation_id`
   - `tenant_id`
   - `scope`
   - `name`
   - `status`
   - `graph_json`
   - `input_contract`
   - `output_contract`
   - `metadata`
   - `created_at`
   - `updated_at`

2. `automation_versions`
   - `automation_id`
   - `version`
   - `status`
   - `graph_json`
   - `compile_summary`
   - `source_package_id`
   - `metadata`

3. `automation_runs`
   - `run_id`
   - `automation_id`
   - `version`
   - `tenant_id`
   - `scope`
   - `status`
   - `params`
   - `summary`
   - `started_at`
   - `ended_at`

4. `automation_run_nodes`
   - `run_id`
   - `node_id`
   - `node_kind`
   - `status`
   - `attempt`
   - `input_snapshot`
   - `output_snapshot`
   - `artifact_refs`
   - `playbook_run_id`
   - `error`

5. `marketplace_packages`
   - `package_id`
   - `kind`
   - `publisher_id`
   - `name`
   - `slug`
   - `summary`
   - `latest_version`
   - `visibility`
   - `trust_level`
   - `metadata`

6. `marketplace_package_versions`
   - `package_id`
   - `version`
   - `manifest_json`
   - `compatibility_json`
   - `verification_json`
   - `changelog`
   - `published_at`

7. `marketplace_installations`
   - `installation_id`
   - `package_id`
   - `version`
   - `tenant_id`
   - `scope`
   - `status`
   - `config_json`
   - `installed_at`

## 8.3 Recommended Run Schema Detail

The previous table list is intentionally compact. For implementation, the run tables should adopt the layered status model directly.

Recommended `automation_runs` shape:

1. identity
   - `run_id`
   - `automation_id`
   - `automation_version`
   - `tenant_id`
   - `scope`
2. execution state
   - `lifecycle_state`
   - `pause_reason`
   - `terminal_outcome`
   - `status_summary`
3. causality
   - `root_cause_code`
   - `root_cause_node_id`
   - `root_cause_message`
4. request and result
   - `params_json`
   - `context_json`
   - `summary_json`
   - `output_snapshot_json`
5. compensation
   - `compensation_attempted`
   - `compensation_status`
   - `compensation_summary_json`
6. audit
   - `requested_by`
   - `started_at`
   - `paused_at`
   - `ended_at`
   - `updated_at`

Recommended enums:

1. `lifecycle_state`
   - `queued`
   - `running`
   - `paused`
   - `compensating`
   - `terminal`
2. `pause_reason`
   - `approval_required`
   - `repair_required`
   - `dependency_wait`
   - `operator_pause`
   - `null`
3. `terminal_outcome`
   - `succeeded`
   - `failed`
   - `cancelled`
   - `failed_compensated`
   - `cancelled_compensated`
   - `null`
4. `compensation_status`
   - `not_needed`
   - `pending`
   - `running`
   - `succeeded`
   - `failed`

Recommended `automation_run_nodes` shape:

1. identity
   - `run_id`
   - `node_id`
   - `node_kind`
   - `attempt`
2. execution state
   - `lifecycle_state`
   - `pause_reason`
   - `terminal_outcome`
   - `status_summary`
3. causality
   - `depends_on_json`
   - `blocking_node_ids_json`
   - `error_code`
   - `error_message`
4. replay linkage
   - `playbook_id`
   - `playbook_version`
   - `playbook_run_id`
   - `approval_id`
5. inputs and outputs
   - `input_snapshot_json`
   - `output_snapshot_json`
   - `artifact_refs_json`
6. compensation
   - `compensation_mode`
   - `compensation_ref_json`
   - `compensation_run_id`
   - `compensation_status`
7. audit
   - `started_at`
   - `paused_at`
   - `ended_at`
   - `updated_at`

Recommended unique and index rules:

1. unique `(run_id, node_id, attempt)`
2. index `(automation_id, started_at desc)` on `automation_runs`
3. index `(run_id, lifecycle_state)` on `automation_run_nodes`
4. index `(run_id, node_id)` on `automation_run_nodes`
5. index `(playbook_run_id)` on `automation_run_nodes`

Recommended invariants:

1. `pause_reason` must be null unless `lifecycle_state=paused`
2. `terminal_outcome` must be non-null only when `lifecycle_state=terminal`
3. `compensation_status=succeeded|failed` requires `compensation_attempted=true`
4. terminal runs must have `ended_at`
5. node terminal outcome `compensated` is allowed only after a prior succeeded side effect

## 9. Manifest Shape

Recommended package manifest:

```json
{
  "kind": "playbook_package",
  "name": "deploy",
  "version": "1.2.0",
  "publisher": {
    "id": "aionis-core",
    "display_name": "Aionis Core"
  },
  "asset_ref": {
    "playbook_id": "pb_deploy_service",
    "version": 4
  },
  "summary": "Deploy a built artifact to the target environment.",
  "compatibility": {
    "min_aionis_version": "0.3.0",
    "required_execution_backends": ["sandbox_sync"],
    "required_capabilities": ["replay", "sandbox", "policy_review"]
  },
  "contracts": {
    "input": {
      "required": ["artifact_uri", "target_env"]
    },
    "output": {
      "produces": ["deployment_id", "deployment_url"]
    }
  },
  "requirements": {
    "env": ["docker", "kubectl"],
    "permissions": ["cluster.deploy"]
  },
  "runtime": {
    "estimated_runtime_seconds": 300,
    "resource_requirements": {
      "network": true,
      "cpu_class": "standard",
      "memory_mb": 512
    }
  },
  "risk": {
    "risk_level": "high"
  },
  "verification": {
    "status": "shadow_validated",
    "badges": ["reviewed", "sandbox-verified"]
  }
}
```

## 10. Execution Architecture

## 10.1 Recommended v1 Execution Model

Do not make `playbooks/run` graph-native in v1.

Instead:

1. `automation/run` loads the DAG definition
2. scheduler selects ready nodes
3. a `playbook` node executes by calling `replay/playbooks/run`
4. control nodes evaluate approvals, conditions, or artifact checks
5. outputs are written to automation run state and passed to downstream nodes

This preserves the kernel boundary:

```text
Automation Runner
-> Node Scheduler
-> Replay Playbook Run
-> Replay Evidence + Governance
```

Hard boundary for v1 automation scope:

1. supported node kinds are limited to `playbook`, `approval`, `condition`, and `artifact_gate`
2. no embedded cron scheduler inside automation runtime
3. no external event trigger framework in the initial automation API
4. parallel execution remains optional and deferred until the thin orchestrator model proves stable

## 10.2 Why This Is Better Than Rewriting Playbook Runner

1. lower migration risk
2. preserves current replay semantics and evidence model
3. allows DAG orchestration to evolve independently
4. keeps single-playbook replay usable outside marketplace and automation

## 10.3 Node I/O Propagation

Each node should expose structured outputs.

Example:

```text
install_env.outputs.env_id
setup_ci.inputs.env_id <- install_env.outputs.env_id
deploy.inputs.build_artifact <- setup_ci.outputs.build_artifact
```

Required runtime features:

1. JSON path binding
2. artifact URI passing
3. validation against input and output contracts
4. redaction-aware logging for sensitive values

## 10.4 Run State Model

State explosion should be avoided by splitting state into layers instead of encoding every combination into one enum.

Recommended automation run model:

1. `lifecycle_state`
   - `queued`
   - `running`
   - `paused`
   - `compensating`
   - `terminal`
2. `pause_reason`
   - `approval_required`
   - `repair_required`
   - `dependency_wait`
   - `operator_pause`
3. `terminal_outcome`
   - `succeeded`
   - `failed`
   - `cancelled`
   - `failed_compensated`
   - `cancelled_compensated`
4. `status_summary`
   - compact derived string for UI only, not as the source of truth

Recommended node run model:

1. `lifecycle_state`
   - `pending`
   - `ready`
   - `running`
   - `paused`
   - `retrying`
   - `compensating`
   - `terminal`
2. `pause_reason`
   - `approval_required`
   - `repair_required`
3. `terminal_outcome`
   - `succeeded`
   - `failed`
   - `rejected`
   - `skipped`
   - `compensated`

This keeps the model tractable:

1. automation-level state answers "can the DAG continue"
2. node-level state answers "what happened at this node"
3. UI can still render a friendly single label without forcing storage into a giant enum

Example:

```text
install_env: terminal / succeeded
setup_ci: paused / repair_required
automation_run: paused / repair_required
```

This run is not yet `failed`. It is paused on a repair decision.

If repair is later rejected:

```text
setup_ci: terminal / rejected
automation_run: compensating
```

After cleanup finishes:

```text
automation_run: terminal / failed_compensated
```

If cleanup is disabled or unavailable:

```text
automation_run: terminal / failed
```

## 10.5 Failure, Repair, and Compensation Policy

Every automation node should declare a failure policy.

Recommended v1 node policy fields:

1. `retry_policy`
   - `max_attempts`
   - `backoff_class`
   - `retryable_error_classes`
2. `repair_policy`
   - `guided_repair_allowed`
   - `approval_required_on_repair`
   - `max_repair_rounds`
3. `compensation_policy`
   - `mode`: `none | best_effort | required`
   - `trigger`: `on_failure | on_cancel | on_reject`
   - `compensation_ref`
   - `timeout_ms`

Compensation should be explicit, not implicit.

Recommended compensation forms:

1. `compensation_playbook`
   - preferred for real operational cleanup
2. `compensation_command`
   - limited to tightly controlled internal cases
3. `lease_expiry`
   - for temporary resources that can auto-expire safely

For the canonical example:

```text
install_env
-> setup_ci
-> deploy
```

`install_env` should be allowed to declare:

1. produced resources such as `env_id`
2. cleanup contract such as `destroy_env`
3. retention policy such as `ttl_minutes`

Then if `setup_ci` is rejected or the run is cancelled:

1. the automation engine checks upstream nodes for reversible side effects
2. it invokes compensation in reverse dependency order
3. it records compensation evidence and final compensated outcome

## 10.6 Minimum Status and Cancellation Rules for Phase 1

Even before advanced compensation lands, Phase 1 should define these rules:

1. repair pending does not equal failed
2. human rejection is terminal for that node
3. cancellation is distinct from failure
4. a cancelled or failed run may still enter `compensating`
5. compensation failure must not hide the original failure

Recommended minimum terminal recording:

1. `root_cause`
2. `final_outcome`
3. `compensation_attempted`
4. `compensation_status`
5. `compensation_failures`

This prevents dead runs with ambiguous meaning.

## 10.7 State Transition Rules

Recommended automation run transitions:

```text
queued -> running
running -> paused
running -> compensating
running -> terminal
paused -> running
paused -> compensating
paused -> terminal
compensating -> terminal
```

Recommended node run transitions:

```text
pending -> ready
ready -> running
running -> paused
running -> retrying
running -> compensating
running -> terminal
retrying -> running
retrying -> paused
retrying -> terminal
paused -> running
paused -> compensating
paused -> terminal
compensating -> terminal
```

Guard rules:

1. no transition may leave `terminal`
2. downstream nodes cannot move to `ready` until all required upstream edges are satisfied
3. `paused -> running` requires an explicit approval, resume, or accepted repair outcome
4. `running -> compensating` requires either failure, rejection, or cancellation on a node with reversible side effects upstream
5. original failure cause must be preserved even if compensation later fails

Canonical scenarios:

1. guided repair pause
   - `setup_ci: running -> paused`
   - `automation_run: running -> paused`
2. repair approved
   - `setup_ci: paused -> running`
   - `automation_run: paused -> running`
3. repair rejected with cleanup
   - `setup_ci: paused -> terminal(rejected)`
   - `automation_run: paused -> compensating -> terminal(failed_compensated)`
4. operator cancellation during repair
   - `automation_run: paused -> compensating | terminal(cancelled)`
   - path chosen by whether compensable side effects exist

## 10.8 Compensation Ordering

Compensation should run in reverse topological order over successful side-effecting nodes.

Rules:

1. only nodes marked as reversible participate
2. only nodes with terminal outcome `succeeded` are eligible for compensation
3. best-effort compensation does not block terminalization forever
4. required compensation failure yields terminal outcome `failed`, with `compensation_status=failed`
5. compensation actions must emit their own evidence and run IDs

Example:

```text
install_env: succeeded
setup_ci: rejected
deploy: not_started

compensation order:
install_env.destroy_env
```

## 11. API Direction

## 11.1 Marketplace APIs

1. `POST /v1/marketplace/packages/list`
2. `POST /v1/marketplace/packages/get`
3. `POST /v1/marketplace/packages/publish`
4. `POST /v1/marketplace/packages/install`
5. `POST /v1/marketplace/packages/uninstall`
6. `POST /v1/marketplace/installations/list`
7. `POST /v1/marketplace/packages/upgrade`

## 11.2 Automation APIs

1. `POST /v1/automations/create` `implemented`
2. `POST /v1/automations/get` `implemented`
3. `POST /v1/automations/validate` `implemented`
4. `POST /v1/automations/promote` `implemented`
5. `POST /v1/automations/run` `implemented`
6. `POST /v1/automations/runs/get` `implemented`
7. `POST /v1/automations/runs/cancel` `implemented`

## 11.3 Validation APIs

1. `POST /v1/marketplace/packages/compatibility/check` `not_implemented`
2. `POST /v1/automations/graph/validate` `implemented`
3. `POST /v1/automations/graph/compile` `not_implemented`

## 11.4 Example Automation Definition

```json
{
  "automation_id": "auto_env_ci_deploy",
  "name": "Env -> CI -> Deploy",
  "nodes": [
    {
      "node_id": "install_env",
      "kind": "playbook",
      "playbook_id": "pb_install_env",
      "version": 3,
      "inputs": {
        "repo_url": "$params.repo_url"
      }
    },
    {
      "node_id": "setup_ci",
      "kind": "playbook",
      "playbook_id": "pb_setup_ci",
      "version": 2,
      "inputs": {
        "env_id": "$nodes.install_env.outputs.env_id"
      }
    },
    {
      "node_id": "deploy",
      "kind": "playbook",
      "playbook_id": "pb_deploy",
      "version": 4,
      "inputs": {
        "artifact_uri": "$nodes.setup_ci.outputs.build_artifact"
      }
    }
  ],
  "edges": [
    { "from": "install_env", "to": "setup_ci", "type": "on_success" },
    { "from": "setup_ci", "to": "deploy", "type": "on_success" }
  ]
}
```

## 11.5 API Status Contract

Automation read and run APIs should return layered state fields directly.

Recommended top-level run response shape:

```json
{
  "run": {
    "run_id": "auto_run_123",
    "automation_id": "auto_env_ci_deploy",
    "version": 1,
    "lifecycle_state": "paused",
    "pause_reason": "repair_required",
    "terminal_outcome": null,
    "status_summary": "paused_for_repair",
    "root_cause_code": "guided_repair_pending",
    "root_cause_node_id": "setup_ci",
    "compensation_attempted": false,
    "compensation_status": "not_needed"
  },
  "nodes": [
    {
      "node_id": "install_env",
      "lifecycle_state": "terminal",
      "terminal_outcome": "succeeded",
      "status_summary": "succeeded",
      "playbook_run_id": "replay_run_a"
    },
    {
      "node_id": "setup_ci",
      "lifecycle_state": "paused",
      "pause_reason": "repair_required",
      "terminal_outcome": null,
      "status_summary": "paused_for_repair",
      "playbook_run_id": "replay_run_b"
    },
    {
      "node_id": "deploy",
      "lifecycle_state": "pending",
      "terminal_outcome": null,
      "status_summary": "blocked_by_dependency"
    }
  ]
}
```

Rules for API consumers:

1. use `lifecycle_state`, `pause_reason`, and `terminal_outcome` for logic
2. treat `status_summary` as display-only
3. do not infer `failed` from `paused`
4. always inspect both run-level and node-level state

## 11.6 Required API Actions

To avoid stranded paused runs, API surface should include explicit control actions:

1. `POST /v1/automations/runs/resume` `implemented`
2. `POST /v1/automations/runs/cancel` `implemented`
3. `POST /v1/automations/runs/reject_repair` `implemented`
4. `POST /v1/automations/runs/approve_repair` `implemented`
5. `POST /v1/automations/runs/compensation/retry` `implemented`

Each action should return:

1. previous run state
2. new run state
3. changed node states
4. causal event metadata

## 12. Marketplace UX Direction

Marketplace v1 screens:

1. package catalog
2. package detail
3. install wizard
4. installed assets
5. automation builder
6. automation run inspector

UX recommendation:

1. automation DAG needs a visual editor or graph inspector before broad rollout
2. YAML or JSON alone is acceptable for internal v1, but not sufficient for wider product adoption
3. visual editing should remain a productization layer on top of the same automation contract, not a second source of truth

Package detail should show:

1. summary and publisher
2. required permissions and environment dependencies
3. input and output contracts
4. replay validation badge and promotion status
5. risk level, estimated runtime, and resource requirements
6. changelog and versions
7. example DAG compositions

Package detail should also surface reputation signals once enough usage exists:

1. replay success rate
2. average latency
3. install count
4. latest validation date
5. recent failure trend

Install wizard should enforce:

1. compatibility check
2. permission approval
3. required secret or env bindings
4. optional shadow test before activation

## 13. Governance Model

Marketplace and automation should reuse existing replay governance wherever possible.

### 13.1 Package Trust States

1. `draft`
2. `reviewed`
3. `shadow_validated`
4. `active`
5. `deprecated`
6. `disabled`

### 13.2 Automation Promotion States

1. `draft`
2. `shadow`
3. `active`
4. `disabled`

### 13.3 Required Checks Before Activation

1. package compatibility passes
2. required capabilities are available
3. permission scope is approved
4. referenced playbooks are active or explicitly pinned
5. DAG is acyclic
6. input and output bindings validate
7. optional shadow run succeeds

### 13.4 Trust and Distribution Guardrails

Marketplace should not be positioned as the first milestone.

Recommended sequence:

1. replay adoption
2. curated playbook library
3. package install flow
4. broader marketplace discovery and ecosystem features

Rationale:

1. an empty marketplace weakens product credibility
2. trust and usage signals need a seed library before ranking or discovery becomes meaningful
3. curated internal or partner packages should precede open publishing

### 13.5 Repair Review and Rejection Semantics

If a node enters guided repair:

1. node state becomes `paused` with `pause_reason=repair_required`
2. automation run state becomes `paused` with `pause_reason=repair_required`
3. downstream nodes remain blocked and must not auto-start

If repair is approved and succeeds:

1. node returns to `running`
2. automation run returns to `running`

If repair is rejected:

1. node becomes `terminal` with `terminal_outcome=rejected`
2. automation run moves to `compensating` if any upstream compensation is eligible
3. otherwise automation run becomes `terminal` with `terminal_outcome=failed`

This rule should be part of v1 contract, not deferred to a later phase.

### 13.6 Package Reputation Signals

Package reputation should be evidence-based, not social-only.

Recommended reputation signals:

1. replay success rate
2. average runtime and latency distribution
3. install count
4. active installation count
5. shadow-validation pass rate
6. recent incident or rollback count

Usage:

1. ranking and recommendations
2. warning banners on risky packages
3. operator trust decisions during install

## 14. Security and Isolation

1. package install must declare permissions up front
2. package install must not auto-expand command allowlists silently
3. automation nodes inherit tenant and scope isolation
4. cross-tenant asset references are forbidden in v1
5. sensitive outputs must support redaction and non-propagation flags
6. manual approval nodes should be mandatory for high-risk transitions such as production deploy

## 15. Rollout Plan

## Phase 0: Package Metadata Layer

Status: `not_started`

Goal:

1. make playbooks discoverable and installable without changing replay kernel

Deliver:

1. package manifest schema
2. package/version/install tables
3. package list/get/install APIs
4. package detail UI

Acceptance:

1. an existing playbook can be wrapped and installed as a package
2. install performs compatibility validation

## Phase 1: Automation DAG MVP

Status: `mostly_complete`

Goal:

1. add a basic orchestrator that can invoke playbook nodes sequentially by DAG dependency

Deliver:

1. automation definition schema
2. graph validator
3. automation run scheduler
4. automation run inspector
5. layered run state model (`lifecycle_state`, `pause_reason`, `terminal_outcome`)
6. node-level failure and cancellation semantics

Acceptance:

1. `install_env -> setup_ci -> deploy` works as one automation `implemented`
2. each playbook node produces a linked replay run ID `implemented`
3. failed nodes stop or branch according to policy `partial`
4. guided repair puts the automation into a defined paused state `implemented`
5. cancellation and failure are distinguishable in storage and API `implemented`

## Phase 2: Governance Integration

Status: `partial`

Goal:

1. inherit Aionis review and promotion discipline at the automation layer

Deliver:

1. automation promotion states `implemented`
2. shadow execution mode `implemented`
3. approval nodes `implemented`
4. package trust badges
5. compensation contract support for reversible nodes `partial`

Acceptance:

1. operators can shadow-validate an automation before activation `implemented`
2. runtime evidence is queryable by automation run and node run `implemented`
3. rejected repairs can trigger reverse-order compensation when configured `implemented`

## Phase 3: Composition and Reuse

Goal:

1. make marketplace assets composable and easier to discover

Deliver:

1. compatibility graph
2. recommended downstream and upstream assets
3. package dependency resolution
4. DAG templates

Acceptance:

1. users can discover compatible playbooks from a package detail page
2. users can scaffold an automation from installed assets

## Phase 4: Advanced Runtime

Goal:

1. improve throughput and resilience after the model is stable

Deliver:

1. parallel execution for independent nodes
2. retry classes and compensation hooks
3. artifact cache and resume
4. richer policy nodes

Acceptance:

1. independent nodes can run concurrently
2. partial rerun is supported from failed nodes

## 15.1 Pre-Marketplace Readiness Gate

Before a broad marketplace launch, target:

1. a curated starter library of high-quality playbooks
2. package trust levels and signature model
3. sandbox validation for distributable playbooks
4. enough usage data to populate reputation signals

Suggested initial library:

1. `install_env`
2. `setup_ci`
3. `deploy`
4. `rollback_deploy`
5. `collect_artifacts`
6. `smoke_test_service`

## 16. Open Questions

1. should marketplace packages be tenant-private first, or org-shared by default
2. should automation definitions live only in tables, or also mirror into graph nodes for recall and search
3. should package compatibility version against Aionis API version, capability matrix, or both
4. how much of approval flow belongs in Ops Console versus API-only first
5. should automation outputs be available as memory artifacts for downstream recall by default
6. what is the minimum curated library size before marketplace discovery is user-visible
7. should package reputation be global, tenant-local, or split into both views

## 17. Recommended Decision

Recommended near-term decision:

1. approve `Playbook` as a first-class product concept immediately
2. implement `Automation DAG` as a thin orchestrator that calls existing `playbooks/run`
3. build a curated playbook library before positioning a broad marketplace
4. implement `Marketplace` first as packaging, installation, and trust infrastructure around curated assets
5. postpone graph-native playbook execution until marketplace and automation usage patterns justify it

This is the lowest-risk path that matches Aionis as it exists today.

## 18. Example Narrative

Canonical example:

```text
Playbooks:
- install_env
- setup_ci
- deploy

Automation:
install_env
-> setup_ci
-> deploy

Marketplace:
search package
-> install package
-> bind env and permissions
-> compose automation
-> shadow validate
-> activate
```

This yields a clear product ladder:

1. replay one run
2. reuse one playbook
3. compose many playbooks
4. distribute them through a governed marketplace
