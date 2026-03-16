# Guide: Adding a New Channel Adapter

## Step-by-Step

### 1. Create Platform Directory
```
packages/server/src/{platform}/
```

### 2. Create Bot Class (`bot.ts`)
- Wrap the platform's SDK/API
- Implement: constructor(config, logger), start(), stop()
- Add message sending methods: postMessage(), uploadFile()
- Add event handler registration: onMessage(), onMention()
- Reference: `slack/bot.ts`, `whatsapp/bot.ts`

### 3. Create Adapter (`adapter.ts`)
- Define `{Platform}AdapterDeps` interface (see `SlackAdapterDeps`)
- Wire event handlers onto the bot
- Each handler: resolve user → ensure workspace → enqueue → download files → runAgent → respond
- Reference: `slack/adapter.ts`, `whatsapp/adapter.ts`

### 4. Create Message Handler (`message-handler.ts`)
- Handle "thinking" indicator → first message update → subsequent messages
- Handle message chunking for platform limits
- Reference: `slack/message-handler.ts`

### 5. Create User Resolver (`resolve-user.ts`)
- Look up user by platform ID in DB
- Create new user if not found
- Reference: `slack/resolve-user.ts`

### 6. Create Migration (if needed)
- Auth credential storage (e.g., `whatsapp_creds`)
- Platform-specific metadata tables
- Follow the three-file pattern: migration + schema.ts + migrate.ts

### 7. Wire into Bootstrap (`bootstrap.ts`)
- Instantiate bot
- Build deps object
- Wire handlers (adapter function)
- Add lifecycle to shutdown sequence
- Add to `ServerHandle` interface

### 8. Add Platform Formatting (`agent/prompt.ts`)
- Add platform section to `buildSystemContext()`
- Define formatting rules (bold, italic, code, links)
- Add platform to `RunAgentParams.platform` type union

### 9. Add API Routes (if needed)
- Pairing/connection endpoints
- Status endpoints
- Register in `http.ts`

### 10. Add Web UI (if needed)
- Channel status card in channels page
- Connection/pairing flow UI

## Files Checklist
- [ ] `packages/server/src/{platform}/bot.ts`
- [ ] `packages/server/src/{platform}/adapter.ts`
- [ ] `packages/server/src/{platform}/message-handler.ts`
- [ ] `packages/server/src/{platform}/resolve-user.ts`
- [ ] `packages/server/src/db/migrations/NNN-{platform}-*.ts` (if needed)
- [ ] `packages/server/src/db/schema.ts` (if new tables)
- [ ] `packages/server/src/db/migrate.ts` (if new migration)
- [ ] `packages/server/src/bootstrap.ts`
- [ ] `packages/server/src/agent/prompt.ts`
- [ ] `packages/server/src/agent/runner.ts` (platform type)
- [ ] `packages/server/src/http.ts` (if API routes)
- [ ] `packages/server/src/api/{platform}.ts` (if API routes)
