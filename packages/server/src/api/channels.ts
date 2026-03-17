import { Hono } from "hono";
import { z } from "zod";
import type { createSettingsRepository } from "../db/repositories/settings";
import { DiscordBot } from "../discord/bot";
import { createEmailTransport, verifyEmailTransport } from "../email";
import type { SlackBot } from "../slack/bot";
import { TelegramBot } from "../telegram/bot";
import type { WhatsAppBot } from "../whatsapp/bot";
import { requireAdmin } from "./middleware";

type SettingsRepo = ReturnType<typeof createSettingsRepository>;

interface ChannelDeps {
  whatsapp?: WhatsAppBot;
  getSlack?: () => SlackBot | null;
  getTelegram?: () => TelegramBot | null;
  getDiscord?: () => DiscordBot | null;
  onSlackDisconnect?: () => Promise<void>;
  onTelegramTokenUpdated?: (token: string) => Promise<void>;
  onTelegramDisconnect?: () => Promise<void>;
  onDiscordTokenUpdated?: (token: string) => Promise<void>;
  onDiscordDisconnect?: () => Promise<void>;
  settings: SettingsRepo;
  onSmtpUpdated?: () => Promise<void>;
}

const smtpConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  user: z.string().min(1),
  password: z.string().min(1),
  from: z.string().email(),
});

export function channelRoutes(deps: ChannelDeps) {
  const routes = new Hono();

  routes.get("/status", async (c) => {
    const slackBot = deps.getSlack?.() ?? null;
    const slackConfigured = !!slackBot;

    const settingsRow = await deps.settings.get();
    const emailConfigured = !!(settingsRow?.smtp_host && settingsRow?.smtp_from);

    const telegramBot = deps.getTelegram?.() ?? null;
    const discordBot = deps.getDiscord?.() ?? null;

    const channels = [
      {
        platform: "slack" as const,
        configured: slackConfigured,
        connected: slackConfigured ? true : null,
        phoneNumber: null,
      },
      {
        platform: "whatsapp" as const,
        configured: deps.whatsapp?.isConnected ?? false,
        connected: deps.whatsapp?.isConnected ? true : null,
        phoneNumber: deps.whatsapp?.phoneNumber ?? null,
      },
      {
        platform: "telegram" as const,
        configured: !!telegramBot,
        connected: telegramBot?.isConnected ? true : null,
        botUsername: telegramBot?.username ?? null,
      },
      {
        platform: "discord" as const,
        configured: !!discordBot,
        connected: discordBot?.isConnected ? true : null,
        botUsername: discordBot?.username ?? null,
      },
      {
        platform: "email" as const,
        configured: emailConfigured,
        connected: emailConfigured,
        outboundOnly: true,
      },
    ];

    return c.json({ channels });
  });

  // --- Telegram endpoints ---

  routes.post("/telegram", requireAdmin(), async (c) => {
    const body = await c.req.json();
    const parsed = z.object({ token: z.string().min(1) }).safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Bot token is required" } }, 400);
    }

    try {
      const result = await TelegramBot.verifyToken(parsed.data.token.trim());
      await deps.settings.update({ telegramBotToken: parsed.data.token.trim() });
      await deps.onTelegramTokenUpdated?.(parsed.data.token.trim());
      return c.json({ success: true, username: result.username });
    } catch {
      return c.json(
        { error: { code: "INVALID_TOKEN", message: "Invalid Telegram bot token. Check the token and try again." } },
        400,
      );
    }
  });

  routes.delete("/telegram", requireAdmin(), async (c) => {
    await deps.onTelegramDisconnect?.();
    await deps.settings.update({ telegramBotToken: null });
    return c.json({ success: true });
  });

  // --- Discord endpoints ---

  routes.post("/discord", requireAdmin(), async (c) => {
    const body = await c.req.json();
    const parsed = z.object({ token: z.string().min(1) }).safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Bot token is required" } }, 400);
    }

    try {
      const result = await DiscordBot.verifyToken(parsed.data.token.trim());
      await deps.settings.update({ discordBotToken: parsed.data.token.trim() });
      await deps.onDiscordTokenUpdated?.(parsed.data.token.trim());
      return c.json({ success: true, username: result.username });
    } catch {
      return c.json(
        { error: { code: "INVALID_TOKEN", message: "Invalid Discord bot token. Check the token and try again." } },
        400,
      );
    }
  });

  routes.delete("/discord", requireAdmin(), async (c) => {
    await deps.onDiscordDisconnect?.();
    await deps.settings.update({ discordBotToken: null });
    return c.json({ success: true });
  });

  routes.delete("/slack", requireAdmin(), async (c) => {
    const slackBot = deps.getSlack?.() ?? null;
    if (!slackBot) {
      return c.json({ error: { code: "NOT_CONFIGURED", message: "Slack is not configured" } }, 400);
    }
    await deps.onSlackDisconnect?.();
    return c.json({ success: true });
  });

  // --- Email SMTP endpoints ---

  routes.post("/email/test", requireAdmin(), async (c) => {
    const body = await c.req.json();
    const parsed = smtpConfigSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Invalid SMTP config";
      return c.json({ error: { code: "VALIDATION_ERROR", message } }, 400);
    }

    const transport = createEmailTransport(parsed.data);
    const ok = await verifyEmailTransport(transport);
    if (!ok) {
      return c.json({ error: { code: "CONNECTION_FAILED", message: "Could not connect to SMTP server" } }, 400);
    }

    return c.json({ success: true });
  });

  routes.put("/email", requireAdmin(), async (c) => {
    const body = await c.req.json();
    const parsed = smtpConfigSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Invalid SMTP config";
      return c.json({ error: { code: "VALIDATION_ERROR", message } }, 400);
    }

    await deps.settings.update({
      smtpHost: parsed.data.host,
      smtpPort: parsed.data.port,
      smtpUser: parsed.data.user,
      smtpPassword: parsed.data.password,
      smtpFrom: parsed.data.from,
    });

    await deps.onSmtpUpdated?.();

    return c.json({ success: true });
  });

  routes.delete("/email", requireAdmin(), async (c) => {
    await deps.settings.update({
      smtpHost: null,
      smtpPort: null,
      smtpUser: null,
      smtpPassword: null,
      smtpFrom: null,
    });

    await deps.onSmtpUpdated?.();

    return c.json({ success: true });
  });

  return routes;
}
