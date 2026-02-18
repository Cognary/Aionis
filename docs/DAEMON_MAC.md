---
title: "macOS Daemon (launchd)"
---

# macOS Daemon (launchd)

This repo already ships a long-running worker loop (`npm run job:outbox-worker`).  
To make it a real daemon on macOS, use `launchd`.

Files in this repo:
- `/Users/lucio/Desktop/Aionis/scripts/daemon/run-api.sh`
- `/Users/lucio/Desktop/Aionis/scripts/daemon/run-outbox-worker.sh`
- `/Users/lucio/Desktop/Aionis/scripts/launchd/com.aionis.memory.api.plist`
- `/Users/lucio/Desktop/Aionis/scripts/launchd/com.aionis.memory.outbox-worker.plist`

## 0) Pre-req

```bash
cd /Users/lucio/Desktop/Aionis
make db-migrate
npm run -s build
```

## 1) Install to LaunchAgents

```bash
mkdir -p ~/Library/LaunchAgents
cp /Users/lucio/Desktop/Aionis/scripts/launchd/com.aionis.memory.api.plist ~/Library/LaunchAgents/
cp /Users/lucio/Desktop/Aionis/scripts/launchd/com.aionis.memory.outbox-worker.plist ~/Library/LaunchAgents/
launchctl unload ~/Library/LaunchAgents/com.aionis.memory.api.plist 2>/dev/null || true
launchctl unload ~/Library/LaunchAgents/com.aionis.memory.outbox-worker.plist 2>/dev/null || true
launchctl load ~/Library/LaunchAgents/com.aionis.memory.api.plist
launchctl load ~/Library/LaunchAgents/com.aionis.memory.outbox-worker.plist
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
launchctl unload ~/Library/LaunchAgents/com.aionis.memory.api.plist || true
launchctl unload ~/Library/LaunchAgents/com.aionis.memory.outbox-worker.plist || true
rm -f ~/Library/LaunchAgents/com.aionis.memory.api.plist
rm -f ~/Library/LaunchAgents/com.aionis.memory.outbox-worker.plist
```

