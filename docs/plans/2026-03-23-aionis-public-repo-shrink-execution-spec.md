# Aionis Public Repo Shrink Execution Spec

## Goal

Add an executable keep-manifest baseline so the public repository can start a real shrink phase after the `sdk_demo` residual route audit reaches zero.

## Why

Once direct route residuals are gone, the next risk is deleting transitive runtime files blindly. The public repo needs a concrete keep/move baseline derived from the demo entrypoint.

## Scope

1. add a keep-manifest script rooted at `src/index-sdk-demo.ts`
2. expose it through `npm run public:keep-manifest`
3. document the current keep/move baseline
4. record the first safe move batch for public shrink execution

## Non-Goals

1. no actual file deletion in this slice
2. no runtime behavior changes
3. no private-repo sync automation in this slice
