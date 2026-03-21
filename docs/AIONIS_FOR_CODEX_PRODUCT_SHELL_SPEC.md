# Aionis for Codex Product Shell Spec

## Goal

Define the first actual user-facing product shell for Aionis on top of Codex.

The target is not another bridge or demo command.
The target is a path where a user can:

1. install Aionis into Codex once
2. check that it is healthy
3. start using Codex with Aionis active

without manually stitching together hook commands, environment variables, or JSON requests.

## Product Shape

The product shape is:

1. `setup`
   - installs Aionis-managed hook commands into Codex
   - writes one local product-shell config
   - reports whether the install was `created`, `updated`, or `unchanged`
2. `doctor`
   - tells the user whether the install is complete and whether Aionis is reachable
3. `status`
   - gives the current integration state without installer framing
4. `enable`
   - restores Aionis-managed hooks from the saved product config
5. `disable`
   - turns off only Aionis-managed hooks
6. `restore`
   - writes the pre-Aionis hook backup back onto `hooks.json`
7. `remove`
   - removes Aionis-managed launchers and config after disabling hooks
8. `start`
   - starts the local Aionis runtime if it is not already healthy

Everything else remains internal implementation detail:

1. hook bridge
2. shell bridge
3. host integration bus
4. capability registry

## User Experience

The first usable product loop should be:

1. `npm run -s product:codex -- setup`
2. `npm run -s product:codex -- doctor`
3. `npm run -s product:codex -- start`
4. user opens Codex and works normally

The product shell should own:

1. where Codex hook config is written
2. which Aionis commands Codex executes
3. which base URL and scope are used by default

The user should not need to:

1. edit `hooks.json` by hand
2. remember `adapter:codex-hook`
3. remember `adapter:codex-shell`
4. export a chain of environment variables manually

## Scope Of The First Slice

The first slice should build the minimal product shell, not the final finished integration.

It should include:

1. product-shell config file under Codex home
2. generated local launcher scripts for hook and shell entrypoints
3. `hooks.json` merge/update logic
4. runtime health checks
5. runtime startup launcher
6. one safe restore path
7. one safe uninstall path

It should not yet include:

1. full native Codex shell interception
2. GUI installer
3. dashboard UI
4. multi-profile host switching

## Install Layout

The product shell should create:

1. `~/.codex/aionis/config.json`
2. `~/.codex/aionis/bin/aionis-codex-hook.sh`
3. `~/.codex/aionis/bin/aionis-codex-shell.sh`
4. `~/.codex/hooks.json` entries that point to the generated hook launcher

The generated launchers should carry:

1. repository root
2. base URL
3. scope

This keeps the hook file stable while allowing the product shell to regenerate launchers when settings change.

## Product Commands

### `setup`

Responsibilities:

1. detect Codex home
2. write Aionis product-shell config
3. create launcher scripts
4. merge Aionis hook handlers into `hooks.json`
5. report what was installed
6. report whether the install created, updated, or left the shell unchanged

### `doctor`

Responsibilities:

1. confirm Codex home exists
2. confirm Aionis product-shell config exists
3. confirm launcher scripts exist
4. confirm `hooks.json` contains Aionis-managed handlers
5. confirm runtime health endpoint responds

### `start`

Responsibilities:

1. read the product-shell config
2. health-check the configured runtime URL
3. if healthy, exit cleanly
4. if unhealthy, spawn `npm run start:lite` detached with the configured port

### `remove`

Responsibilities:

1. disable only Aionis-managed hooks
2. remove Aionis-managed launcher scripts
3. remove the Aionis product-shell config
4. preserve unrelated Codex hook entries and the original hooks backup

## Success Criteria

The first product-shell slice is successful if:

1. a user can run one setup command
2. Codex hook installation no longer requires manual JSON editing
3. a user can run one doctor command and know what is wrong
4. a user can run one start command instead of manually assembling runtime startup
5. a user can safely restore or remove the integration without hand-editing files
6. the product shell hides the raw hook and shell bridge commands from normal usage
