/**
 * Connectors API — manage external data sources and trigger syncs.
 *
 * Admin-facing endpoints for:
 * - CRUD on connector configs (with credential validation + auto-sync)
 * - Triggering manual syncs
 * - Searching indexed files
 * - AI enrichment (summary generation)
 *
 * Route ordering: static paths (/all-files, /search, /sources, /files/...)
 * must be registered before dynamic /:id to prevent param capture.
 */
import { Hono } from "hono";
import type { Kysely } from "kysely";
import type { Logger } from "pino";
import { z } from "zod";
import { ensureValidToken, listMyDriveFolders, listSharedDrives } from "../connectors/google-drive";
import { getFileContent, listIndexedSources, searchFiles } from "../connectors/search";
import { getConnector, runConnectorSync } from "../connectors/sync";
import type { ConnectorCredentials, OAuthCredentials } from "../connectors/types";
import type { createConnectorRepository } from "../db/repositories/connectors";
import type { DB } from "../db/schema";

type ConnectorRepo = ReturnType<typeof createConnectorRepository>;

const VALID_CONNECTOR_TYPES = ["google_drive", "clickup", "notion", "linear"] as const;
const VALID_AUTH_TYPES = ["oauth", "api_key", "service_account"] as const;

const createConnectorSchema = z.object({
  connectorType: z.enum(VALID_CONNECTOR_TYPES),
  authType: z.enum(VALID_AUTH_TYPES),
  credentials: z.record(z.string(), z.unknown()),
  scopeConfig: z.record(z.string(), z.unknown()).optional(),
  teamAccess: z.array(z.string()).optional(),
});

const searchSchema = z.object({
  query: z.string().min(1, "Search query is required"),
  source: z.string().optional(),
  category: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).optional(),
});

const enrichSchema = z.object({
  fileIds: z.array(z.string()).min(1, "At least one file ID is required"),
  instruction: z.string().min(1, "Instruction is required"),
});

const browseGoogleDriveSchema = z.object({
  credentials: z.object({
    client_id: z.string().min(1),
    client_secret: z.string().min(1),
    refresh_token: z.string().min(1),
  }),
});

const updateScopeSchema = z.object({
  scopeConfig: z.record(z.string(), z.unknown()),
});

export function connectorRoutes(connectorRepo: ConnectorRepo, db: Kysely<DB>, logger: Logger) {
  const routes = new Hono();

  /* ── Static-path routes (must come before /:id) ─────── */

  /** List all connectors with file counts. */
  routes.get("/", async (c) => {
    const configs = await connectorRepo.listConfigs();

    const connectorsWithCounts = await Promise.all(
      configs.map(async (cfg) => {
        const fileCount = await connectorRepo.countFilesByConnector(cfg.id);
        return {
          id: cfg.id,
          connectorType: cfg.connector_type,
          authType: cfg.auth_type,
          scopeConfig: JSON.parse(cfg.scope_config),
          teamAccess: cfg.team_access ? JSON.parse(cfg.team_access) : null,
          syncStatus: cfg.sync_status,
          lastSyncedAt: cfg.last_synced_at,
          errorMessage: cfg.error_message,
          createdBy: cfg.created_by,
          createdAt: cfg.created_at,
          fileCount,
        };
      }),
    );

    return c.json({ connectors: connectorsWithCounts });
  });

  /** Create a new connector — validates credentials then auto-triggers first sync. */
  routes.post("/", async (c) => {
    const body = await c.req.json();
    const parsed = createConnectorSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Invalid request";
      return c.json({ error: { code: "VALIDATION_ERROR", message } }, 400);
    }

    // Validate credentials by testing the API connection.
    // For OAuth, also refresh the token so we store a valid access_token.
    let credentials = { type: parsed.data.authType, ...parsed.data.credentials } as ConnectorCredentials;
    try {
      const connector = getConnector(parsed.data.connectorType);
      if (credentials.type === "oauth" && connector.refreshTokens) {
        const refreshed = await connector.refreshTokens(credentials);
        if (refreshed) credentials = refreshed;
      }
      await connector.validateCredentials(credentials);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid credentials";
      logger.warn({ err, connectorType: parsed.data.connectorType }, "Credential validation failed");
      return c.json(
        { error: { code: "INVALID_CREDENTIALS", message: `Credential validation failed: ${message}` } },
        400,
      );
    }

    const config = await connectorRepo.createConfig({
      connectorType: parsed.data.connectorType,
      authType: parsed.data.authType,
      credentials: JSON.stringify(credentials),
      scopeConfig: parsed.data.scopeConfig ? JSON.stringify(parsed.data.scopeConfig) : undefined,
      teamAccess: parsed.data.teamAccess ? JSON.stringify(parsed.data.teamAccess) : undefined,
      createdBy: "admin",
    });

    // Auto-trigger first sync in background (non-blocking)
    runConnectorSync(db, config.id, logger).catch((err) => {
      logger.error({ err, connectorId: config.id }, "Initial sync failed after connect");
    });

    return c.json(
      {
        connector: {
          id: config.id,
          connectorType: config.connector_type,
          syncStatus: config.sync_status,
        },
      },
      201,
    );
  });

  /** List all files across connectors with pagination, optional source filter, and access info. */
  routes.get("/all-files", async (c) => {
    const limit = Math.min(Math.max(Number(c.req.query("limit")) || 50, 1), 200);
    const offset = Math.max(Number(c.req.query("offset")) || 0, 0);
    const source = c.req.query("source") || undefined;

    const [files, total] = await Promise.all([
      connectorRepo.listAllFiles({ limit, offset, connectorType: source }),
      connectorRepo.countAllFiles(source),
    ]);

    const fileIds = files.map((f) => f.id);
    const accessMap = fileIds.length > 0 ? await connectorRepo.getFileAccessMap(fileIds) : new Map<string, string[]>();

    return c.json({
      files: files.map((f) => {
        const accessList = accessMap.get(f.id);
        return {
          id: f.id,
          connectorId: f.connector_config_id,
          connectorType: f.connector_type,
          fileName: f.file_name,
          fileType: f.file_type,
          contentCategory: f.content_category,
          source: f.source,
          sourcePath: f.source_path,
          providerUrl: f.provider_url,
          syncedAt: f.synced_at,
          sourceUpdatedAt: f.source_updated_at,
          hasSummary: !!f.summary,
          accessScope: accessList ? "restricted" : "unrestricted",
          accessCount: accessList?.length ?? null,
        };
      }),
      total,
      hasMore: offset + limit < total,
    });
  });

  /** Search indexed files (FTS5). */
  routes.get("/search", async (c) => {
    const query = c.req.query("query") ?? "";
    const source = c.req.query("source");
    const category = c.req.query("category");
    const limit = c.req.query("limit");

    const parsed = searchSchema.safeParse({ query, source, category, limit });
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Invalid request";
      return c.json({ error: { code: "VALIDATION_ERROR", message } }, 400);
    }

    const results = await searchFiles(db, parsed.data.query, {
      source: parsed.data.source,
      category: parsed.data.category,
      limit: parsed.data.limit,
    });
    return c.json({ results });
  });

  /** Get full content of a file, including who has access. */
  routes.get("/files/:fileId/content", async (c) => {
    const fileId = c.req.param("fileId");
    const file = await getFileContent(db, fileId);
    if (!file) {
      return c.json({ error: { code: "NOT_FOUND", message: "File not found" } }, 404);
    }

    const accessDetails = await connectorRepo.getFileAccessDetails(fileId);
    return c.json({
      file,
      access: {
        scope: accessDetails.length > 0 ? "restricted" : "unrestricted",
        members: accessDetails.map((a) => ({
          providerUserId: a.providerUserId,
          providerEmail: a.providerEmail,
          userName: a.userName,
          userId: a.userId,
          mapped: !!a.userId,
        })),
      },
    });
  });

  /** List indexed sources summary. */
  routes.get("/sources", async (c) => {
    const sources = await listIndexedSources(db);
    return c.json({ sources });
  });

  /** Browse Google Drive shared drives for the folder picker. */
  routes.post("/google-drive/browse", async (c) => {
    const body = await c.req.json();
    const parsed = browseGoogleDriveSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Invalid request";
      return c.json({ error: { code: "VALIDATION_ERROR", message } }, 400);
    }

    try {
      const oauthCreds: OAuthCredentials = {
        type: "oauth",
        client_id: parsed.data.credentials.client_id,
        client_secret: parsed.data.credentials.client_secret,
        refresh_token: parsed.data.credentials.refresh_token,
        access_token: "",
      };

      const validCreds = await ensureValidToken(oauthCreds);
      const sharedDrives = await listSharedDrives(validCreds.access_token);

      // Also fetch root folders for My Drive mode (when no shared drives exist)
      const rootFolders = sharedDrives.length === 0 ? await listMyDriveFolders(validCreds.access_token) : [];

      return c.json({ sharedDrives, rootFolders });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to browse Google Drive";
      logger.warn({ err }, "Google Drive browse failed");
      return c.json({ error: { code: "BROWSE_FAILED", message } }, 400);
    }
  });

  /**
   * Browse shared drives for an existing connector (uses stored credentials).
   * Used by the manage dialog when admin wants to add/remove drives.
   */
  routes.get("/google-drive/browse/:connectorId", async (c) => {
    const config = await connectorRepo.findConfigById(c.req.param("connectorId"));
    if (!config) {
      return c.json({ error: { code: "NOT_FOUND", message: "Connector not found" } }, 404);
    }

    if (config.connector_type !== "google_drive") {
      return c.json({ error: { code: "INVALID_TYPE", message: "Connector is not Google Drive" } }, 400);
    }

    try {
      const credentials = JSON.parse(config.credentials) as OAuthCredentials;
      const validCreds = await ensureValidToken(credentials);

      // Persist refreshed token if it changed
      if (validCreds.access_token !== credentials.access_token) {
        await connectorRepo.updateConfig(config.id, { credentials: JSON.stringify(validCreds) });
      }

      const sharedDrives = await listSharedDrives(validCreds.access_token);
      const currentScope = JSON.parse(config.scope_config) as Record<string, unknown>;
      const selectedDriveIds = (currentScope.sharedDrives as string[] | undefined) ?? [];
      const selectedFolderIds = (currentScope.folders as string[] | undefined) ?? [];

      // Also fetch root folders for My Drive mode
      const rootFolders = sharedDrives.length === 0 ? await listMyDriveFolders(validCreds.access_token) : [];

      return c.json({
        sharedDrives: sharedDrives.map((d) => ({
          ...d,
          selected: selectedDriveIds.includes(d.id),
        })),
        rootFolders: rootFolders.map((f) => ({
          ...f,
          selected: selectedFolderIds.includes(f.id),
        })),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to browse Google Drive";
      logger.warn({ err, connectorId: config.id }, "Google Drive browse failed for existing connector");
      return c.json({ error: { code: "BROWSE_FAILED", message } }, 400);
    }
  });

  /* ── Dynamic :id routes ─────────────────────────────── */

  /** Get a single connector. */
  routes.get("/:id", async (c) => {
    const config = await connectorRepo.findConfigById(c.req.param("id"));
    if (!config) {
      return c.json({ error: { code: "NOT_FOUND", message: "Connector not found" } }, 404);
    }

    const fileCount = await connectorRepo.countFilesByConnector(config.id);
    return c.json({
      connector: {
        id: config.id,
        connectorType: config.connector_type,
        authType: config.auth_type,
        scopeConfig: JSON.parse(config.scope_config),
        teamAccess: config.team_access ? JSON.parse(config.team_access) : null,
        syncStatus: config.sync_status,
        lastSyncedAt: config.last_synced_at,
        errorMessage: config.error_message,
        createdBy: config.created_by,
        createdAt: config.created_at,
        fileCount,
      },
    });
  });

  /** Delete a connector. */
  routes.delete("/:id", async (c) => {
    const config = await connectorRepo.findConfigById(c.req.param("id"));
    if (!config) {
      return c.json({ error: { code: "NOT_FOUND", message: "Connector not found" } }, 404);
    }
    await connectorRepo.deleteConfig(config.id);
    return c.json({ success: true });
  });

  /** Update connector scope config (add/remove drives, folders, etc.). */
  routes.patch("/:id/scope", async (c) => {
    const config = await connectorRepo.findConfigById(c.req.param("id"));
    if (!config) {
      return c.json({ error: { code: "NOT_FOUND", message: "Connector not found" } }, 404);
    }

    const body = await c.req.json();
    const parsed = updateScopeSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Invalid request";
      return c.json({ error: { code: "VALIDATION_ERROR", message } }, 400);
    }

    // Update scope and clear sync cursor to force a full re-sync
    await connectorRepo.updateConfig(config.id, {
      scopeConfig: JSON.stringify(parsed.data.scopeConfig),
      syncCursor: null,
      errorMessage: null,
    });

    // Auto-trigger re-sync in background
    runConnectorSync(db, config.id, logger).catch((err) => {
      logger.error({ err, connectorId: config.id }, "Re-sync after scope change failed");
    });

    const updated = await connectorRepo.findConfigById(config.id);
    if (!updated) {
      return c.json({ error: { code: "NOT_FOUND", message: "Connector not found after update" } }, 404);
    }
    return c.json({
      connector: {
        id: updated.id,
        connectorType: updated.connector_type,
        scopeConfig: JSON.parse(updated.scope_config),
        syncStatus: updated.sync_status,
      },
    });
  });

  /** Trigger a manual sync. */
  routes.post("/:id/sync", async (c) => {
    const config = await connectorRepo.findConfigById(c.req.param("id"));
    if (!config) {
      return c.json({ error: { code: "NOT_FOUND", message: "Connector not found" } }, 404);
    }

    if (config.sync_status === "syncing") {
      // Reset stale "syncing" status — the previous sync likely crashed
      await connectorRepo.updateConfig(config.id, { syncStatus: "active", errorMessage: null });
      logger.warn({ connectorId: config.id }, "Reset stale syncing status via manual trigger");
    }

    runConnectorSync(db, config.id, logger).catch((err) => {
      logger.error({ err, connectorId: config.id }, "Background sync failed");
    });

    return c.json({ message: "Sync started", connectorId: config.id });
  });

  /** List files for a connector, including access scope info. */
  routes.get("/:id/files", async (c) => {
    const config = await connectorRepo.findConfigById(c.req.param("id"));
    if (!config) {
      return c.json({ error: { code: "NOT_FOUND", message: "Connector not found" } }, 404);
    }

    const files = await connectorRepo.listFilesByConnector(config.id, { archived: false });
    const fileIds = files.map((f) => f.id);
    const accessMap = await connectorRepo.getFileAccessMap(fileIds);

    return c.json({
      files: files.map((f) => {
        const accessList = accessMap.get(f.id);
        return {
          id: f.id,
          fileName: f.file_name,
          fileType: f.file_type,
          contentCategory: f.content_category,
          source: f.source,
          sourcePath: f.source_path,
          providerUrl: f.provider_url,
          syncedAt: f.synced_at,
          sourceUpdatedAt: f.source_updated_at,
          hasSummary: !!f.summary,
          accessScope: accessList ? "restricted" : "unrestricted",
          accessCount: accessList?.length ?? null,
        };
      }),
    });
  });

  /** Enrich files with AI-generated summaries and context. */
  routes.post("/:id/enrich", async (c) => {
    const config = await connectorRepo.findConfigById(c.req.param("id"));
    if (!config) {
      return c.json({ error: { code: "NOT_FOUND", message: "Connector not found" } }, 404);
    }

    const body = await c.req.json();
    const parsed = enrichSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Invalid request";
      return c.json({ error: { code: "VALIDATION_ERROR", message } }, 400);
    }

    // TODO: Queue LLM enrichment jobs. For now, mark files as enriching
    // and return a job ID. The actual LLM calls will be implemented when
    // the enrichment worker is built.
    const jobId = `enrich-${Date.now()}`;
    logger.info({ jobId, connectorId: config.id, fileCount: parsed.data.fileIds.length }, "Enrichment requested");

    return c.json({ success: true, jobId });
  });

  return routes;
}
