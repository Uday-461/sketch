/**
 * Sync runner — orchestrates connector sync runs.
 *
 * Handles the full lifecycle: credential refresh, sync execution,
 * content hashing for change detection, summary generation (placeholder),
 * and cursor management.
 */
import type { Kysely } from "kysely";
import type { Logger } from "pino";
import { createConnectorRepository } from "../db/repositories/connectors";
import type { DB } from "../db/schema";
import { createClickUpConnector } from "./clickup";
import { type EmbeddingProviderConfig, createEmbeddingProvider } from "./embeddings";
import { clearEnrichmentData, runEnrichment } from "./enrichment";
import { createGoogleDriveConnector } from "./google-drive";
import { createLinearConnector } from "./linear";
import { createNotionConnector } from "./notion";
import type { Connector, ConnectorCredentials, ConnectorType, SyncResult } from "./types";

/**
 * Extract a useful error message from fetch/network errors.
 * Node.js fetch errors bury the real cause (ECONNREFUSED, ETIMEDOUT, etc.)
 * inside err.cause — this pulls it out for display.
 */
function extractErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return String(err);

  const cause = "cause" in err && err.cause instanceof Error ? err.cause.message : null;
  if (cause && err.message !== cause) {
    return `${err.message} (${cause})`;
  }
  return err.message;
}

const connectorFactories: Record<ConnectorType, () => Connector> = {
  google_drive: createGoogleDriveConnector,
  clickup: createClickUpConnector,
  notion: createNotionConnector,
  linear: createLinearConnector,
};

export function getConnector(type: ConnectorType): Connector {
  const factory = connectorFactories[type];
  if (!factory) throw new Error(`Unknown connector type: ${type}`);
  return factory();
}

function parseCredentials(encrypted: string): ConnectorCredentials {
  return JSON.parse(encrypted) as ConnectorCredentials;
}

function serializeCredentials(credentials: ConnectorCredentials): string {
  return JSON.stringify(credentials);
}

/**
 * Run a sync for a single connector config.
 */
export async function runConnectorSync(db: Kysely<DB>, connectorConfigId: string, logger: Logger): Promise<SyncResult> {
  const repo = createConnectorRepository(db);
  const config = await repo.findConfigById(connectorConfigId);

  if (!config) {
    throw new Error(`Connector config not found: ${connectorConfigId}`);
  }

  const connector = getConnector(config.connector_type as ConnectorType);
  let credentials = parseCredentials(config.credentials);
  const scopeConfig = JSON.parse(config.scope_config) as Record<string, unknown>;

  const syncLogger = logger.child({ connectorId: config.id, type: config.connector_type });
  syncLogger.info("Starting sync");

  await repo.updateConfig(config.id, { syncStatus: "syncing", errorMessage: null });

  try {
    if (credentials.type === "oauth" && connector.refreshTokens) {
      const refreshed = await connector.refreshTokens(credentials);
      if (refreshed) {
        credentials = refreshed;
        await repo.updateConfig(config.id, {
          credentials: serializeCredentials(credentials),
        });
        syncLogger.debug("OAuth tokens refreshed");
      }
    }

    const result: SyncResult = {
      itemsProcessed: 0,
      itemsCreated: 0,
      itemsUpdated: 0,
      itemsArchived: 0,
      newCursor: null,
      errors: [],
    };

    const seenProviderFileIds = new Set<string>();

    for await (const item of connector.sync({
      credentials,
      scopeConfig,
      cursor: config.sync_cursor,
      logger: syncLogger,
    })) {
      try {
        seenProviderFileIds.add(item.providerFileId);

        if (!item.fileName && !item.content) {
          continue;
        }

        const upsertResult = await repo.upsertFile({
          connectorConfigId: config.id,
          source: config.connector_type,
          providerFileId: item.providerFileId,
          providerUrl: item.providerUrl,
          fileName: item.fileName,
          fileType: item.fileType,
          contentCategory: item.contentCategory,
          content: item.content,
          summary: null,
          tags: JSON.stringify([config.connector_type, item.fileType].filter(Boolean)),
          sourcePath: item.sourcePath,
          contentHash: item.contentHash,
          sourceCreatedAt: item.sourceCreatedAt,
          sourceUpdatedAt: item.sourceUpdatedAt,
          mimeType: item.mimeType,
        });

        // Clear enrichment data if content changed (will be re-enriched)
        if (upsertResult.contentChanged) {
          await clearEnrichmentData(db, upsertResult.id);
        }

        // Track which connector discovered this file
        await repo.linkConnectorFile(config.id, upsertResult.id);

        // Set access: scope-level or per-file emails
        if (item.accessScope) {
          const scopeId = await repo.upsertAccessScope(config.id, item.accessScope);
          await repo.setFileAccessScope(upsertResult.id, scopeId);
        } else if (item.accessEmails && item.accessEmails.length > 0) {
          await repo.syncFileAccessEmails(upsertResult.id, item.accessEmails);
        }

        if (upsertResult.created) {
          result.itemsCreated++;
        } else {
          result.itemsUpdated++;
        }
        result.itemsProcessed++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.errors.push({ fileId: item.providerFileId, error: message });
        syncLogger.warn({ err, providerFileId: item.providerFileId }, "Failed to process item");
      }
    }

    if (!config.sync_cursor && seenProviderFileIds.size > 0) {
      result.itemsArchived = await repo.archiveStaleFiles(config.id, seenProviderFileIds);
    }

    result.newCursor = await connector.getCursor({
      credentials,
      scopeConfig,
      currentCursor: config.sync_cursor,
      logger: syncLogger,
    });

    await repo.updateConfig(config.id, {
      syncStatus: "active",
      syncCursor: result.newCursor,
      lastSyncedAt: new Date().toISOString(),
      errorMessage: null,
    });

    syncLogger.info(
      {
        processed: result.itemsProcessed,
        created: result.itemsCreated,
        updated: result.itemsUpdated,
        archived: result.itemsArchived,
        errors: result.errors.length,
      },
      "Sync complete",
    );

    return result;
  } catch (err) {
    const message = extractErrorMessage(err);
    syncLogger.error({ err }, "Sync failed");

    await repo.updateConfig(config.id, {
      syncStatus: "error",
      errorMessage: message,
    });

    throw err;
  }
}

export interface SyncSchedulerDeps {
  /** LLM call function for tagging enrichment. */
  llmCall?: (prompt: string) => Promise<import("./llm").LlmCallResult>;
  /** Download image from Google Drive for embedding. */
  downloadImage?: (providerFileId: string, connectorConfigId: string) => Promise<{ buffer: Buffer; mimeType: string }>;
}

/**
 * Run sync for all connectors that are due, then run enrichment.
 * Called on a schedule (e.g., every 30 minutes).
 */
export async function runAllSyncs(db: Kysely<DB>, logger: Logger, deps?: SyncSchedulerDeps): Promise<void> {
  const repo = createConnectorRepository(db);
  const configs = await repo.findSyncableConfigs();

  logger.info({ connectorCount: configs.length }, "Starting scheduled sync run");

  for (const config of configs) {
    try {
      await runConnectorSync(db, config.id, logger);
    } catch (err) {
      logger.error({ err, connectorId: config.id }, "Scheduled sync failed for connector");
    }
  }

  // Run enrichment after all syncs complete
  try {
    const settings = await db
      .selectFrom("settings")
      .select(["gemini_api_key", "org_name"])
      .where("id", "=", "default")
      .executeTakeFirst();

    const embeddingProvider = settings?.gemini_api_key
      ? createEmbeddingProvider({ provider: "gemini", apiKey: settings.gemini_api_key })
      : null;

    const enrichResult = await runEnrichment({
      db,
      logger: logger.child({ component: "enrichment" }),
      embeddingProvider,
      llmCall: deps?.llmCall ?? (async () => ({ text: "{}", inputTokens: 0, outputTokens: 0 })),
      downloadImage: deps?.downloadImage,
      orgContext: buildOrgContext(settings?.org_name ?? null),
    });

    if (enrichResult.filesProcessed > 0 || enrichResult.filesFailed > 0) {
      logger.info(
        {
          enriched: enrichResult.filesProcessed,
          failed: enrichResult.filesFailed,
          skipped: enrichResult.filesSkipped,
        },
        "Post-sync enrichment complete",
      );
    }
  } catch (err) {
    logger.error({ err }, "Post-sync enrichment failed");
  }
}

/**
 * Recover connectors stuck in "syncing" status after a crash/restart.
 * Resets them to "active" so the scheduler can pick them up again.
 */
async function recoverStaleSyncs(db: Kysely<DB>, logger: Logger): Promise<void> {
  const repo = createConnectorRepository(db);
  const stale = await db
    .selectFrom("connector_configs")
    .select(["id", "connector_type"])
    .where("sync_status", "=", "syncing")
    .execute();

  if (stale.length === 0) return;

  for (const config of stale) {
    await repo.updateConfig(config.id, { syncStatus: "active", errorMessage: null });
    logger.warn({ connectorId: config.id, type: config.connector_type }, "Recovered stale syncing connector");
  }

  logger.info({ count: stale.length }, "Recovered stale syncing connectors on startup");
}

/**
 * Create a simple interval-based sync scheduler.
 * Recovers any stuck syncs on startup, then runs periodically.
 * Returns a cleanup function to stop the scheduler.
 */
export function startSyncScheduler(
  db: Kysely<DB>,
  logger: Logger,
  intervalMs = 30 * 60 * 1000,
  deps?: SyncSchedulerDeps,
): () => void {
  // Recover any connectors stuck in "syncing" from a previous crash
  recoverStaleSyncs(db, logger).catch((err) => {
    logger.error({ err }, "Failed to recover stale syncs on startup");
  });

  // Run enrichment immediately for any pending files (without triggering a full sync)
  (async () => {
    try {
      // TODO: Remove this one-time reset after all files are re-tagged with improved prompt
      const resetCount = await db
        .updateTable("indexed_files")
        .set({ embedding_status: "pending", tags: null, summary: null })
        .where("embedding_status", "in", ["done", "failed", "processing", "skipped"])
        .executeTakeFirst();
      if (resetCount.numUpdatedRows > 0n) {
        // Clear all chunks and timeframes
        await db.deleteFrom("document_chunks").execute();
        await db.deleteFrom("document_timeframes").execute();
        logger.info({ reset: Number(resetCount.numUpdatedRows) }, "Reset files for re-enrichment (cleared tags, summaries, chunks)");
      }

      const settings = await db
        .selectFrom("settings")
        .select(["gemini_api_key", "org_name"])
        .where("id", "=", "default")
        .executeTakeFirst();
      const embeddingProvider = settings?.gemini_api_key
        ? createEmbeddingProvider({ provider: "gemini", apiKey: settings.gemini_api_key })
        : null;
      const orgContext = buildOrgContext(settings?.org_name ?? null);
      const result = await runEnrichment({
        db,
        logger: logger.child({ component: "enrichment" }),
        embeddingProvider,
        llmCall: deps?.llmCall ?? (async () => ({ text: "{}", inputTokens: 0, outputTokens: 0 })),
        orgContext,
      });
      if (result.filesProcessed > 0 || result.filesFailed > 0) {
        logger.info({ enriched: result.filesProcessed, failed: result.filesFailed }, "Startup enrichment complete");
      }
    } catch (err) {
      logger.error({ err }, "Startup enrichment failed");
    }
  })();

  const timer = setInterval(() => {
    runAllSyncs(db, logger, deps).catch((err) => {
      logger.error({ err }, "Sync scheduler tick failed");
    });
  }, intervalMs);

  logger.info({ intervalMs }, "Sync scheduler started");

  return () => {
    clearInterval(timer);
    logger.info("Sync scheduler stopped");
  };
}

/**
 * Build org context string for the tagging prompt.
 * TODO: Replace with admin-configurable org brief from a settings field.
 */
function buildOrgContext(_orgName: string | null): string {
  // Hardcoded org brief for now — move to settings UI later
  return `His Canvas builds Sketch, an AI assistant platform for organisations. Previously operated as Apperture (a low-code data engineering platform — pitched to investors in 2023, did not raise). Pivoted to workflow automation / AI assistants in 2024. Key past clients from the Apperture era included Sangeetha Mobiles, WIOM, and Urbanpiper. The team works across engineering, marketing, and product. Documents span both the Apperture era and current His Canvas work.`;
}
