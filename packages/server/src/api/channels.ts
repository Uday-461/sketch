import { Hono } from "hono";
import type { createSettingsRepository } from "../db/repositories/settings";
import type { SlackBot } from "../slack/bot";
import type { WhatsAppBot } from "../whatsapp/bot";

type SettingsRepo = ReturnType<typeof createSettingsRepository>;

interface ChannelDeps {
  whatsapp?: WhatsAppBot;
  getSlack?: () => SlackBot | null;
  onSlackDisconnect?: () => Promise<void>;
  settings?: SettingsRepo;
}

export function channelRoutes(deps: ChannelDeps) {
  const routes = new Hono();

  routes.get("/status", async (c) => {
    const slackBot = deps.getSlack?.() ?? null;
    const slackConfigured = !!slackBot;

    const row = deps.settings ? await deps.settings.get() : null;
    const emailConfigured = Boolean(
      row?.smtp_host && row?.smtp_port && row?.smtp_user && row?.smtp_pass && row?.smtp_from,
    );

    const channels = [
      {
        platform: "slack" as const,
        configured: slackConfigured,
        connected: slackConfigured ? true : null,
        phoneNumber: null,
        fromAddress: null,
      },
      {
        platform: "whatsapp" as const,
        configured: deps.whatsapp?.isConnected ?? false,
        connected: deps.whatsapp?.isConnected ? true : null,
        phoneNumber: deps.whatsapp?.phoneNumber ?? null,
        fromAddress: null,
      },
      {
        platform: "email" as const,
        configured: emailConfigured,
        connected: emailConfigured ? true : null,
        phoneNumber: null,
        fromAddress: emailConfigured ? (row?.smtp_from ?? null) : null,
      },
    ];

    return c.json({ channels });
  });

  routes.delete("/slack", async (c) => {
    const slackBot = deps.getSlack?.() ?? null;
    if (!slackBot) {
      return c.json({ error: { code: "NOT_CONFIGURED", message: "Slack is not configured" } }, 400);
    }
    await deps.onSlackDisconnect?.();
    return c.json({ success: true });
  });

  return routes;
}
