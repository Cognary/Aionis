# Aionis SDK Demo Memory Context Runtime Shared Helper

This slice is groundwork for the eventual removal of the full `memory-context-runtime` route from the public demo path.

Instead of cutting the route directly, the reusable helper block has been moved into `memory-context-runtime-shared.ts`. That shared module now owns:

1. execution continuity and execution-packet static block assembly
2. execution kernel response shaping
3. recall knob normalization and adaptive tuning
4. recall request construction from context-route queries

The immediate effect is structural, not visible behavior. The full route still serves the same surface, but the next shrink slice can build a demo-only context route on top of the shared helpers instead of copying a large internal route file.
