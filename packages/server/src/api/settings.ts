import { Hono } from "hono";
import type { createSettingsRepository } from "../db/repositories/settings";
import { requireAdmin } from "./middleware";

type SettingsRepo = ReturnType<typeof createSettingsRepository>;

const VALID_TIERS = new Set(["haiku", "sonnet", "opus"]);

export function settingsRoutes(settings: SettingsRepo) {
  const routes = new Hono();

  routes.get("/identity", async (c) => {
    const row = await settings.get();

    return c.json({
      orgName: row?.org_name ?? null,
      botName: row?.bot_name ?? "Sketch",
    });
  });

  routes.get("/model-tier", requireAdmin(), async (c) => {
    const row = await settings.get();
    return c.json({ tier: row?.main_model_tier ?? "sonnet" });
  });

  routes.put("/model-tier", requireAdmin(), async (c) => {
    const body = (await c.req.json()) as { tier?: string };
    if (!body.tier || !VALID_TIERS.has(body.tier)) {
      return c.json({ error: { code: "INVALID_TIER", message: "Tier must be haiku, sonnet, or opus" } }, 400);
    }
    await settings.update({ mainModelTier: body.tier });
    return c.json({ success: true });
  });

  return routes;
}
