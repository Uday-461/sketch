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
          providerFileId: item.providerFileId,
          providerUrl: item.providerUrl,
          fileName: item.fileName,
          fileType: item.fileType,
          contentCategory: item.contentCategory,
          content: item.content,
          summary: null,
          tags: JSON.stringify([config.connector_type, item.fileType].filter(Boolean)),
          source: config.connector_type,
          sourcePath: item.sourcePath,
          contentHash: item.contentHash,
          sourceCreatedAt: item.sourceCreatedAt,
          sourceUpdatedAt: item.sourceUpdatedAt,
        });

        // Populate file_access rows if the connector provides access data
        if (item.accessibleBy) {
          await repo.syncFileAccess(upsertResult.id, item.accessibleBy, item.accessEmails);
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

/**
 * Run sync for all connectors that are due.
 * Called on a schedule (e.g., every 30 minutes).
 */
export async function runAllSyncs(db: Kysely<DB>, logger: Logger): Promise<void> {
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
export function startSyncScheduler(db: Kysely<DB>, logger: Logger, intervalMs = 30 * 60 * 1000): () => void {
  // Recover any connectors stuck in "syncing" from a previous crash
  recoverStaleSyncs(db, logger).catch((err) => {
    logger.error({ err }, "Failed to recover stale syncs on startup");
  });

  const timer = setInterval(() => {
    runAllSyncs(db, logger).catch((err) => {
      logger.error({ err }, "Sync scheduler tick failed");
    });
  }, intervalMs);

  logger.info({ intervalMs }, "Sync scheduler started");

  return () => {
    clearInterval(timer);
    logger.info("Sync scheduler stopped");
  };
}
