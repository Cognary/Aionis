# Aionis for Codex Product Shell Guide

## Summary

`Aionis for Codex` is the first install-style product shell for using Aionis with Codex.

After setup, the shell also generates a branded user launcher:

```bash
aionis
```

The user path is now:

1. `aionis codex setup`
2. `aionis codex doctor`
3. `aionis codex start`
4. `aionis codex disable`
5. `aionis codex enable`
6. `aionis codex status`
7. `aionis codex restore`
8. `aionis codex remove`
9. `aionis`

That replaces the old low-level path of manually wiring hook commands and runtime environment variables.

## Commands

### Setup

```bash
aionis codex setup
```

This command:

1. creates `~/.codex/aionis/config.json`
2. creates generated launcher scripts under `~/.codex/aionis/bin/`
3. creates `~/.local/bin/aionis`
4. installs Aionis-managed entries into `~/.codex/hooks.json`
5. creates `~/.codex/aionis/hooks.backup.json` once if an existing `hooks.json` was already present
6. reports whether the install was `created`, `updated`, or `unchanged`

### Doctor

```bash
aionis codex doctor
```

This command reports:

1. whether Codex home exists
2. whether Aionis config exists
3. whether launcher scripts exist
4. whether Aionis-managed hooks are installed
5. whether Aionis-managed hooks are currently enabled
6. whether a hooks backup exists
7. whether the generated `aionis` launcher exists
8. whether `~/.local/bin` is already on `PATH`
9. whether the configured runtime is healthy

### Status

```bash
aionis codex status
```

This is the user-facing alias for the current shell state.

Use it when you just want the current integration state without thinking in installer terms.

### Disable

```bash
aionis codex disable
```

This removes only the Aionis-managed hook entries from `~/.codex/hooks.json`.

It does not delete unrelated Codex hooks.

### Enable

```bash
aionis codex enable
```

This restores the Aionis-managed hook entries using the saved product-shell config.

### Restore

```bash
aionis codex restore
```

This writes the saved hooks backup back onto `~/.codex/hooks.json`.

Use it when you want to return to the pre-Aionis hook state, not merely disable the current Aionis-managed handlers.

### Remove

```bash
aionis codex remove
```

This:

1. disables Aionis-managed hooks
2. removes `~/.codex/aionis/config.json`
3. removes generated launcher scripts
4. preserves unrelated Codex hooks
5. preserves the original hooks backup so the user still has an escape hatch

### Start

```bash
aionis codex start
```

This command:

1. checks whether Aionis is already running
2. if not, starts the local runtime on the configured port

### Launch

```bash
aionis
```

This is the branded launch path. In the current slice it is the top-level command that moves the user path toward “start Aionis, then open Codex”.

## Current Reality

This is the first product shell, not the final end state.

It already gives the user:

1. one install command
2. one diagnosis command
3. one runtime-start command
4. one on/off switch for Codex-managed hooks
5. one stable status command
6. one way to restore the original hook file from backup
7. one clean uninstall path that removes Aionis-managed files
8. one branded user launcher named `aionis`

It does not yet give:

1. full native Codex shell interception
2. final polished packaging
3. GUI onboarding

But it is now the correct user-facing path.
