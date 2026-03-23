# Aionis Lite Wrapper

This directory owns the Lite app launcher for the standalone `Aionis Lite` repository.

Current state:

1. It owns the Lite app wrapper entrypoint and startup script.
2. It launches the root Lite source runtime through `tsx`.
3. It keeps Lite startup behavior isolated from the shared runtime tree.
4. It no longer depends on a copied `dist/index.js` launcher artifact.

Current commands:

```bash
npm --prefix apps/lite run build
npm --prefix apps/lite run start
npm --prefix apps/lite run start:sdk-demo
npm --prefix apps/lite run start:print-env
```

Current runtime model:

1. root `src/index.ts` is the Lite runtime source entrypoint
2. `apps/lite/src/index.js` is the Lite app launcher
3. `apps/lite/scripts/start-lite-app.sh` owns Lite startup behavior
4. root `scripts/start-lite.sh` remains a compatibility shim
5. startup runs directly from source and does not require a prebuilt wrapper artifact

SDK demo runtime profile:

1. `npm --prefix apps/lite run start:sdk-demo`
2. this profile starts a reduced route surface for SDK quickstart/examples
3. it is meant to become the long-term public demo shell baseline as the full runtime mainline moves to the private repository

Default local identity:

1. Lite startup exports `LITE_LOCAL_ACTOR_ID=local-user` unless overridden
2. replay/playbook routes use that actor when no auth principal is present
3. automation runs also fall back to that actor, so playbook-driven flows work without extra identity payloads

Useful override:

```bash
LITE_LOCAL_ACTOR_ID=lucio npm --prefix apps/lite run start
```

Default sandbox behavior:

1. Lite startup exports `SANDBOX_ENABLED=true`
2. Lite startup exports `SANDBOX_ADMIN_ONLY=false`
3. set `SANDBOX_ADMIN_ONLY=true` when you want to relock sandbox routes behind the admin token
