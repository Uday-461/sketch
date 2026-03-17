/**
 * Core agent execution — invokes the Claude Agent SDK's query() in a user's
 * isolated workspace with file access restrictions via canUseTool.
 *
 * Skills support: the SDK discovers skills from ~/.claude/skills/ (org-wide via
 * "user" settingSource) and {workspace}/.claude/skills/ (per-user via "project").
 * canUseTool grants read-only file access and Bash execution for ~/.claude paths
 * so skills can be loaded and their companion CLIs executed.
 */
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { type SDKUserMessage, query } from "@anthropic-ai/claude-agent-sdk";
import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import type { Attachment } from "../files";
import { buildMultimodalContent, formatAttachmentsForPrompt, isImageAttachment } from "../files";
import type { Logger } from "../logger";
import type { TaskScheduler } from "../scheduler/service";
import type { Platform, TaskContext } from "../scheduler/types";
import { createCanUseTool } from "./permissions";
import { buildSystemContext } from "./prompt";
import { getSessionId, saveSessionId } from "./sessions";
import { UploadCollector, createSketchMcpServer } from "./sketch-tools";

export interface AgentResult {
  messageSent: boolean;
  sessionId: string;
  costUsd: number;
  pendingUploads: string[];
  runId: string;
  numTurns: number;
}

export interface McpServerConfig {
  type: "http";
  url: string;
  headers?: Record<string, string>;
}

export interface RunAgentParams {
  db: Kysely<DB>;
  workspaceKey: string;
  userMessage: string;
  workspaceDir: string;
  userName: string;
  userEmail?: string | null;
  userId?: string | null;
  logger: Logger;
  platform: Platform;
  onMessage: (text: string) => Promise<void>;
  attachments?: Attachment[];
  threadTs?: string;
  orgName?: string | null;
  botName?: string | null;
  channelContext?: {
    channelName: string;
  };
  groupContext?: {
    groupName: string;
    groupDescription?: string;
  };
  telegramGroupContext?: {
    groupName: string;
    groupDescription?: string;
  };
  discordChannelContext?: {
    channelName: string;
  };
  integrationMcpServers?: Record<string, McpServerConfig>;
  findIntegrationProvider?: () => Promise<{ type: string; credentials: string } | null>;
  /**
   * Controls session behaviour for scheduled tasks.
   * - "fresh": skip session resume and skip session save (fully ephemeral run)
   * - "persistent" or "chat": normal get+save behaviour (same as undefined)
   * When omitted, behaves exactly as before (always get + save).
   */
  sessionMode?: "fresh" | "persistent" | "chat";
  taskContext?: TaskContext;
  scheduler?: TaskScheduler;
}

/**
 * Extracts text content from an SDK assistant message. Returns null if the
 * message isn't an assistant message, has no text blocks, or text is only
 * whitespace. Multiple text blocks (rare) are concatenated with newlines.
 */
export function extractAssistantText(message: unknown): string | null {
  if (!message || typeof message !== "object") return null;
  const msg = message as Record<string, unknown>;
  if (msg.type !== "assistant") return null;

  const inner = msg.message as Record<string, unknown> | undefined;
  const content = inner?.content;
  if (!Array.isArray(content)) return null;

  const texts: string[] = [];
  for (const block of content) {
    if (block && typeof block === "object" && block.type === "text" && typeof block.text === "string") {
      texts.push(block.text);
    }
  }

  const joined = texts.join("\n");
  return joined.trim() ? joined : null;
}

export async function runAgent(params: RunAgentParams): Promise<AgentResult> {
  const { userMessage, workspaceDir, userName, logger } = params;
  const isFresh = params.sessionMode === "fresh";
  const existingSessionId = isFresh ? undefined : await getSessionId(params.db, params.workspaceKey, params.threadTs);
  const absWorkspace = resolve(workspaceDir);

  const systemAppend = buildSystemContext({
    platform: params.platform,
    userName,
    userEmail: params.userEmail,
    workspaceDir: absWorkspace,
    orgName: params.orgName,
    botName: params.botName,
    channelContext: params.channelContext,
    groupContext: params.groupContext,
    telegramGroupContext: params.telegramGroupContext,
    discordChannelContext: params.discordChannelContext,
  });

  let sessionId = "";
  let messageSent = false;
  let costUsd = 0;

  const attachments = params.attachments ?? [];
  const hasImages = attachments.some((a) => isImageAttachment(a));

  let prompt: string | AsyncIterable<SDKUserMessage>;

  const { images, nonImages } = hasImages
    ? { images: attachments.filter(isImageAttachment), nonImages: attachments.filter((a) => !isImageAttachment(a)) }
    : { images: [], nonImages: attachments };
  logger.debug(
    {
      totalAttachments: attachments.length,
      imageCount: images.length,
      nonImageCount: nonImages.length,
      images: images.map((a) => ({ name: a.originalName, mime: a.mimeType })),
      promptMode: hasImages ? "multimodal" : "text",
    },
    "Prompt mode selected",
  );

  if (hasImages) {
    const content = await buildMultimodalContent(userMessage, attachments);
    prompt = (async function* () {
      yield {
        type: "user" as const,
        session_id: "",
        message: { role: "user" as const, content },
        parent_tool_use_id: null,
      };
    })();
  } else {
    prompt = userMessage + formatAttachmentsForPrompt(attachments);
  }

  const uploadCollector = new UploadCollector();
  const sketchServer = createSketchMcpServer({
    uploadCollector,
    workspaceDir: absWorkspace,
    findIntegrationProvider: params.findIntegrationProvider,
    taskContext: params.taskContext,
    scheduler: params.scheduler,
  });

  const run = query({
    prompt,
    options: {
      maxTurns: 100,
      cwd: workspaceDir,
      resume: existingSessionId,
      systemPrompt: {
        type: "preset" as const,
        preset: "claude_code" as const,
        append: systemAppend,
      },
      permissionMode: "default" as const,
      allowDangerouslySkipPermissions: false,
      settingSources: ["project", "user"],
      mcpServers: { sketch: sketchServer, ...params.integrationMcpServers },
      stderr: (data) => {
        logger.debug({ stderr: data.trim() }, "Agent subprocess");
      },
      canUseTool: createCanUseTool(absWorkspace, logger),
    },
  });

  const runId = randomUUID();
  let model: string | null = null;
  let toolsUsed: string[] = [];
  const transcript: Array<{ role: string; content: unknown; usage?: unknown }> = [
    { role: "user", content: params.userMessage },
  ];
  let resultMessage: Record<string, unknown> | null = null;

  for await (const message of run) {
    if (message.type === "system" && message.subtype === "init") {
      sessionId = message.session_id;
      const initMsg = message as Record<string, unknown>;
      model = (initMsg.model as string) ?? null;
      toolsUsed = (initMsg.tools as string[]) ?? [];
    }

    if (message.type === "assistant") {
      const assistantMsg = message as Record<string, unknown>;
      const inner = assistantMsg.message as Record<string, unknown> | undefined;
      transcript.push({
        role: "assistant",
        content: inner?.content,
        usage: inner?.usage,
      });
    }

    if (message.type === "user") {
      const userMsg = message as Record<string, unknown>;
      transcript.push({
        role: "user",
        content: userMsg.message,
      });
    }

    const text = extractAssistantText(message);
    if (text) {
      try {
        await params.onMessage(text);
        messageSent = true;
      } catch (err) {
        logger.warn({ err }, "Failed to deliver assistant message");
      }
    }

    if (message.type === "result") {
      sessionId = message.session_id;
      costUsd = message.total_cost_usd;
      resultMessage = message as unknown as Record<string, unknown>;
    }
  }

  if (sessionId && !isFresh) {
    await saveSessionId(params.db, params.workspaceKey, sessionId, params.threadTs);
  }

  const pendingUploads = uploadCollector.drain();
  const numTurns = (resultMessage?.num_turns as number) ?? 0;
  logger.info({ userId: userName, sessionId, costUsd, pendingUploads: pendingUploads.length }, "Agent run completed");

  if (resultMessage) {
    const isError = resultMessage.subtype !== "success";
    const usage = (resultMessage.usage as Record<string, number>) ?? {};

    saveAgentRun(params.db, {
      run: {
        id: runId,
        user_id: params.userId ?? null,
        workspace_key: params.workspaceKey,
        thread_key: params.threadTs ?? "",
        platform: params.platform,
        session_id: sessionId,
        model,
        cost_usd: costUsd,
        input_tokens: usage.input_tokens ?? null,
        output_tokens: usage.output_tokens ?? null,
        cache_read_tokens: usage.cache_read_input_tokens ?? null,
        cache_creation_tokens: usage.cache_creation_input_tokens ?? null,
        duration_ms: (resultMessage.duration_ms as number) ?? null,
        duration_api_ms: (resultMessage.duration_api_ms as number) ?? null,
        num_turns: numTurns,
        status: isError ? "error" : "success",
        error_type: isError ? (resultMessage.subtype as string) : null,
        errors_json: isError && "errors" in resultMessage ? JSON.stringify(resultMessage.errors) : null,
        tools_used_json: toolsUsed.length > 0 ? JSON.stringify(toolsUsed) : null,
        permission_denials_json:
          Array.isArray(resultMessage.permission_denials) && resultMessage.permission_denials.length > 0
            ? JSON.stringify(resultMessage.permission_denials)
            : null,
      },
      transcript,
    }).catch((err) => {
      logger.warn({ err }, "Failed to log agent run");
    });
  }

  return { messageSent, sessionId, costUsd, pendingUploads, runId, numTurns };
}

async function saveAgentRun(
  db: Kysely<DB>,
  data: {
    run: {
      id: string;
      user_id: string | null;
      workspace_key: string;
      thread_key: string;
      platform: string;
      session_id: string;
      model: string | null;
      cost_usd: number;
      input_tokens: number | null;
      output_tokens: number | null;
      cache_read_tokens: number | null;
      cache_creation_tokens: number | null;
      duration_ms: number | null;
      duration_api_ms: number | null;
      num_turns: number;
      status: string;
      error_type: string | null;
      errors_json: string | null;
      tools_used_json: string | null;
      permission_denials_json: string | null;
    };
    transcript: Array<{ role: string; content: unknown; usage?: unknown }>;
  },
): Promise<void> {
  const { createAgentRunRepository } = await import("../db/repositories/agent-runs");
  const repo = createAgentRunRepository(db);

  await repo.insertRun(data.run);

  const messages = data.transcript.map((entry, index) => {
    let toolUseId: string | null = null;
    let toolName: string | null = null;

    if (entry.role === "assistant" && Array.isArray(entry.content)) {
      const toolBlock = (entry.content as Array<Record<string, unknown>>).find((b) => b.type === "tool_use");
      if (toolBlock) {
        toolUseId = (toolBlock.id as string) ?? null;
        toolName = (toolBlock.name as string) ?? null;
      }
    }

    return {
      id: randomUUID(),
      run_id: data.run.id,
      sequence: index,
      role: entry.role,
      content_json: JSON.stringify(entry.content),
      tool_use_id: toolUseId,
      tool_name: toolName,
      input_tokens: (entry.usage as Record<string, number> | undefined)?.input_tokens ?? null,
      output_tokens: (entry.usage as Record<string, number> | undefined)?.output_tokens ?? null,
    };
  });

  await repo.insertMessages(messages);
}
