# Lite Internal Governance Review Provider Plan

1. Add internal governance review-provider types
2. Extend the generic governed preview runner with optional review resolution
3. Expose optional provider hooks from shared `promote_memory` and `form_pattern` runners
4. Add focused contract tests for provider precedence and fallback
5. Run:
   - `npx tsc --noEmit`
   - targeted governance tests
   - `npm run -s test:lite`
