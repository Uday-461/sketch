# Sketch Architecture

## Bootstrap Sequence (`bootstrap.ts`)
1. Logger — `createLogger(config)`
2. Database — `createDatabase(config)` + `runMigrations(db)`
3. Sync featured skills
4. Repositories — `createUserRepository`, `createChannelRepository`, `createSettingsRepository`, `createMcpServerRepository`, `createWhatsAppGroupRepository`
5. LLM env from DB — `applyLlmEnvFromSettings(settingsRow, logger)`
6. Shared helpers — `buildMcpServers(userEmail)` builds MCP config for all registered servers
7. Queue manager — `new QueueManager()` for per-channel message isolation
8. Platform adapters — Slack (`createConfiguredSlackBot`), WhatsApp (`wireWhatsAppHandlers`)
9. Task scheduler — `new TaskScheduler(deps)` + `scheduler.start()`
10. HTTP server — `createApp(db, config, deps)` + `serve()`
11. Platform connections — `whatsapp.start()`, Slack startup manager

## Adapter Pattern
- Bot class wraps platform SDK: connect, send, receive, lifecycle
- Adapter function wires handlers onto bot with a `Deps` interface
- Deps: `{ db, config, logger, repos, queue, runAgent, buildMcpServers, findIntegrationProvider, scheduler }`
- See `slack/adapter.ts` (`SlackAdapterDeps`) and `whatsapp/adapter.ts` (`WhatsAppAdapterDeps`)

## Agent Runtime (`runner.ts`)
- `runAgent(params)` calls Claude Agent SDK `query()` with workspace isolation
- `permissionMode: "default"`, `canUseTool` from `permissions.ts`
- `systemPrompt: { type: "preset", preset: "claude_code", append: systemAppend }`
- `settingSources: ["project", "user"]` — discovers skills from workspace and `~/.claude`
- MCP servers: sketch server (custom tools) + integration servers from DB

## Three-Layer Prompt
1. Claude Code preset (built-in)
2. Workspace `CLAUDE.md` (per-user memory, auto-loaded by SDK)
3. `systemPrompt.append` via `buildSystemContext()` — platform formatting, identity, workspace isolation rules

## Permission Model (`permissions.ts`)
- `PERMITTED_TOOLS` allowlist + `mcp__` prefix auto-allow
- File path validation: `resolve()` + `startsWith(absWorkspace)`
- Bash validation: regex for absolute paths outside workspace
- Read-only access to `~/.claude` for skills

## Session Persistence (`sessions.ts`)
- `chat_sessions` DB table with `workspace_key` + `thread_key`
- DMs: workspace-level (thread_key = '')
- Channels: per-thread (thread_key = threadTs)
- Session resume via `existingSessionId` in `query()`

## MCP Server Registration (`sketch-tools.ts`)
- `createSketchMcpServer()` provides: `SendFileToChat`, `getProviderConfig`, `ManageScheduledTasks`
- Integration MCP servers built from DB rows via `buildMcpConfig()`
- All servers passed to `query({ mcpServers: { sketch, ...integrationServers } })`

## Settings-from-DB Pattern (`llm-env.ts`)
- LLM provider config stored in `settings` table
- `applyLlmEnvFromSettings()` sets env vars (`ANTHROPIC_API_KEY`, `CLAUDE_CODE_USE_BEDROCK`, etc.)
- Called at startup and whenever LLM settings are updated via API

## Reference Files
- `packages/server/src/bootstrap.ts`
- `packages/server/src/agent/runner.ts`
- `packages/server/src/agent/permissions.ts`
- `packages/server/src/agent/prompt.ts`
- `packages/server/src/agent/sessions.ts`
- `packages/server/src/agent/sketch-tools.ts`
