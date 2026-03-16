# Testing Patterns

## Framework
- Vitest (not Jest) — `describe`, `it`, `expect`, `vi` from vitest
- Run with `pnpm test`

## Server Test Utilities (`test-utils.ts`)
- `createTestDb()` — in-memory SQLite with all migrations applied
- `createTestLogger()` — silent pino logger (no test output noise)
- `createTestConfig(overrides?)` — minimal Config with sensible defaults
- `flush()` — wait for async queue operations to settle

## Web Test Utilities (`test/utils.tsx`)
- `renderWithProviders()` — wraps component with router + query client
- MSW for API mocking
- `@testing-library/react` for component testing

## Conventions
- Test files colocated: `foo.ts` → `foo.test.ts`
- `afterEach` must call `db.destroy()` for any test that creates a DB
- Use `vi.fn()` for mocks, `vi.spyOn()` for spying
- Prefer `waitFor()` for async assertions in component tests
