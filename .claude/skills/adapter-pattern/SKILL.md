# Channel Adapter Pattern

## Structure
Each platform channel has two core files:
- **`{platform}/bot.ts`** — wraps the platform SDK (connect, send, receive, lifecycle)
- **`{platform}/adapter.ts`** — wires event handlers onto the bot with a deps interface

## Bot Class
The bot encapsulates platform-specific API calls:
- Connection management (start/stop)
- Message sending (text, files, reactions)
- User/channel info lookups
- Event callbacks: `onMessage`, `onThreadMessage`, `onChannelMention` (Slack) or `onDm`, `onGroupMention` (WhatsApp)

## Adapter Deps Interface
```ts
export interface PlatformAdapterDeps {
  db: Kysely<DB>;
  config: Config;
  logger: Logger;
  repos: { users: UserRepository; channels?: ChannelRepository; settings: SettingsRepository };
  queue: QueueManager;
  runAgent: (params: RunAgentParams) => Promise<AgentResult>;
  buildMcpServers: (email: string | null) => Promise<Record<string, McpServerConfig>>;
  findIntegrationProvider: () => Promise<{ type: string; credentials: string } | null>;
  scheduler?: TaskScheduler;
}
```

## Handler Flow
1. **Receive** — platform event fires (message, mention)
2. **Resolve user** — look up or create user in DB from platform ID
3. **Ensure workspace** — create workspace directory if needed
4. **Enqueue** — add to per-channel/user queue for sequential processing
5. **Download attachments** — fetch any files from platform
6. **Run agent** — call `runAgent()` with workspace, user, message, MCP servers
7. **Respond** — send agent response back via bot, upload any pending files

## Thread/Group Buffer Pattern
For shared contexts (channels, groups), messages between @mentions are buffered:
- `ThreadBuffer` (Slack) / `GroupBuffer` (WhatsApp)
- First mention bootstraps with channel/thread history
- Subsequent mentions drain the buffer and format with `formatBufferedContext()`

## Bootstrap Wiring (`bootstrap.ts`)
- Build deps object with all repositories, queue, runAgent, etc.
- For Slack: `createConfiguredSlackBot(tokens, deps)` via startup manager
- For WhatsApp: `wireWhatsAppHandlers(whatsapp, deps)`
- Bot instances stored in closure, exposed via `ServerHandle`

## Reference Files
- `packages/server/src/slack/adapter.ts`
- `packages/server/src/slack/bot.ts`
- `packages/server/src/whatsapp/adapter.ts`
- `packages/server/src/whatsapp/bot.ts`
- `packages/server/src/bootstrap.ts`
