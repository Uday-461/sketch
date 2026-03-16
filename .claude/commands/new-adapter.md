Scaffold a new channel adapter for a messaging platform.

Ask the user for the platform name if not provided: $ARGUMENTS

1. Read the existing adapter implementations for reference:
   - `packages/server/src/slack/adapter.ts` — SlackAdapterDeps and handler wiring
   - `packages/server/src/slack/bot.ts` — SlackBot class
   - `packages/server/src/whatsapp/adapter.ts` — WhatsAppAdapterDeps and handler wiring
   - `packages/server/src/whatsapp/bot.ts` — WhatsAppBot class

2. Create the platform directory at `packages/server/src/{platform}/`

3. Create `bot.ts` — platform SDK wrapper class with:
   - Constructor taking config + logger
   - `start()` / `stop()` lifecycle methods
   - Message sending methods
   - Event handler registration (onMessage, onMention, etc.)

4. Create `adapter.ts` — handler wiring with:
   - `{Platform}AdapterDeps` interface matching the pattern from existing adapters
   - Handler functions following the flow: receive → resolve user → ensure workspace → enqueue → runAgent → respond
   - File attachment download pipeline

5. List the bootstrap wiring points that need updating:
   - `bootstrap.ts` — instantiate bot, wire handlers, add to ServerHandle
   - `http.ts` — add API routes if needed
   - `agent/runner.ts` — add platform to RunAgentParams type if needed
   - `agent/prompt.ts` — add platform formatting rules

6. Note any migrations needed (e.g., new auth credential storage).
