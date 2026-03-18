# Tutorial: Aionis Doc Quickstart

Create one `.aionis.md` file, compile it, publish it into handoff memory, and recover execution continuity back through the native endpoint.

## Before you start

1. You have a running Aionis endpoint in `BASE_URL`.
2. `npx @aionis/sdk@0.2.20 --help` works in your shell.
3. You know your `scope`, and if auth is enabled you have `AIONIS_API_KEY` or bearer auth ready.

If you still need an endpoint first, run [Quickstart](/guide/quickstart) or [Lite Public Beta](/guide/lite-public-beta).

## What you will finish with

One document-driven workflow that goes through:

1. source authoring
2. compile
3. runtime handoff shaping
4. publish into `/v1/handoff/store`
5. recover through `/v1/handoff/recover`

> **Tip - Copy and run**
> This tutorial uses only the public `aionis doc ...` CLI path. Keep the generated JSON files because they make it easier to inspect contracts and retry steps without recomputing everything.

## Input

### Environment contract

Use these values across all steps:

1. `BASE_URL = http://127.0.0.1:3001`
2. `SCOPE = default`
3. `DOC_DIR = .aionis-doc-quickstart`

If your environment requires API auth:

1. `AIONIS_API_KEY = <your key>`

### Output fields to persist

| Field | Source step | Why keep it |
| --- | --- | --- |
| `compile_result_version` | 2 | Confirms the contract version you compiled against |
| `runtime_handoff_version` | 3 | Confirms the continuity envelope version |
| `response.commit_id` | 4 | The stored handoff commit identifier |
| `response.handoff_anchor` | 4 | The anchor used for later recovery |
| `recover_result_version` | 5 | Confirms the recover contract version |
| `recover_response.request_id` | 5 | Native recover request trace |

## Step 1: Create a minimal `.aionis.md` file

```bash
mkdir -p "$DOC_DIR"

cat > "$DOC_DIR/workflow.aionis.md" <<'EOF'
@doc {
  id: "quickstart-workflow-001"
  version: "1.0"
  kind: "workflow"
}

# Goal
Turn one Aionis Doc into a recoverable handoff.

@context {
  product: "Aionis"
  audience: ["operators", "builders"]
  objective: "Create a short workflow summary"
}

@execute {
  module: "research.claims.v1"
  input_ref: "ctx"
  output_ref: "run.claims"
}

@execute {
  module: "copy.summary.v1"
  input_ref: "run.claims"
  output_ref: "out.summary"
  depends_on: ["run.claims"]
}

@replay {
  executable: true
  mode: "deterministic"
  expected_outputs: ["out.summary"]
}
EOF
```

What this document does:

1. declares one workflow identity with `@doc`
2. stores document-level inputs in `ctx`
3. writes an intermediate result to `run.claims`
4. writes a final result to `out.summary`
5. declares replay expectations

## Step 2: Compile the document

```bash
npx @aionis/sdk@0.2.20 doc compile "$DOC_DIR/workflow.aionis.md" \
  --emit all \
  --out "$DOC_DIR/compile.json"

jq '{version: .compile_result_version, summary: .summary, diagnostics: .diagnostics}' \
  "$DOC_DIR/compile.json"
```

What to confirm:

1. `compile_result_version` is `aionis_doc_compile_result_v1`
2. `summary.has_errors` is `false`
3. `diagnostics` is empty
4. `artifacts.graph.doc_id` is `quickstart-workflow-001`

If compile fails, stop here and fix the document first.

## Step 3: Build a runtime handoff

```bash
npx @aionis/sdk@0.2.20 doc runtime-handoff "$DOC_DIR/workflow.aionis.md" \
  --scope "$SCOPE" \
  --out "$DOC_DIR/runtime-handoff.json"

jq '{version: .runtime_handoff_version, graph: .graph_summary, stage: .execution_state_v1.current_stage}' \
  "$DOC_DIR/runtime-handoff.json"
```

What this step gives you:

1. `execution_state_v1`
2. `execution_packet_v1`
3. `execution_ready_handoff`
4. `graph_summary`

This is the continuity carrier between compile-time structure and runtime storage.

## Step 4: Publish the document into handoff memory

### With API key auth

```bash
npx @aionis/sdk@0.2.20 doc publish "$DOC_DIR/workflow.aionis.md" \
  --base-url "$BASE_URL" \
  --scope "$SCOPE" \
  --api-key "$AIONIS_API_KEY" \
  --compact > "$DOC_DIR/publish-result.json"
```

### Without API auth

```bash
npx @aionis/sdk@0.2.20 doc publish "$DOC_DIR/workflow.aionis.md" \
  --base-url "$BASE_URL" \
  --scope "$SCOPE" \
  --compact > "$DOC_DIR/publish-result.json"
```

Inspect the stored result:

```bash
jq '{
  version: .publish_result_version,
  input_kind: .input_kind,
  commit_id: .response.commit_id,
  handoff_anchor: .response.handoff_anchor,
  handoff_kind: .response.handoff_kind
}' "$DOC_DIR/publish-result.json"
```

What to confirm:

1. `publish_result_version` is `aionis_doc_publish_result_v1`
2. `response.commit_id` exists
3. `response.handoff_anchor` exists
4. `response.handoff_kind` is populated

## Step 5: Recover continuity from the same document

### With API key auth

```bash
npx @aionis/sdk@0.2.20 doc recover "$DOC_DIR/workflow.aionis.md" \
  --base-url "$BASE_URL" \
  --scope "$SCOPE" \
  --api-key "$AIONIS_API_KEY" \
  --compact > "$DOC_DIR/recover-result.json"
```

### Without API auth

```bash
npx @aionis/sdk@0.2.20 doc recover "$DOC_DIR/workflow.aionis.md" \
  --base-url "$BASE_URL" \
  --scope "$SCOPE" \
  --compact > "$DOC_DIR/recover-result.json"
```

Inspect the recovered result:

```bash
jq '{
  version: .recover_result_version,
  publish_commit_id: .publish_result.response.commit_id,
  recover_request_id: .recover_response.request_id,
  anchor: .recover_response.data.anchor,
  handoff_kind: .recover_response.data.handoff_kind,
  next_action: .recover_response.data.handoff.next_action
}' "$DOC_DIR/recover-result.json"
```

What to confirm:

1. `recover_result_version` is `aionis_doc_recover_result_v1`
2. the publish step returned a `commit_id`
3. the recover step returned a `request_id`
4. the recovered `anchor` matches the published handoff

## Optional: Recover from an existing publish result

If publish already succeeded earlier, you can skip the extra store call and recover from the saved publish result instead:

```bash
npx @aionis/sdk@0.2.20 doc recover "$DOC_DIR/publish-result.json" \
  --input-kind publish-result \
  --base-url "$BASE_URL" \
  --scope "$SCOPE" \
  --api-key "$AIONIS_API_KEY" \
  --compact > "$DOC_DIR/recover-from-publish-result.json"
```

This is useful when:

1. publish happened in an earlier pipeline step
2. you want recover-only retries
3. you need to debug continuity separately from storage

## What success looks like

1. compile returns no errors
2. runtime handoff contains `execution_state_v1` and `execution_packet_v1`
3. publish returns `commit_id` and `handoff_anchor`
4. recover returns the same anchor and a native recover response

## Common failure and fix

Failure:

```text
UNRESOLVED_REF
```

Fix:

1. confirm every `input_ref` points to an existing `ctx.*`, `run.*`, `out.*`, `doc.*`, or `mem.*` path
2. rerun `aionis doc compile`
3. only continue to publish when diagnostics are clear

## Read next

1. [Tutorial: Integrate One Agent End-to-End](agent-integration)
2. [SDK Guide](/guide/sdk-guide)
3. [Reference](/reference/)
