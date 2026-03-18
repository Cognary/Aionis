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

## Contract Progression

The usual progression is:

1. compile result
2. runtime handoff
3. handoff store request
4. publish result
5. recover result

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
