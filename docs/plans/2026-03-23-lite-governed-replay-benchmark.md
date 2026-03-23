# Lite Governed Replay Benchmark Plan

Date: 2026-03-23

## Plan

1. Reuse the replay route wiring already proven in contract tests
2. Add a benchmark-local replay app helper with temp-backed write/replay/recall stores
3. Add `governed_replay_runtime_loop`
4. Update the testing strategy scenario list
5. Run the full real benchmark suite and confirm replay-governed learning now has real benchmark coverage
