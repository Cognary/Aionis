---
title: "Automation Beta Limitations and Support Boundary"
---

# Automation Beta Limitations and Support Boundary

Status: `draft` (`2026-03-07`)  
Owner: Aionis Core  
Audience:

1. design partner operators
2. Aionis support and engineering
3. release owners

## 1. Beta Positioning

This beta is for:

1. validating Aionis as a thin automation orchestrator on top of replay playbooks
2. proving governed execution flows such as `approval`, `repair`, `shadow`, and basic compensation
3. supporting a small number of design partners under direct engineering supervision

This beta is not:

1. a general-purpose workflow engine
2. a public self-serve marketplace
3. a GA commitment for broad production orchestration

Approved positioning statement:

1. `Aionis Automation Beta is a governed replay-based orchestrator for controlled design partner use, not a replacement for Airflow, Temporal, or Prefect.`

## 2. Supported Beta Use Cases

The beta supports the following use cases:

1. linear or lightly branched DAGs with sequential dependency order
2. playbook-backed operational workflows such as `install_env -> setup_ci -> deploy`
3. approval-gated flows
4. guided repair flows that require operator approval or rejection
5. shadow validation runs for draft-to-shadow governance
6. reverse-order playbook compensation when explicitly configured

The beta is best suited for:

1. internal platform automation
2. CI/CD helper flows
3. low-cardinality operator-reviewed workflows
4. design partner evaluation of replay-governed orchestration

## 3. Explicitly Unsupported in Beta

The following are out of support boundary for this beta:

1. broad parallel scheduling guarantees
2. cron and event-trigger orchestration
3. high-volume queue-backed orchestration
4. public package publishing and discovery
5. self-serve install and compatibility resolution
6. non-playbook compensation handlers
7. sophisticated branching and recovery policy graphs
8. SLA-backed large-scale production control planes

If a partner needs any of the above, the answer in beta is:

1. `not supported in current scope`

## 4. Known Runtime Limitations

Current runtime limitations:

1. execution is sequential and topological, not parallel
2. failure policy is effectively stop-only; `on_failure` branching is not enabled
3. compensation exists as a playbook-based skeleton, not a full transaction-recovery system
4. shadow execution is explicit and governed, and there is now a minimal inspector plus run-scoped controls, but there is still no dedicated diff view
5. governance actions exist at API level, and there is now a minimal run-scoped operator console, but there is still no reviewer queue or broader queue-oriented workflow console
6. Marketplace install/distribution is not part of this beta

Current product limitations:

1. external-facing documentation for automation is still incomplete
2. operator workflows currently rely on API/script-driven control paths
3. broader public-beta readiness testing is not complete

## 5. Supported Control Actions

The following actions are supported in beta:

1. `create`
2. `get`
3. `validate`
4. `run`
5. `cancel`
6. `resume`
7. `approve_repair`
8. `reject_repair`
9. `compensation/retry`
10. `promote`

Supported run-state behaviors:

1. `approval_required`
2. `repair_required`
3. `cancelled`
4. `failed`
5. `failed_compensated`
6. `cancelled_compensated`
7. explicit `execution_mode=shadow`

## 6. Beta Success Criteria

The design partner beta is considered successful if:

1. at least one real workflow runs end-to-end without manual DB intervention
2. pause, repair, reject, cancel, and compensation states remain inspectable through API
3. shadow validation produces usable evidence for pre-activation review
4. no design partner hits an unrecoverable state-machine deadlock in normal use
5. rollout feedback shows that the thin-orchestrator positioning is understandable and credible

The beta is not trying to prove:

1. broad workflow-engine parity
2. marketplace ecosystem adoption
3. zero-touch operator UX

## 7. Support Model

Support level for this beta:

1. `business hours engineering-backed support`
2. `best effort response outside agreed support window`
3. `no public SLA`

Allowed support motions:

1. API-level diagnosis
2. migration assistance
3. replay and automation state inspection
4. controlled version rollback or disablement
5. design review for supported DAG patterns

Out-of-bound support motions:

1. custom workflow-engine feature work as production support
2. undocumented database surgery for partner-owned incidents
3. guarantees for unsupported branching or trigger semantics

## 8. Escalation Rules

Escalate to engineering immediately when:

1. a run is stuck in `running` or `paused` without a legal recovery path
2. terminal outcome and node evidence disagree
3. compensation mutates state but leaves missing audit evidence
4. a promoted automation version runs when governance state should block it
5. a migration or release changes run-state semantics

Severity guidance:

1. `P1`: state corruption, missing audit evidence, blocked partner workflow with no supported recovery
2. `P2`: recoverable control-path failures, incorrect status summaries, replay linkage gaps
3. `P3`: UX/documentation gaps without runtime correctness impact

## 9. Rollout Guardrails

Guardrails for the beta:

1. keep rollout behind explicit feature enablement
2. onboard only workflows reviewed by Aionis Core
3. prefer low-risk operational DAGs before deploy-grade automations
4. require partners to pin automation versions during validation
5. require a documented fallback path outside Aionis for critical releases

Recommended partner profile:

1. direct engineering contact available
2. tolerance for API-first product surfaces
3. willingness to work inside a bounded feature set

## 10. Release Messaging

What release owners may say:

1. `Automation beta is available for controlled design partner use.`
2. `The beta supports governed replay-based orchestration with approval, repair, compensation skeleton, and explicit shadow validation.`
3. `The product remains intentionally scoped as a thin orchestrator.`

What release owners should not say:

1. `Aionis now ships a general workflow platform`
2. `Marketplace is live`
3. `Automation is GA`
4. `Parallel orchestration and full failure branching are production-ready`

## 11. Current Recommendation

Decision as of `2026-03-07`:

1. `Design partner beta`: `go_with_known_limits`
2. `Public beta`: `no_go`
3. `GA`: `no_go`

Short reason:

1. runtime correctness is now strong enough for bounded external trials
2. governance UX, public docs, and public-beta hardening are still incomplete
