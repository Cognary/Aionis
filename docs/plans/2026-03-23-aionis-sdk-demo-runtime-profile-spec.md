# Aionis SDK Demo Runtime Profile Spec

## Goal

Introduce a lighter public-facing runtime profile for SDK quickstart and examples, without deleting the deeper runtime tree yet.

## Requirements

1. Add a dedicated runtime entry that registers only the SDK demo route subset.
2. Add a Lite app start command for that profile.
3. Verify the SDK examples against the new runtime profile.
4. Update public SDK quickstart/docs to prefer the demo profile.

## Non-Goals

1. Removing the full runtime tree from the public repository.
2. Changing benchmark or full-runtime validation defaults.
3. Rewriting runtime internals into a separate package.
