---
title: "Scope and Tenant Isolation"
---

# Scope and Tenant Isolation

Isolation is defined by `(tenant_id, scope)`.

## Guarantees

1. Writes and recalls are partitioned by tenant/scope.
2. Access to private lanes requires explicit identity match.
3. Admin controls and quotas can be enforced per tenant.

## Related

1. [API Contract](/public/en/api/01-api-contract)
2. [Operate & Production](/public/en/operate-production/00-operate-production)
