## Summary

Describe the change in 2-5 sentences.

## Architecture Layer

Select one primary layer:

- [ ] `Kernel`
- [ ] `Runtime Services`
- [ ] `Control & Extensions`

If the PR spans more than one layer, state the reason briefly:

`n/a`

## Boundary Impact

Answer all items:

1. Does this PR introduce or remove any dependency direction across `Kernel -> Runtime Services -> Control & Extensions`?
   `yes/no`
2. Does this PR change kernel semantics or only packaging/wiring?
   `kernel-impacting / packaging-only`
3. If kernel-impacting, which canonical object or stable surface changed?
   `n/a`

## Spec References

Link the relevant docs when boundaries or contracts are touched:

- [ ] [/Users/lucio/Desktop/Aionis/docs/AIONIS_KERNEL_ARCHITECTURE_SPEC.md](/Users/lucio/Desktop/Aionis/docs/AIONIS_KERNEL_ARCHITECTURE_SPEC.md)
- [ ] [/Users/lucio/Desktop/Aionis/docs/internal/plans/AIONIS_KERNEL_ARCHITECTURE_ADOPTION_PLAN.md](/Users/lucio/Desktop/Aionis/docs/internal/plans/AIONIS_KERNEL_ARCHITECTURE_ADOPTION_PLAN.md)
- [ ] [/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_KERNEL_CONTRACT_CHECKLIST.md](/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_KERNEL_CONTRACT_CHECKLIST.md)

## Verification

List the exact commands you ran:

```text
npm run -s lint -- --no-cache
npm run -s build
```

## Rollback Surface

If runtime host or kernel behavior drifts, what is the smallest rollback unit?

`n/a`

## Review Notes

Anything reviewers should check first:

`n/a`
