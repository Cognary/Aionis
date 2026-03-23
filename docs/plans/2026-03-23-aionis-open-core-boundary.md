# Aionis Open-Core Boundary

This step turns the current product instinct into a written repository position.

## What changed

1. Added a dedicated open-core boundary document.
2. Updated the root README to point at the new boundary.
3. Updated the SDK README to position `@aionis/sdk` as the primary open developer interface.
4. Updated the release note to reflect the packaging direction beyond `0.1.0`.

## Why it matters

Without this boundary, Aionis risks getting pulled in two bad directions at once:

1. over-opening the highest-value runtime internals too early
2. over-closing the developer entrypoint and slowing adoption

The SDK-open, runtime-layered position is the middle path that best fits the current stage.
