# Aionis Public Repo Retention Spec

## Goal

Define the exact retention boundary for the public `Cognary/Aionis` repository now that `Cognary/Aionis-runtime` exists as the private runtime-core repository.

## Requirements

1. The public repository must remain usable as the SDK entrypoint.
2. The public repository must keep a lightweight demo/quickstart path.
3. The document must distinguish between:
   - what stays public now
   - what should move to private ownership
   - what cannot be removed yet because the demo shell still depends on it

## Non-Goals

1. Performing the runtime extraction itself.
2. Deleting `src/` immediately.
3. Final licensing decisions.
