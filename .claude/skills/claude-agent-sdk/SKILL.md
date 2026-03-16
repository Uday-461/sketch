# Claude Agent SDK Usage

## Core: `query()`
The main entry point for running an agent session:

```ts
import { query } from "@anthropic-ai/claude-agent-sdk";

const run = query({
  prompt,
  options: {
    maxTurns: 100,
    cwd: workspaceDir,
    resume: existingSessionId,
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: systemAppend,
    },
    permissionMode: "default",
    allowDangerouslySkipPermissions: false,
    settingSources: ["project", "user"],
    mcpServers: { sketch: sketchServer, ...integrationServers },
    canUseTool: createCanUseTool(absWorkspace, logger),
    stderr: (data) => logger.debug({ stderr: data.trim() }, "Agent subprocess"),
  },
});
```

## Message Stream Processing
```ts
for await (const message of run) {
  if (message.type === "system" && message.subtype === "init") {
    sessionId = message.session_id;
  }
  const text = extractAssistantText(message);
  if (text) await onMessage(text);
  if (message.type === "result") {
    sessionId = message.session_id;
    costUsd = message.total_cost_usd;
  }
}
```

## Multimodal Input (`SDKUserMessage`)
For image attachments, use an async iterable of `SDKUserMessage`:
```ts
prompt = (async function* () {
  yield {
    type: "user",
    session_id: "",
    message: { role: "user", content: multimodalContent },
    parent_tool_use_id: null,
  };
})();
```

## Session Resume
- Pass `resume: existingSessionId` to continue a previous conversation
- System prompt content does NOT survive resume — put persistent context in user messages
- Session IDs saved to `chat_sessions` DB table via `saveSessionId()`

## Custom MCP Tools (`createSdkMcpServer`)
```ts
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";

const server = createSdkMcpServer({
  name: "sketch",
  tools: [
    tool("ToolName", "description", zodSchema, async (params) => {
      return { content: [{ type: "text", text: "result" }] };
    }),
  ],
});
```

## UploadCollector
Collects file paths during agent execution for post-run upload to chat:
- `collect(filePath)` — called by SendFileToChat tool
- `drain()` — returns all collected paths and resets

## Reference Files
- `packages/server/src/agent/runner.ts`
- `packages/server/src/agent/sketch-tools.ts`
- `packages/server/src/agent/sessions.ts`
