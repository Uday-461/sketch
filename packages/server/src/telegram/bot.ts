import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { Bot, type Context, InputFile } from "grammy";
import { chunkText } from "../formatting/chunking";
import type { Logger } from "../logger";

const TELEGRAM_TEXT_LIMIT = 4096;

export interface TelegramFile {
  filePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

export interface TelegramMessage {
  type: "dm" | "group";
  text: string;
  chatId: string;
  messageId: number;
  senderName: string;
  senderId: string;
  isMentioned: boolean;
  files?: TelegramFile[];
}

export type TelegramMessageHandler = (message: TelegramMessage) => Promise<void>;

export interface TelegramBotConfig {
  token: string;
  logger: Logger;
}

export class TelegramBot {
  private bot: Bot;
  private logger: Logger;
  private handler: TelegramMessageHandler | null = null;
  private started = false;
  private botUsername = "";

  constructor(config: TelegramBotConfig) {
    this.bot = new Bot(config.token);
    this.logger = config.logger;
  }

  onMessage(handler: TelegramMessageHandler): void {
    this.handler = handler;
  }

  async start(): Promise<void> {
    const me = await this.bot.api.getMe();
    this.botUsername = me.username ?? "";
    this.logger.info({ username: this.botUsername }, "Telegram bot authenticated");

    this.bot.on("message", async (ctx: Context) => {
      if (!ctx.message || !ctx.from || ctx.from.is_bot) return;

      const chatType = ctx.chat?.type;
      const isPrivate = chatType === "private";
      const isGroup = chatType === "group" || chatType === "supergroup";
      if (!isPrivate && !isGroup) return;

      const chatId = String(ctx.chat?.id);
      const senderId = String(ctx.from.id);
      const senderName =
        [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ") || ctx.from.username || "Unknown";

      const text = ctx.message.text ?? ctx.message.caption ?? "";

      // Detect media and build file metadata
      const files: TelegramFile[] = [];
      const msg = ctx.message;
      try {
        if (msg.photo && msg.photo.length > 0) {
          const largest = msg.photo[msg.photo.length - 1];
          const fileInfo = await ctx.getFile();
          files.push({
            filePath: fileInfo.file_path ?? "",
            fileName: "photo.jpg",
            mimeType: "image/jpeg",
            fileSize: largest.file_size ?? 0,
          });
        } else if (msg.document) {
          const fileInfo = await ctx.getFile();
          files.push({
            filePath: fileInfo.file_path ?? "",
            fileName: msg.document.file_name ?? "document",
            mimeType: msg.document.mime_type ?? "application/octet-stream",
            fileSize: msg.document.file_size ?? 0,
          });
        } else if (msg.video) {
          const fileInfo = await ctx.getFile();
          files.push({
            filePath: fileInfo.file_path ?? "",
            fileName: msg.video.file_name ?? "video.mp4",
            mimeType: "video/mp4",
            fileSize: msg.video.file_size ?? 0,
          });
        } else if (msg.audio) {
          const fileInfo = await ctx.getFile();
          files.push({
            filePath: fileInfo.file_path ?? "",
            fileName: msg.audio.file_name ?? "audio.mp3",
            mimeType: msg.audio.mime_type ?? "audio/mpeg",
            fileSize: msg.audio.file_size ?? 0,
          });
        } else if (msg.voice) {
          const fileInfo = await ctx.getFile();
          files.push({
            filePath: fileInfo.file_path ?? "",
            fileName: "voice.ogg",
            mimeType: "audio/ogg",
            fileSize: msg.voice.file_size ?? 0,
          });
        } else if (msg.sticker) {
          const fileInfo = await ctx.getFile();
          const isVideo = msg.sticker.is_video ?? false;
          files.push({
            filePath: fileInfo.file_path ?? "",
            fileName: isVideo ? "sticker.webm" : "sticker.webp",
            mimeType: isVideo ? "video/webm" : "image/webp",
            fileSize: msg.sticker.file_size ?? 0,
          });
        }
      } catch (err) {
        this.logger.warn({ err, chatId }, "Failed to get Telegram file info");
      }

      if (!text && files.length === 0) return;

      let isMentioned = false;
      if (isGroup) {
        isMentioned = this.checkMention(ctx);
      }

      let processedText = text;
      if (isMentioned) {
        processedText = stripBotMention(processedText, this.botUsername);
      }

      if (this.handler) {
        await this.handler({
          type: isPrivate ? "dm" : "group",
          text: processedText,
          chatId,
          messageId: ctx.message.message_id,
          senderName,
          senderId,
          isMentioned,
          ...(files.length > 0 && { files }),
        });
      }
    });

    this.bot.start({
      onStart: () => {
        this.started = true;
        this.logger.info("Telegram bot started (long polling)");
      },
    });
  }

  async stop(): Promise<void> {
    if (this.started) {
      this.bot.stop();
      this.started = false;
      this.logger.info("Telegram bot stopped");
    }
  }

  get isConnected(): boolean {
    return this.started;
  }

  get username(): string {
    return this.botUsername;
  }

  get botToken(): string {
    return this.bot.token;
  }

  async sendText(chatId: string, text: string, replyToMessageId?: number): Promise<void> {
    const chunks = chunkText(text, TELEGRAM_TEXT_LIMIT);
    for (let i = 0; i < chunks.length; i++) {
      await this.bot.api.sendMessage(
        chatId,
        chunks[i],
        i === 0 && replyToMessageId ? { reply_parameters: { message_id: replyToMessageId } } : undefined,
      );
    }
  }

  async sendFile(chatId: string, filePath: string, fileName?: string): Promise<void> {
    const data = await readFile(filePath);
    const name = fileName ?? basename(filePath);
    await this.bot.api.sendDocument(chatId, new InputFile(data, name));
  }

  async sendTyping(chatId: string): Promise<void> {
    try {
      await this.bot.api.sendChatAction(chatId, "typing");
    } catch {
      // Ignore typing errors
    }
  }

  async getChatInfo(chatId: string): Promise<{ title?: string; description?: string }> {
    try {
      const chat = await this.bot.api.getChat(chatId);
      return {
        title: "title" in chat ? chat.title : undefined,
        description: "description" in chat ? (chat.description ?? undefined) : undefined,
      };
    } catch {
      return {};
    }
  }

  static async verifyToken(token: string): Promise<{ username: string; firstName: string }> {
    const bot = new Bot(token);
    const me = await bot.api.getMe();
    return { username: me.username ?? "", firstName: me.first_name };
  }

  private checkMention(ctx: Context): boolean {
    if (!this.botUsername) return false;

    const textEntities = ctx.message?.entities ?? [];
    const captionEntities = ctx.message?.caption_entities ?? [];
    const allEntities = [...textEntities, ...captionEntities];
    const textSource = ctx.message?.text ?? ctx.message?.caption ?? "";

    for (const entity of allEntities) {
      if (entity.type === "mention") {
        const mentionText = textSource.substring(entity.offset, entity.offset + entity.length);
        if (mentionText?.toLowerCase() === `@${this.botUsername.toLowerCase()}`) return true;
      }
    }

    // Check reply-to-bot
    if (ctx.message?.reply_to_message?.from?.username?.toLowerCase() === this.botUsername.toLowerCase()) {
      return true;
    }

    return false;
  }
}

export function stripBotMention(text: string, botUsername: string): string {
  if (!botUsername) return text;
  const pattern = new RegExp(`@${botUsername.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
  return text
    .replace(pattern, "")
    .trim()
    .replace(/\s{2,}/g, " ");
}
