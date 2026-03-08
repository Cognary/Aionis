---
title: Codex Local Profile
description: Run Codex with Aionis Dev MCP, standalone Docker, and a tracked local replay loop.
---

<div class="doc-hero doc-hero-start">
  <span class="status-pill stable">Official Integration</span>
  <h1>Codex Local Profile</h1>
  <p class="doc-hero-subtitle">
    Aionis Codex Local Profile is the official local integration path for Codex users.
    It combines Aionis Dev MCP, standalone Docker, and a tracked agent wrapper into one local workflow.
  </p>
  <div class="doc-hero-strip">
    <span>Dev MCP</span>
    <span>Standalone Docker</span>
    <span>Tracked local loop</span>
  </div>
  <div class="doc-hero-panel">
    <div class="doc-hero-grid">
      <div class="doc-hero-chip active">run_start</div>
      <div class="doc-hero-chip">planning_context</div>
      <div class="doc-hero-chip accent">step_recording</div>
      <div class="doc-hero-chip">run_end</div>
    </div>
    <div class="doc-hero-meta">
      <span>run_id</span>
      <span>decision_id</span>
      <span>commit_uri</span>
      <span>replay_step</span>
    </div>
  </div>
</div>

## What this profile is

This profile packages three things together:

1. `Aionis Dev MCP` as the MCP tool surface for Codex.
2. standalone Docker as the local Aionis runtime.
3. a tracked launcher that records local sessions and command steps.

Use this path when you want more than a raw MCP endpoint. The goal is to make local coding tasks replayable and inspectable by default.

## Who should use it

Use Codex Local Profile when you want:

1. Codex to access Aionis memory, replay, planning, and learn-from-run capabilities.
2. local coding sessions to preserve a stable `run_id` and step trail.
3. build, test, and lint commands to show up as replayable local execution steps.
4. one productized path instead of hand-assembling scripts, Docker commands, and MCP config.

## What happens by default

When you launch Codex through `codex-aionis`, the local loop becomes:

1. Aionis starts a tracked run.
2. planning context is assembled for the session.
3. local command steps can be recorded into replay history.
4. the run is closed automatically at session end.

That gives local development a usable provenance chain instead of ad hoc shell history.

## Architecture

```mermaid
flowchart LR
  U["Developer"] --> C["codex-aionis"]
  C --> M["Aionis Dev MCP"]
  C --> W["Tracked local wrapper"]
  M --> A["Aionis standalone"]
  W --> A
  W --> R["Replay runs and steps"]
```

## 3-minute setup

### 1. Start standalone

```bash
cd /path/to/Aionis
npm run -s mcp:aionis:dev:standalone:oneclick
```

This starts a local standalone runtime, waits for health, and validates the built-in Dev MCP path.

### 2. Generate Codex setup guidance

```bash
npm run -s aionis:setup:codex
```

This prints:

1. the recommended `aionis-dev` MCP configuration
2. the recommended local launcher command
3. the environment values currently expected by the profile

### 3. Install and verify the local launcher

```bash
npm run -s aionis:install:codex-launcher
codex-aionis-doctor
```

When the doctor passes, the local runtime, launcher, and replay loop are wired correctly.

## The two commands most users need

For most users, the product surface is only two commands:

```bash
codex-aionis-doctor
```

```bash
codex-aionis \
  --root /path/to/workspace \
  --title "Fix a regression" \
  --goal "Diagnose and fix the bug without breaking MCP behavior." \
  --query "Investigate the regression and preserve the local replay loop." \
  -- codex
```

`codex-aionis` is the product entrypoint. It is the shortest supported path to a tracked local Codex session.

## What Codex gets through Dev MCP

The built-in Dev MCP exposes the Aionis capabilities that matter most in coding workflows:

1. memory write and recall
2. planning context
3. tool selection, decision, run, and feedback hooks
4. replay run and replay step recording
5. playbook compilation and run reuse
6. local quality gate and learn-from-run flow

## Recording local command steps

Inside a live session, common commands can be recorded as replay steps:

```bash
AIONIS_RUN_ID=<run-id> \
AIONIS_SESSION_ROOT=/path/to/workspace \
bash /path/to/Aionis/scripts/aionis-build
```

Also available:

1. `bash /path/to/Aionis/scripts/aionis-test`
2. `bash /path/to/Aionis/scripts/aionis-lint`

These helpers are useful when you want the local replay trace to reflect what actually happened during debugging or validation.

## Supported deployment shape

This profile is designed for local use:

1. Aionis runs in standalone Docker.
2. Codex runs on the host.
3. the MCP client starts the built-in Dev MCP through the host launcher.
4. the local wrapper coordinates session start, step recording, and session end.

This is a productized local workflow, not a remote multi-tenant MCP gateway.

## Troubleshooting

If the profile does not behave as expected, check these first:

1. the standalone container is running
2. `codex-aionis-doctor` passes
3. `codex mcp list` shows `aionis-dev`

The shortest checks are:

```bash
codex-aionis-doctor
codex mcp list
```

## Related pages

1. [Integrations](integrations)
2. [Quickstart](quickstart)
3. [API Guide](api-guide)
4. [Operations and Gates](operations-and-gates)
