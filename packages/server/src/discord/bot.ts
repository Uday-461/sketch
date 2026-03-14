import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { AttachmentBuilder, Client, GatewayIntentBits, type Message, Partials } from "discord.js";
import { chunkText } from "../formatting/chunking";
import type { Logger } from "../logger";

const DISCORD_TEXT_LIMIT = 2000;

export interface DiscordMessage {
  type: "dm" | "guild";
  text: string;
  channelId: string;
  messageId: string;
  senderName: string;
  senderId: string;
  isMentioned: boolean;
  guildId: string | null;
}

export type DiscordMessageHandler = (message: DiscordMessage) => Promise<void>;

export interface DiscordBotConfig {
  token: string;
  logger: Logger;
}

export class DiscordBot {
  private client: Client;
  private token: string;
  private logger: Logger;
  private handler: DiscordMessageHandler | null = null;
  private connected = false;
  private botUsername = "";

  constructor(config: DiscordBotConfig) {
    this.token = config.token;
    this.logger = config.logger;
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Channel],
    });
  }

  onMessage(handler: DiscordMessageHandler): void {
    this.handler = handler;
  }

  async start(): Promise<void> {
    this.client.on("ready", () => {
      this.connected = true;
      this.botUsername = this.client.user?.username ?? "";
      this.logger.info({ username: this.botUsername }, "Discord bot connected");
    });

    this.client.on("messageCreate", async (msg: Message) => {
      if (msg.author.bot) return;
      if (!msg.content) return;

      const isDm = msg.guild === null;
      const clientUser = this.client.user;
      if (!clientUser) return;
      const isMentioned = isDm ? false : msg.mentions.has(clientUser);

      let text = msg.content;
      if (isMentioned) {
        text = stripBotMention(text, clientUser.id);
      }

      if (this.handler) {
        await this.handler({
          type: isDm ? "dm" : "guild",
          text,
          channelId: msg.channelId,
          messageId: msg.id,
          senderName: msg.member?.displayName ?? msg.author.displayName ?? msg.author.username,
          senderId: msg.author.id,
          isMentioned,
          guildId: msg.guildId,
        });
      }
    });

    await this.client.login(this.token);
  }

  async stop(): Promise<void> {
    if (this.connected) {
      this.client.destroy();
      this.connected = false;
      this.logger.info("Discord bot stopped");
    }
  }

  get isConnected(): boolean {
    return this.connected;
  }

  get username(): string {
    return this.botUsername;
  }

  async sendText(channelId: string, text: string, replyToMessageId?: string): Promise<void> {
    const channel = await this.client.channels.fetch(channelId);
    if (!channel?.isTextBased() || !("send" in channel)) return;

    const chunks = chunkText(text, DISCORD_TEXT_LIMIT);
    for (let i = 0; i < chunks.length; i++) {
      if (i === 0 && replyToMessageId) {
        await channel.send({ content: chunks[i], reply: { messageReference: replyToMessageId } });
      } else {
        await channel.send(chunks[i]);
      }
    }
  }

  async sendFile(channelId: string, filePath: string, fileName?: string): Promise<void> {
    const channel = await this.client.channels.fetch(channelId);
    if (!channel?.isTextBased() || !("send" in channel)) return;

    const data = await readFile(filePath);
    const name = fileName ?? basename(filePath);
    const attachment = new AttachmentBuilder(data, { name });
    await channel.send({ files: [attachment] });
  }

  async sendTyping(channelId: string): Promise<void> {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (channel?.isTextBased() && "sendTyping" in channel) {
        await channel.sendTyping();
      }
    } catch {
      // Ignore typing errors
    }
  }

  async getChannelName(channelId: string): Promise<string | null> {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (channel && "name" in channel && channel.name) return channel.name;
    } catch {
      // Ignore
    }
    return null;
  }

  static async verifyToken(token: string): Promise<{ username: string }> {
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    try {
      await client.login(token);
      const username = client.user?.username ?? "";
      client.destroy();
      return { username };
    } catch (err) {
      client.destroy();
      throw err;
    }
  }
}

export function stripBotMention(text: string, botId: string): string {
  return text
    .replace(new RegExp(`<@!?${botId}>`, "g"), "")
    .trim()
    .replace(/\s{2,}/g, " ");
}
