# Lite Governed Learning Benchmark Plan

Date: 2026-03-23

## Plan

1. Let the benchmark app accept env overrides so governed provider gates can be enabled for one scenario
2. Add a helper that seeds multiple active tool rules
3. Add `governed_learning_runtime_loop` to the real-task benchmark suite
4. Update the testing strategy scenario list to include the new governed benchmark
5. Run the benchmark and confirm the suite still passes from a fresh temp-backed store
