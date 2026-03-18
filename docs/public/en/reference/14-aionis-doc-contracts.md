---
title: "Aionis Doc Contracts"
---

# Aionis Doc Contracts

The Aionis Doc toolchain emits versioned JSON contracts so downstream runtime and tooling integrations can rely on stable shapes.

## Current Versioned Outputs

### Compile Result

Version:

```text
aionis_doc_compile_result_v1
```

Purpose:

1. compiler envelope
2. diagnostics summary
3. AST / IR / graph transport

### Execution Result

Version:

```text
aionis_doc_execution_result_v1
```

Use:

1. direct execution output envelope
2. minimal execution result for a runtime-neutral plan
3. stable carrier for `outputs`, `artifacts`, `evidence`, `node_results`, `errors`, and `warnings`

### Runtime Handoff

Version:

```text
aionis_doc_runtime_handoff_v1
```

Purpose:

1. execution continuity carrier
2. `execution_state_v1`
3. `execution_packet_v1`
4. `execution_ready_handoff`
5. optional `execution_result_summary`
6. continuity mapping for execution-time `artifacts` and `evidence`

### Handoff Store Request

Version:

```text
aionis_doc_handoff_store_request_v1
```

Purpose:

1. native `/v1/handoff/store` request payload
2. explicit bridge from document runtime handoff into Aionis handoff memory

### Publish Result

Version:

```text
aionis_doc_publish_result_v1
```

Purpose:

1. store submission result
2. returned `commit_id`
3. stored anchor and handoff kind

### Recover Result

Version:

```text
aionis_doc_recover_result_v1
```

Purpose:

1. publish-plus-recover or recover-only result
2. recover request payload
3. recovered handoff response

### Resume Result

Version:

```text
aionis_doc_resume_result_v1
```

Purpose:

1. post-recover resume result envelope
2. `context/assemble` request and response snapshots
3. `tools/select` request and response snapshots
4. `tools/decision` lifecycle lookup result
5. `tools/run` lifecycle lookup result

## Contract Progression

The usual progression is:

1. compile result
2. execution result
3. runtime handoff
4. handoff store request
5. publish result
6. recover result
7. resume result

## Runtime-Neutral Module Contract

Direct execution now also depends on a stable module-side contract, not only on JavaScript handlers.

The execution surface uses a `manifest + handler` split:

1. `manifest.module`
2. `manifest.version`
3. `manifest.required_capabilities`
4. `manifest.input_contract`
5. `manifest.output_contract`
6. `manifest.artifact_contract`
7. `manifest.evidence_contract`
8. `handler(input, context)`

The manifest is the portable part. It describes what the module is, what capabilities it requires, and what shape its input and output must satisfy. The handler is only the local runtime implementation.

This matters because it lets runtimes validate:

1. unsupported module capabilities
2. malformed module input
3. malformed module output
4. malformed artifact side outputs
5. malformed evidence side outputs

without hard-wiring the execution contract to one runtime implementation.

## Continuity Mapping

When direct execution already happened, `runtime_handoff_v1` can now also carry:

1. `execution_result_summary`
2. `execution_artifacts`
3. `execution_evidence`
4. `execution_packet_v1.artifact_refs`
5. `execution_packet_v1.evidence_refs`

That means the handoff no longer carries only future continuity state. It can also carry structured side outputs produced by an earlier execution step.

## Resume Lifecycle Mapping

When recovered continuity continues into the runtime policy loop, `resume_result_v1` now explicitly carries:

1. `resume_summary`
2. `context_assemble_response`
3. `tools_select_response`
4. `tools_decision_response`
5. `tools_run_response`
6. optional `tools_feedback_request`
7. optional `tools_feedback_response`
8. optional `tools_run_post_feedback_response`

The `resume_summary` block exists so callers do not need to diff two `tools/run` snapshots themselves. It currently carries:

1. `selected_tool`
2. `resume_state`
3. `feedback_written`
4. `feedback_outcome`
5. `pre_feedback_run_status`
6. `post_feedback_run_status`
7. `lifecycle_transition`
8. `lifecycle_advanced`
9. `feedback_updated_rules`

`resume_state` is the preferred machine-facing verdict:

1. `inspection_only`
2. `feedback_applied`
3. `lifecycle_advanced`

That means `aionis doc resume` no longer stops at selection. It also returns read-only snapshots for decision and run lifecycle lookups. When `--feedback-outcome` is set, it can additionally include one governance feedback write and a post-feedback run lifecycle reread in the same envelope.

## Why Versioned Envelopes Matter

These contracts make it easier to:

1. keep CLI output stable
2. connect runtime consumers without per-command parsing drift
3. validate integrations in tests
4. evolve later contracts without breaking earlier ones silently

## Related

1. [Aionis Doc](/public/en/reference/10-aionis-doc)
2. [Aionis Doc CLI Workflow](/public/en/reference/13-aionis-doc-cli-workflow)
3. [SDK CLI](/public/en/reference/09-sdk-cli)
4. [Aionis Doc Examples](/public/en/reference/15-aionis-doc-examples)
5. [Aionis Doc Diagnostics](/public/en/reference/16-aionis-doc-diagnostics)
