import type { DiscordBot } from "./bot";

export function createDiscordMessageHandler(
  discord: DiscordBot,
  channelId: string,
  replyToMessageId?: string,
): (text: string) => Promise<void> {
  let isFirstMessage = true;
  return async (text: string) => {
    if (!discord.isConnected) return;
    if (isFirstMessage && replyToMessageId) {
      await discord.sendText(channelId, text, replyToMessageId);
      isFirstMessage = false;
    } else {
      await discord.sendText(channelId, text);
      isFirstMessage = false;
    }
  };
}
