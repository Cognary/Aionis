1. Add a shared provider factory under `src/memory`.
2. Move `promote_memory` and `form_pattern` selection precedence into that factory.
3. Rewrite the runtime builder to call the factory instead of branching itself.
4. Add a factory contract test.
5. Add the new test to `test:lite`.
6. Update governance status.
