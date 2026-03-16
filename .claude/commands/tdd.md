Implement a feature using test-driven development (RED-GREEN-REFACTOR).

Ask the user what to implement if not provided: $ARGUMENTS

## Workflow

### RED — Write a failing test first
1. Create or update the test file (colocated: `foo.ts` → `foo.test.ts`)
2. Use Vitest: `describe`, `it`, `expect` from vitest
3. For server tests, use test utilities from `packages/server/src/test-utils.ts`:
   - `createTestDb()` — in-memory SQLite with migrations
   - `createTestLogger()` — silent pino logger
   - `createTestConfig()` — minimal Config
   - `flush()` — wait for async queue ops
4. For web tests, use `renderWithProviders()` from `packages/web/src/test/utils.tsx`
5. Run `pnpm test` — confirm the test FAILS

### GREEN — Write the minimum code to pass
1. Implement just enough to make the test pass
2. Run `pnpm test` — confirm the test PASSES
3. Don't add extras — only what the test requires

### REFACTOR — Clean up while keeping tests green
1. Improve code quality without changing behavior
2. Run `pnpm test` — confirm tests still PASS
3. Run `pnpm biome check` — confirm formatting/linting

Repeat the cycle for each piece of functionality.
