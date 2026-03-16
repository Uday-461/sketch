# Sketch

Org-level AI assistant — single deployment, multiple users, each with isolated workspace, memory, and tool auth. Multi-channel support (Slack, WhatsApp, Telegram, Discord).

## Architecture

- Single Node.js process: Hono HTTP server + Slack Bolt + agent runner
- Claude Agent SDK as agent runtime (built-in tools, sessions, compaction, MCP)
- Kysely query builder with SQLite (default), Postgres planned
- Workspace isolation via `canUseTool` path validation + system prompt enforcement
- `permissionMode: "default"` — all tool calls go through `canUseTool` (no `allowedTools` bypass)

## Tech Stack

TypeScript, Node.js 24, pnpm monorepo, Hono, Kysely, Biome, pino, zod, tsdown, tsx

## Project Structure

```
sketch/
  .env                  → config (repo root, gitignored)
  .env.example          → documented env vars
  .claude/              → Claude Code config (hooks, rules, skills, commands, agents, guides)
  data/                 → runtime data (gitignored)
    sketch.db           → SQLite database
    workspaces/{uid}/   → per-user workspace dirs
  packages/
    server/src/
      index.ts          → entry point, wires everything
      bootstrap.ts      → createServer() — wires all adapters, queues, HTTP, scheduler
      config.ts         → zod + dotenv config validation
      logger.ts         → pino logger factory
      http.ts           → Hono app with /health
      queue.ts          → per-channel in-memory message queue
      slack/            → Slack adapter (Socket Mode, DMs, mentions, thread buffering)
      telegram/         → Telegram adapter (long polling, DMs, group mentions)
      discord/          → Discord adapter (DMs, guild channel mentions)
      whatsapp/         → WhatsApp adapter (Baileys, DMs, group mentions)
      agent/
        runner.ts       → runAgent() — Claude Agent SDK query() with canUseTool
        prompt.ts       → buildSystemContext() + formatBufferedContext() for prompts
        workspace.ts    → ensureWorkspace() creates user dirs
        sessions.ts     → session ID persistence (per-workspace or per-thread)
      db/
        schema.ts       → DB type interface
        migrate.ts      → static migration imports (bundler-safe)
        migrations/     → Kysely migrations
        repositories/   → query functions (users.ts, settings.ts, channels.ts, etc.)
      api/              → Hono route handlers (auth, channels, users, setup, settings)
      scheduler/        → TaskScheduler service for scheduled tasks
    web/src/            → React frontend (TanStack Router/Query, shadcn/ui)
    shared/src/         → shared types
```

## Conventions

- RESTful API design: resource-oriented URLs (no verbs in paths), correct HTTP methods (GET for reads, POST for creation, PUT for idempotent upserts, PATCH for partial updates, DELETE for removal). Use nouns for resources (e.g. `POST /api/users/:id/verification` not `POST /api/users/:id/send-verification`).
- Biome for linting and formatting (2-space indent, 120 line width)
- Strict TypeScript (`strict: true`)
- Conventional commits: `feat:`, `fix:`, `chore:`
- pino for structured JSON logging — never log message content
- zod + dotenv for config validation (`import "dotenv/config"`, .env at repo root)
- Kysely migrations run at app startup (static imports, not FileMigrationProvider)
- No unnecessary inline comments — prefer docstrings explaining decisions
- Vitest for testing
- Run `pnpm dev` from repo root — tsx watches `packages/server/src/index.ts`
- At the end of every feature, run all quality checks: `pnpm biome check`, `npx tsc --noEmit`, `pnpm test`, `pnpm build`

## Key Design Decisions

- Platform formatting via system prompt only, no post-processing
- Three-layer prompt: Claude Code preset → user's CLAUDE.md in workspace → platform/org context via `systemPrompt.append`
- Per-user workspace at `data/workspaces/{user_id}/` with session.json; per-channel workspace at `data/workspaces/channel-{id}/` with per-thread sessions at `sessions/{threadTs}.json`
- `canUseTool` validates all tool calls: file tools check path within workspace, Bash checks for absolute paths outside workspace, non-permitted tools denied
- `permissionMode: "default"` with no `allowedTools` — ensures `canUseTool` is always called (`allowedTools` bypasses `canUseTool`)
- In-memory per-channel message queue (sequential processing, one agent run at a time per channel)
- LLM access: Anthropic API, Bedrock (`CLAUDE_CODE_USE_BEDROCK`), OpenRouter, Vertex, or custom `ANTHROPIC_BASE_URL`
- Static migration imports instead of FileMigrationProvider (for tsdown bundler compatibility)
- `CURRENT_TIMESTAMP` in migrations for cross-dialect compatibility (SQLite + Postgres)

## Dev Workflow

Internal planning docs live in `.planning/` (git submodule):

- **STATE.md** — current project state, what's done, next steps, current version. Updated at end of every feature implementation and at end of each work session. Quick context resume for new sessions.
- **Task files** — one per feature/story (e.g., `TELEGRAM_ADAPTER.md`). Implementation plans with phases. Become historical reference once done.

**Planning approach:** Use `/plan` to create plan docs in `.planning/`. Discuss and refine in conversation, then implement.

**Implementation workflow:**
1. Discuss and create a plan file in `.planning/` via `/plan`
2. Implement the plan
3. Run quality checks (`/quality`)
4. Commit, `/update-state`, done

## Claude Code Configuration (`.claude/`)

Project-specific Claude Code config lives in `.claude/` and is committed to git.

### Hooks (`settings.json`)
Two PostToolUse hooks run automatically on every Edit/Write to `.ts`/`.tsx` files:
- **Biome auto-format** — runs `pnpm biome format --write` on the edited file
- **console.log warning** — greps for `console.log` and warns to use pino

### Rules (`rules/`)
Always-loaded context rules. No action needed — they're automatically in context.
- `typescript-conventions.md` — Biome, strict TS, pino, zod, conventional commits
- `api-design.md` — RESTful patterns, Hono route factories, error shape
- `workspace-security.md` — canUseTool, path validation, session persistence
- `testing-patterns.md` — Vitest, test utilities, conventions

### Skills (`skills/`)
Deep reference docs on Sketch subsystems. Loaded when relevant context is needed.
- `sketch-architecture` — bootstrap sequence, adapter pattern, prompt system, permissions
- `hono-patterns` — route factories, middleware, registration order
- `kysely-migrations` — static imports, three-file coordination, cross-dialect rules
- `adapter-pattern` — bot class, adapter wiring, handler flow, deps interface
- `claude-agent-sdk` — query() options, MCP tools, session resume, UploadCollector
- `react-tanstack` — TanStack Router/Query, shadcn/ui, API client, testing

### Commands (`commands/`)
Invoked via `/command-name` in Claude Code.
- `/quality` — runs biome check → typecheck → test → build (stops on first failure)
- `/plan` — creates/updates a plan document
- `/new-adapter` — scaffolds a new channel adapter (bot + adapter + handler)
- `/new-migration` — creates migration + updates schema.ts + updates migrate.ts
- `/tdd` — red-green-refactor workflow with Vitest
- `/update-state` — updates project state after completing work

### Agents (`agents/`)
Specialized subagents invoked via `@agent-name` in Claude Code.
- `@architect` (opus, read-only) — architecture review, design guidance for new subsystems
- `@code-reviewer` (sonnet) — convention checklist, runs biome + typecheck
- `@security-reviewer` (sonnet) — canUseTool audit, auth boundaries, data leakage
- `@adapter-builder` (sonnet) — guides new channel adapter implementation
- `@migration-writer` (sonnet) — generates migrations following static import pattern

### Guides (`guides/`)
Step-by-step walkthroughs referenced by skills and commands.
- `new-channel-adapter.md` — full checklist: bot → adapter → migration → bootstrap → prompt → API
- `database-migration.md` — three-file coordination walkthrough
- `adding-api-routes.md` — route → validate → register → API client → test
