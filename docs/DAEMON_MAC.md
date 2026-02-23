---
title: "macOS Daemon (launchd)"
---

# macOS Daemon (launchd)

This repo already ships a long-running worker loop (`npm run job:outbox-worker`).  
To make it a real daemon on macOS, use `launchd`.

Files in this repo:
- `scripts/daemon/run-api.sh`
- `scripts/daemon/run-outbox-worker.sh`
- `scripts/launchd/com.aionis.memory.api.plist` (template)
- `scripts/launchd/com.aionis.memory.outbox-worker.plist` (template)
- `scripts/launchd/install.sh` (installs LaunchAgents with resolved repo path)
- `scripts/launchd/uninstall.sh`

## 0) Pre-req

```bash
make db-migrate
npm run -s build
```

## 1) Install to LaunchAgents

```bash
bash scripts/launchd/install.sh
```

## 2) Status / Logs

```bash
launchctl list | rg "com\\.aionis\\.memory\\.(api|outbox-worker)" || true
tail -n 200 /tmp/aionis-memory-api.out.log
tail -n 200 /tmp/aionis-memory-api.err.log
tail -n 200 /tmp/aionis-memory-outbox-worker.out.log
tail -n 200 /tmp/aionis-memory-outbox-worker.err.log
```

## 3) Uninstall

```bash
bash scripts/launchd/uninstall.sh
```
