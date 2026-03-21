# Aionis Product CLI Spec

## Goal

Move the user-facing entrypoint from host-specific installer commands toward one top-level command:

```bash
aionis
```

The first slice does not need full bundled distribution yet. It does need one stable user command that owns Codex installation and launch behavior.

## Product Shape

The user-facing command should become:

1. `aionis`
   - default launch path for the primary host
2. `aionis codex setup`
3. `aionis codex doctor`
4. `aionis codex status`
5. `aionis codex enable`
6. `aionis codex disable`
7. `aionis codex restore`
8. `aionis codex remove`
9. `aionis codex start`

## Responsibilities

The top-level CLI should:

1. hide `product:codex` from normal user usage
2. make Codex the default host path for now
3. allow the product shell to generate a local `aionis` launcher
4. keep host-specific logic behind the `codex` namespace

## First Slice

The first slice should include:

1. `src/product/aionis.ts`
2. a package script for the top-level CLI
3. a generated user launcher at `~/.local/bin/aionis`
4. doctor/status visibility for whether the launcher exists and whether that bin directory is on `PATH`

It should not yet include:

1. bundled binary distribution
2. multi-host switching UX
3. GUI installer
4. native package-manager formulas

## Success Criteria

This slice is successful when:

1. `setup` creates a user launcher named `aionis`
2. the user can manage the Codex shell through `aionis codex ...`
3. the product shell can report whether the launcher is actually discoverable on `PATH`
4. the path from installer commands to one branded top-level command is established
