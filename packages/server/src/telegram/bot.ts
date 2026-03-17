import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { Bot, type Context, InputFile } from "grammy";
import { chunkText } from "../formatting/chunking";
import type { Logger } from "../logger";

const TELEGRAM_TEXT_LIMIT = 4096;

export interface TelegramMessage {
  type: "dm" | "group";
  text: string;
  chatId: string;
  messageId: number;
  senderName: string;
  senderId: string;
  isMentioned: boolean;
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

    this.bot.on("message:text", async (ctx: Context) => {
      if (!ctx.message?.text || !ctx.from || ctx.from.is_bot) return;

      const chatType = ctx.chat?.type;
      const isPrivate = chatType === "private";
      const isGroup = chatType === "group" || chatType === "supergroup";
      if (!isPrivate && !isGroup) return;

      const chatId = String(ctx.chat?.id);
      const senderId = String(ctx.from.id);
      const senderName =
        [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ") || ctx.from.username || "Unknown";

      let isMentioned = false;
      if (isGroup) {
        isMentioned = this.checkMention(ctx);
      }

      let text = ctx.message.text;
      if (isMentioned) {
        text = stripBotMention(text, this.botUsername);
      }

      if (this.handler) {
        await this.handler({
          type: isPrivate ? "dm" : "group",
          text,
          chatId,
          messageId: ctx.message.message_id,
          senderName,
          senderId,
          isMentioned,
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
    if (!ctx.message?.entities || !this.botUsername) return false;

    for (const entity of ctx.message.entities) {
      if (entity.type === "mention") {
        const mentionText = ctx.message.text?.substring(entity.offset, entity.offset + entity.length);
        if (mentionText?.toLowerCase() === `@${this.botUsername.toLowerCase()}`) return true;
      }
    }

    // Check reply-to-bot
    if (ctx.message.reply_to_message?.from?.username?.toLowerCase() === this.botUsername.toLowerCase()) {
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
