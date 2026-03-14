# Aionis SDK Release Flow

Date: `2026-03-14`

## Scope

This release flow covers:

1. TypeScript package: `@aionis/sdk`
2. Python package: `aionis-sdk`

It does not cover:

1. server image release
2. plugin release
3. docs site deployment

## Current State

As of `2026-03-14`:

1. the developer-facing non-admin, non-control-plane route surface was re-audited
2. audited route count: `65`
3. result: `no missing` SDK surface across TypeScript and Python
4. TypeScript package now includes the Phase 1 local developer CLI:
   - `aionis dev`
   - `aionis stop`
   - `aionis health`
   - `aionis doctor`
   - `aionis selfcheck`
5. Python package now includes the missing:
   - handoff store/recover
   - replay candidate/dispatch
   - automation graph validate
   - automation main run/control surfaces

## Release Preconditions

Before publishing a new SDK version:

1. root worktree state is understood and intentional
2. both SDK package versions are bumped together
3. changelog entries exist for both SDKs
4. install validation passes from packaged artifacts, not just source checkout

## Required Checks

### TypeScript SDK

```bash
cd /Users/lucio/Desktop/Aionis/packages/sdk
npm run build
npm pack --dry-run
```

Install validation:

```bash
TMP=$(mktemp -d /tmp/aionis-sdk-install-XXXXXX)
cd /Users/lucio/Desktop/Aionis/packages/sdk
npm pack
TGZ=$(ls -t aionis-sdk-*.tgz | head -n 1)
mkdir -p "$TMP/app"
cd "$TMP/app"
npm init -y
npm install "/Users/lucio/Desktop/Aionis/packages/sdk/$TGZ"
./node_modules/.bin/aionis --help
```

Minimum runtime API checks:

1. `handoffStore`
2. `handoffRecover`
3. `replayPlaybookCandidate`
4. `replayPlaybookDispatch`
5. `automationGraphValidate`

### Python SDK

```bash
cd /Users/lucio/Desktop/Aionis/packages/python-sdk
python3 -m build --sdist --wheel
```

Install validation:

```bash
TMP=$(mktemp -d /tmp/aionis-py-sdk-install-XXXXXX)
python3 -m venv "$TMP/venv"
. "$TMP/venv/bin/activate"
pip install --upgrade pip
pip install /Users/lucio/Desktop/Aionis/packages/python-sdk
python - <<'PY'
from aionis_sdk import AionisClient
c = AionisClient(base_url="http://127.0.0.1:3321")
for name in [
    "handoff_store",
    "handoff_recover",
    "replay_playbook_candidate",
    "replay_playbook_dispatch",
    "automation_graph_validate",
    "automation_create",
    "automation_run",
]:
    assert hasattr(c, name), name
print("py-sdk-ok")
PY
```

## Known Packaging Notes

### TypeScript SDK

Current `npm pack --dry-run` is green.

Expected packaged files include:

1. `dist/cli.js`
2. `dist/client.js`
3. `dist/index.js`
4. `dist/types.js`
5. `README.md`
6. `CHANGELOG.md`

### Python SDK

Current `python -m build` is green.

Current warning:

1. `pyproject.toml` uses deprecated setuptools license table/classifier patterns

This is not a release blocker today, but should be cleaned up before it becomes enforced.

## Version Bump Order

Release order should be:

1. bump `packages/sdk/package.json`
2. bump `packages/python-sdk/pyproject.toml`
3. update `packages/sdk/CHANGELOG.md`
4. update `packages/python-sdk/README.md` if package-facing install docs changed
5. update root README only if public package install behavior changed

## Publish Order

Recommended order:

1. publish npm package first
2. verify install from registry
3. publish PyPI package second
4. verify install from registry

Reason:

1. CLI behavior is currently TypeScript-only
2. npm package is the more visible entrypoint for the new `aionis dev` story

## Publish Commands

### TypeScript

```bash
cd /Users/lucio/Desktop/Aionis/packages/sdk
npm publish --access public
```

### Python

```bash
cd /Users/lucio/Desktop/Aionis/packages/python-sdk
python3 -m build --sdist --wheel
python3 -m twine upload dist/*
```

## Post-Publish Verification

### npm

```bash
npm view @aionis/sdk version
npx @aionis/sdk --help
```

### PyPI

```bash
python3 -m venv /tmp/aionis-pypi-check
. /tmp/aionis-pypi-check/bin/activate
pip install aionis-sdk
python - <<'PY'
from aionis_sdk import AionisClient
print(hasattr(AionisClient(base_url="http://127.0.0.1:3321"), "handoff_store"))
PY
```

## Recommended Next Release Shape

If the next SDK release is cut from current `main`, the user-visible change summary should be:

1. full developer-route coverage across TypeScript and Python SDKs
2. local Lite developer CLI in the TypeScript package
3. handoff/replay/automation parity fixes in Python SDK

## Current Non-Release Blockers

These exist, but they are not SDK release blockers:

1. root repo has unrelated modified files outside SDK scope
2. `packages/sdk/aionis-sdk-0.2.17.tgz` is a local artifact and should not be treated as source
3. Python packaging emits license deprecation warnings
