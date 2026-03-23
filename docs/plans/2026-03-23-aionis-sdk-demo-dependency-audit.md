# Aionis SDK Demo Dependency Audit

This slice adds the first executable shrink audit for the public `sdk_demo` stack.

The audit inspects the current demo entry, host, service, adapter, and route layering files and reports:

1. demo-owned dependency edges
2. allowed shared-boundary edges
3. residual runtime dependency edges

That makes the next public shrink slices more concrete, because the team can now see exactly which remaining imports still tie the public demo surface to deeper runtime implementation.
