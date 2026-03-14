import type { TelegramBot } from "./bot";

export function createTelegramMessageHandler(
  telegram: TelegramBot,
  chatId: string,
  replyToMessageId?: number,
): (text: string) => Promise<void> {
  let isFirstMessage = true;
  return async (text: string) => {
    if (!telegram.isConnected) return;
    if (isFirstMessage && replyToMessageId) {
      await telegram.sendText(chatId, text, replyToMessageId);
      isFirstMessage = false;
    } else {
      await telegram.sendText(chatId, text);
      isFirstMessage = false;
    }
  };
}
