Run all quality checks in sequence. Stop on first failure and report the result.

1. Run `pnpm biome check` — linting and formatting
2. Run `pnpm typecheck` — TypeScript type checking
3. Run `pnpm test` — Vitest test suite
4. Run `pnpm build` — production build

Report pass/fail for each step. If a step fails, show the error output and stop — do not continue to subsequent steps.
