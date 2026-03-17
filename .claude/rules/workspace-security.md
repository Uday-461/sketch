# Workspace Security

## Permission Model
- `permissionMode: "default"` must never change
- `allowedTools` must never be set (it bypasses `canUseTool`)
- `allowDangerouslySkipPermissions` must always be `false`
- All tool calls go through `canUseTool` in `permissions.ts`

## Tool Allowlist
- New tools must be added to `PERMITTED_TOOLS` in `permissions.ts`
- MCP tools (prefixed `mcp__`) are auto-allowed — they come from servers we configure
- Built-in file tools: Read, Edit, Write, Glob, Grep
- Other permitted: Bash, WebSearch, WebFetch, Skill

## File Path Validation
- File tools must validate paths against `absWorkspace` via `resolve()` + `startsWith()`
- Read-only access granted to `~/.claude` for skills loading
- Never expose workspace paths in error messages to end users

## Bash Validation
- Commands blocked if they reference absolute paths outside workspace or `~/.claude`
- Regex check: `/(?:^|\s)\/(?!data\/|dev\/null|tmp\/)/`

## Workspace Directories
- Per-user DM: `data/workspaces/{user_id}/`
- Per-channel: `data/workspaces/channel-{channelId}/`
- Per-group (WhatsApp): `data/workspaces/wa-group-{jid}/`
- Per-group (Telegram): `data/workspaces/tg-group-{chatId}/`
- Per-channel (Discord): `data/workspaces/discord-{guildId}-{channelId}/`

## Session Persistence
- Session IDs stored in `chat_sessions` DB table (not filesystem)
- Workspace key + thread key (empty string sentinel for "no thread")
- UNIQUE constraint works across SQLite and Postgres

## Logging Security
- Never log message content (user privacy)
- Never log secrets, tokens, or API keys
- Log structured metadata only: `{ userId, channelId, sessionId }`
