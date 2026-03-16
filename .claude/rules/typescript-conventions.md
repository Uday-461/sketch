# TypeScript Conventions

## Formatting
- Biome for all formatting and linting (not Prettier or ESLint)
- 2-space indent, 120 character line width
- Run `pnpm biome check` to verify

## Type Safety
- Strict TypeScript (`strict: true`) — no `any`, use `unknown` for untrusted input
- `import type` for type-only imports
- `Generated<string>` for auto-generated DB columns in schema.ts

## Logging
- pino for all logging — never use `console.log` in application code
- Never log message content (user privacy)
- Use structured fields: `logger.info({ userId, channelId }, "Description")`

## Validation
- zod for all API input validation
- zod schemas defined inline in route handlers

## Code Organization
- Feature-domain directories: `slack/`, `whatsapp/`, `agent/`, `db/`, `api/`, `scheduler/`
- Repository factory pattern: `createXxxRepository(db)` returns query functions
- Colocated tests: `foo.ts` → `foo.test.ts`
- Docstrings over inline comments — explain "why", not "what"

## Commits
- Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`
