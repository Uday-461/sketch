/**
 * Factory for the onMessage callback passed to runAgent().
 * Sends each text chunk via WhatsApp, skipping if disconnected.
 * In groups, the first message quotes the original mention message.
 */
import type { WAMessage } from "@whiskeysockets/baileys";
import type { WhatsAppBot } from "./bot";

export function createWhatsAppMessageHandler(
	whatsapp: WhatsAppBot,
	jid: string,
	quotedMessage?: WAMessage,
): (text: string) => Promise<void> {
	let isFirstMessage = true;
	return async (text: string) => {
		if (!whatsapp.isConnected) return;
		if (isFirstMessage && quotedMessage) {
			await whatsapp.sendText(jid, text, { quoted: quotedMessage });
			isFirstMessage = false;
		} else {
			await whatsapp.sendText(jid, text);
			isFirstMessage = false;
		}
	};
}
