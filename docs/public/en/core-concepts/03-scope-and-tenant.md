---
title: "Scope and Tenant Isolation"
---

# Scope and Tenant Isolation

Aionis isolation is based on `(tenant_id, scope)` and enforced across write, recall, and policy surfaces.

## Isolation Layers

| Layer | Boundary | Outcome |
| --- | --- | --- |
| Tenant | organization-level partition | no cross-tenant data leakage |
| Scope | workload/environment partition | independent memory contexts |
| Lane visibility | identity-bound private access | controlled per-agent/team access |

## Isolation Guarantees

1. Writes and recalls are partitioned by tenant and scope.
2. Private-lane reads require owner identity match.
3. Policy evaluation is restricted to the request isolation boundary.
4. Quotas and controls can be enforced at tenant level.

## Recommended Scope Strategy

1. Use one scope per application domain or environment (`prod`, `staging`, etc.).
2. Keep test data in separate scopes from production traffic.
3. Avoid sharing mutable operational scopes across unrelated teams.
4. Standardize scope naming across SDK and API clients.

## Integration Checklist

1. Always send explicit `tenant_id` and `scope`.
2. Pass consumer identity fields where private lanes are expected.
3. Validate isolation in pre-release regression tests.
4. Alert on unexpected cross-scope or cross-tenant drift signals.

## Related

1. [API Contract](/public/en/api/01-api-contract)
2. [Operate and Production](/public/en/operate-production/00-operate-production)
3. [Planner Context](/public/en/reference/02-planner-context)
