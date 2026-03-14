import { Hono } from "hono";
import type { Kysely } from "kysely";
import type { Logger } from "pino";
import { createEmbeddingProvider } from "../connectors/embeddings";
import { runEnrichment } from "../connectors/enrichment";
import { createLlmCallFn } from "../connectors/llm";
import type { createSettingsRepository } from "../db/repositories/settings";
import type { DB } from "../db/schema";

type SettingsRepo = ReturnType<typeof createSettingsRepository>;

export function settingsRoutes(settings: SettingsRepo, db?: Kysely<DB>, logger?: Logger) {
  const routes = new Hono();

  routes.get("/identity", async (c) => {
    const row = await settings.get();

    return c.json({
      orgName: row?.org_name ?? null,
      botName: row?.bot_name ?? "Sketch",
    });
  });

  routes.get("/search", async (c) => {
    const row = await settings.get();
    return c.json({
      geminiApiKey: row?.gemini_api_key ?? null,
      enrichmentEnabled: row?.enrichment_enabled ?? 1,
    });
  });

  routes.put("/search", async (c) => {
    const body = await c.req.json<{
      geminiApiKey?: string | null;
      enrichmentEnabled?: boolean;
    }>();

    const updates: Parameters<typeof settings.update>[0] = {};
    if (body.geminiApiKey !== undefined) updates.geminiApiKey = body.geminiApiKey;
    if (body.enrichmentEnabled !== undefined) updates.enrichmentEnabled = body.enrichmentEnabled ? 1 : 0;

    await settings.update(updates);
    const row = await settings.get();
    return c.json({
      geminiApiKey: row?.gemini_api_key ?? null,
      enrichmentEnabled: row?.enrichment_enabled ?? 1,
    });
  });

  routes.post("/search/run-enrichment", async (c) => {
    if (!db || !logger) {
      return c.json({ error: { code: "NOT_AVAILABLE", message: "Enrichment not available" } }, 500);
    }

    const row = await settings.get();
    if (row?.enrichment_enabled === 0) {
      return c.json({ error: { code: "DISABLED", message: "Enrichment is disabled" } }, 400);
    }

    const embeddingProvider = row?.gemini_api_key
      ? createEmbeddingProvider({ provider: "gemini", apiKey: row.gemini_api_key })
      : null;

    // Run in background
    runEnrichment({
      db,
      logger: logger.child({ component: "enrichment" }),
      embeddingProvider,
      llmCall: createLlmCallFn(),
    }).catch((err) => {
      logger.error({ err }, "Manual enrichment run failed");
    });

    return c.json({ success: true, message: "Enrichment started" });
  });

  return routes;
}
