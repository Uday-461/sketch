import { basename, join } from "node:path";
import type { Kysely } from "kysely";
import type { BufferedMessage } from "../agent/prompt";
import { formatBufferedContext } from "../agent/prompt";
import type { AgentResult, McpServerConfig, RunAgentParams } from "../agent/runner";
import { ensureDiscordChannelWorkspace, ensureWorkspace } from "../agent/workspace";
import type { Config } from "../config";
import type { createSettingsRepository } from "../db/repositories/settings";
import type { createUserRepository } from "../db/repositories/users";
import type { DB } from "../db/schema";
import type { Attachment } from "../files";
import { downloadDiscordAttachment } from "../files";
import type { Logger } from "../logger";
import type { QueueManager } from "../queue";
import type { TaskScheduler } from "../scheduler/service";
import type { GroupBuffer } from "../whatsapp/group-buffer";
import type { DiscordBot, DiscordFile } from "./bot";
import { createDiscordMessageHandler } from "./message-handler";

type UserRepository = ReturnType<typeof createUserRepository>;
type SettingsRepository = ReturnType<typeof createSettingsRepository>;

export interface DiscordAdapterDeps {
  db: Kysely<DB>;
  config: Config;
  logger: Logger;
  repos: {
    users: UserRepository;
    settings: SettingsRepository;
  };
  queue: QueueManager;
  groupBuffer: GroupBuffer;
  runAgent: (params: RunAgentParams) => Promise<AgentResult>;
  buildMcpServers: (email: string | null) => Promise<Record<string, McpServerConfig>>;
  findIntegrationProvider: () => Promise<{ type: string; credentials: string } | null>;
  scheduler?: TaskScheduler;
}

async function downloadDiscordFiles(
  files: DiscordFile[],
  attachDir: string,
  maxBytes: number,
  logger: Logger,
): Promise<Attachment[]> {
  const attachments: Attachment[] = [];
  for (const file of files) {
    try {
      const downloaded = await downloadDiscordAttachment(
        file.url,
        file.name,
        file.contentType,
        attachDir,
        maxBytes,
        logger,
      );
      attachments.push(downloaded);
    } catch (err) {
      logger.warn({ err, fileName: file.name }, "Failed to download Discord attachment");
    }
  }
  return attachments;
}

export function wireDiscordHandlers(discord: DiscordBot, deps: DiscordAdapterDeps): void {
  const {
    db,
    config,
    logger,
    repos,
    queue,
    groupBuffer,
    runAgent,
    buildMcpServers,
    findIntegrationProvider,
    scheduler,
  } = deps;

  const maxFileBytes = config.MAX_FILE_SIZE_MB * 1024 * 1024;

  discord.onMessage(async (message) => {
    if (message.type === "dm") {
      const user = await repos.users.findByDiscordId(message.senderId);
      if (!user) {
        await discord.sendText(
          message.channelId,
          "Sorry, you're not authorized to use this bot. Contact your admin to get access.",
        );
        return;
      }

      const userQueue = queue.getQueue(user.id);

      userQueue.enqueue(async () => {
        const workspaceDir = await ensureWorkspace(config, user.id);
        const settingsRow = await repos.settings.get();

        const typingInterval = setInterval(() => discord.sendTyping(message.channelId), 5000);
        await discord.sendTyping(message.channelId);

        try {
          let attachments: Attachment[] = [];
          if (message.files?.length) {
            const attachDir = join(workspaceDir, "attachments");
            attachments = await downloadDiscordFiles(message.files, attachDir, maxFileBytes, logger);
          }

          const onMessage = createDiscordMessageHandler(discord, message.channelId);
          const integrationMcpServers = await buildMcpServers(user.email);

          const result = await runAgent({
            db,
            workspaceKey: user.id,
            userMessage: message.text || "See attached files.",
            workspaceDir,
            userName: user.name,
            userEmail: user.email,
            userId: user.id,
            logger,
            platform: "discord",
            onMessage,
            orgName: settingsRow?.org_name,
            botName: settingsRow?.bot_name,
            attachments: attachments.length > 0 ? attachments : undefined,
            integrationMcpServers,
            findIntegrationProvider,
            taskContext: {
              platform: "discord" as const,
              contextType: "dm" as const,
              deliveryTarget: message.channelId,
              createdBy: user.id,
            },
            scheduler,
          });

          for (const filePath of result.pendingUploads) {
            try {
              if (discord.isConnected) {
                await discord.sendFile(message.channelId, filePath, basename(filePath));
              }
            } catch (err) {
              logger.warn({ err, filePath }, "Failed to send file via Discord");
            }
          }
        } catch (err) {
          logger.error({ err, userId: user.id }, "Agent run failed (Discord)");
          if (discord.isConnected) {
            await discord.sendText(message.channelId, "Something went wrong, try again.");
          }
        } finally {
          clearInterval(typingInterval);
        }
      });
      return;
    }

    // --- Guild channel handler ---

    if (!message.isMentioned) {
      const user = await repos.users.findByDiscordId(message.senderId);
      const bufferKey = `discord-${message.guildId}-${message.channelId}`;
      groupBuffer.append(bufferKey, {
        senderName: user?.name ?? message.senderName,
        text: message.text,
        timestamp: Date.now(),
      });
      return;
    }

    const user = await repos.users.findByDiscordId(message.senderId);
    const userName = user?.name ?? message.senderName;
    const guildId = message.guildId ?? "unknown";
    const queueKey = `discord-${guildId}-${message.channelId}`;
    const groupQueue = queue.getQueue(queueKey);

    groupQueue.enqueue(async () => {
      const workspaceDir = await ensureDiscordChannelWorkspace(config, guildId, message.channelId);
      const settingsRow = await repos.settings.get();

      const typingInterval = setInterval(() => discord.sendTyping(message.channelId), 5000);
      await discord.sendTyping(message.channelId);

      try {
        let attachments: Attachment[] = [];
        if (message.files?.length) {
          const attachDir = join(workspaceDir, "attachments");
          attachments = await downloadDiscordFiles(message.files, attachDir, maxFileBytes, logger);
        }

        const bufferKey = `discord-${guildId}-${message.channelId}`;
        const buffered = groupBuffer.drain(bufferKey);
        const contextMessages: BufferedMessage[] = buffered.map((m) => ({
          userName: m.senderName,
          text: m.text,
          ts: String(m.timestamp),
        }));

        const userMessage = formatBufferedContext(
          contextMessages,
          userName,
          message.text || "See attached files.",
          undefined,
          user?.email ?? null,
        );

        const onMessage = createDiscordMessageHandler(discord, message.channelId, message.messageId);
        const integrationMcpServers = await buildMcpServers(user?.email ?? null);

        const channelName = (await discord.getChannelName(message.channelId)) ?? message.channelId;

        const result = await runAgent({
          db,
          workspaceKey: `discord-${guildId}-${message.channelId}`,
          userMessage,
          workspaceDir,
          userName,
          userEmail: user?.email,
          userId: user?.id ?? null,
          logger,
          platform: "discord",
          onMessage,
          orgName: settingsRow?.org_name,
          botName: settingsRow?.bot_name,
          attachments: attachments.length > 0 ? attachments : undefined,
          discordChannelContext: { channelName },
          integrationMcpServers,
          findIntegrationProvider,
          taskContext: {
            platform: "discord" as const,
            contextType: "channel" as const,
            deliveryTarget: message.channelId,
            createdBy: user?.id ?? "unknown",
          },
          scheduler,
        });

        for (const filePath of result.pendingUploads) {
          try {
            if (discord.isConnected) {
              await discord.sendFile(message.channelId, filePath, basename(filePath));
            }
          } catch (err) {
            logger.warn({ err, filePath }, "Failed to send file via Discord");
          }
        }
      } catch (err) {
        logger.error({ err, channelId: message.channelId }, "Agent run failed (Discord channel)");
        if (discord.isConnected) {
          await discord.sendText(message.channelId, "Something went wrong, try again.");
        }
      } finally {
        clearInterval(typingInterval);
      }
    });
  });
}
