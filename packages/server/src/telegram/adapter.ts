import { basename, join } from "node:path";
import type { Kysely } from "kysely";
import type { BufferedMessage } from "../agent/prompt";
import { formatBufferedContext } from "../agent/prompt";
import type { AgentResult, McpServerConfig, RunAgentParams } from "../agent/runner";
import { ensureTelegramGroupWorkspace, ensureWorkspace } from "../agent/workspace";
import type { Config } from "../config";
import type { createSettingsRepository } from "../db/repositories/settings";
import type { createUserRepository } from "../db/repositories/users";
import type { DB } from "../db/schema";
import type { Attachment } from "../files";
import { downloadTelegramFile } from "../files";
import type { Logger } from "../logger";
import type { QueueManager } from "../queue";
import type { TaskScheduler } from "../scheduler/service";
import type { GroupBuffer } from "../whatsapp/group-buffer";
import type { TelegramBot, TelegramFile } from "./bot";
import { createTelegramMessageHandler } from "./message-handler";

type UserRepository = ReturnType<typeof createUserRepository>;
type SettingsRepository = ReturnType<typeof createSettingsRepository>;

export interface TelegramAdapterDeps {
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

async function downloadTelegramFiles(
  files: TelegramFile[],
  botToken: string,
  attachDir: string,
  maxBytes: number,
  logger: Logger,
): Promise<Attachment[]> {
  const attachments: Attachment[] = [];
  for (const file of files) {
    try {
      if (!file.filePath) {
        logger.warn({ fileName: file.fileName }, "Telegram file has no file_path — skipping");
        continue;
      }
      const downloaded = await downloadTelegramFile(file.filePath, botToken, attachDir, maxBytes, logger);
      attachments.push(downloaded);
    } catch (err) {
      logger.warn({ err, fileName: file.fileName }, "Failed to download Telegram file");
    }
  }
  return attachments;
}

export function wireTelegramHandlers(telegram: TelegramBot, deps: TelegramAdapterDeps): void {
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

  telegram.onMessage(async (message) => {
    if (message.type === "dm") {
      const user = await repos.users.findByTelegramId(message.senderId);
      if (!user) {
        logger.info({ telegramUserId: message.senderId }, "Unauthorized Telegram DM — user not found");
        await telegram.sendText(
          message.chatId,
          "Sorry, you're not authorized to use this bot. Contact your admin to get access.",
        );
        return;
      }

      const userQueue = queue.getQueue(user.id);

      userQueue.enqueue(async () => {
        const workspaceDir = await ensureWorkspace(config, user.id);
        const settingsRow = await repos.settings.get();

        const typingInterval = setInterval(() => telegram.sendTyping(message.chatId), 5000);
        await telegram.sendTyping(message.chatId);

        try {
          let attachments: Attachment[] = [];
          if (message.files?.length) {
            const attachDir = join(workspaceDir, "attachments");
            attachments = await downloadTelegramFiles(
              message.files,
              telegram.botToken,
              attachDir,
              maxFileBytes,
              logger,
            );
          }

          const onMessage = createTelegramMessageHandler(telegram, message.chatId);
          const integrationMcpServers = await buildMcpServers(user.email);

          const result = await runAgent({
            db,
            workspaceKey: user.id,
            userMessage: message.text || "See attached files.",
            workspaceDir,
            userName: user.name,
            userEmail: user.email,
            logger,
            platform: "telegram",
            onMessage,
            orgName: settingsRow?.org_name,
            botName: settingsRow?.bot_name,
            attachments: attachments.length > 0 ? attachments : undefined,
            integrationMcpServers,
            findIntegrationProvider,
            taskContext: {
              platform: "telegram" as const,
              contextType: "dm" as const,
              deliveryTarget: message.chatId,
              createdBy: user.id,
            },
            scheduler,
          });

          for (const filePath of result.pendingUploads) {
            try {
              if (telegram.isConnected) {
                await telegram.sendFile(message.chatId, filePath, basename(filePath));
              }
            } catch (err) {
              logger.warn({ err, filePath }, "Failed to send file via Telegram");
            }
          }
        } catch (err) {
          logger.error({ err, userId: user.id }, "Agent run failed (Telegram)");
          if (telegram.isConnected) {
            await telegram.sendText(message.chatId, "Something went wrong, try again.");
          }
        } finally {
          clearInterval(typingInterval);
        }
      });
      return;
    }

    // --- Group handler ---

    if (!message.isMentioned) {
      const user = await repos.users.findByTelegramId(message.senderId);
      groupBuffer.append(message.chatId, {
        senderName: user?.name ?? message.senderName,
        text: message.text,
        timestamp: Date.now(),
      });
      return;
    }

    const user = await repos.users.findByTelegramId(message.senderId);
    const userName = user?.name ?? message.senderName;
    const groupQueue = queue.getQueue(`tg-group-${message.chatId}`);

    groupQueue.enqueue(async () => {
      const workspaceDir = await ensureTelegramGroupWorkspace(config, message.chatId);
      const settingsRow = await repos.settings.get();
      const chatInfo = await telegram.getChatInfo(message.chatId);
      const groupName = chatInfo.title ?? "Telegram Group";
      const groupDescription = chatInfo.description;

      const typingInterval = setInterval(() => telegram.sendTyping(message.chatId), 5000);
      await telegram.sendTyping(message.chatId);

      try {
        let attachments: Attachment[] = [];
        if (message.files?.length) {
          const attachDir = join(workspaceDir, "attachments");
          attachments = await downloadTelegramFiles(message.files, telegram.botToken, attachDir, maxFileBytes, logger);
        }

        const buffered = groupBuffer.drain(message.chatId);
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

        const onMessage = createTelegramMessageHandler(telegram, message.chatId, message.messageId);
        const integrationMcpServers = await buildMcpServers(user?.email ?? null);

        const result = await runAgent({
          db,
          workspaceKey: `tg-group-${message.chatId}`,
          userMessage,
          workspaceDir,
          userName,
          userEmail: user?.email,
          logger,
          platform: "telegram",
          onMessage,
          orgName: settingsRow?.org_name,
          botName: settingsRow?.bot_name,
          attachments: attachments.length > 0 ? attachments : undefined,
          telegramGroupContext: { groupName, groupDescription },
          integrationMcpServers,
          findIntegrationProvider,
          taskContext: {
            platform: "telegram" as const,
            contextType: "group" as const,
            deliveryTarget: message.chatId,
            createdBy: user?.id ?? "unknown",
          },
          scheduler,
        });

        for (const filePath of result.pendingUploads) {
          try {
            if (telegram.isConnected) {
              await telegram.sendFile(message.chatId, filePath, basename(filePath));
            }
          } catch (err) {
            logger.warn({ err, filePath }, "Failed to send file via Telegram");
          }
        }
      } catch (err) {
        logger.error({ err, chatId: message.chatId }, "Agent run failed (Telegram group)");
        if (telegram.isConnected) {
          await telegram.sendText(message.chatId, "Something went wrong, try again.");
        }
      } finally {
        clearInterval(typingInterval);
      }
    });
  });
}
