# Aionis Public Repo Shrink Execution

This slice moves public shrink from structural preparation into execution planning.

The key change is not another route refactor. It is the introduction of a keep-manifest baseline that computes which `src/` files are still transitively required by the public SDK demo entrypoint.

That baseline currently shows:

1. direct demo residual route targets are already gone
2. transitive `src/` shrink is still substantial
3. the first safe move batch is narrow and concrete

This is the point where public shrink stops being intuition-driven and becomes manifest-driven.
