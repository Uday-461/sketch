/**
 * Repository for connector_configs and indexed_files tables.
 * Handles CRUD + FTS5 search over indexed content.
 */
import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { ConnectorType, ContentCategory, SyncStatus } from "../../connectors/types";
import type { DB } from "../schema";

export function createConnectorRepository(db: Kysely<DB>) {
  return {
    /** List all connector configs. */
    async listConfigs() {
      return db.selectFrom("connector_configs").selectAll().orderBy("created_at", "desc").execute();
    },

    /** Find a connector config by ID. */
    async findConfigById(id: string) {
      return db.selectFrom("connector_configs").selectAll().where("id", "=", id).executeTakeFirst();
    },

    /** Find connector configs by type. */
    async findConfigsByType(connectorType: ConnectorType) {
      return db.selectFrom("connector_configs").selectAll().where("connector_type", "=", connectorType).execute();
    },

    /** Find connector configs that are ready to sync. */
    async findSyncableConfigs() {
      return db.selectFrom("connector_configs").selectAll().where("sync_status", "in", ["active", "pending"]).execute();
    },

    /** Create a new connector config. */
    async createConfig(data: {
      connectorType: ConnectorType;
      authType: string;
      credentials: string;
      scopeConfig?: string;
      teamAccess?: string;
      createdBy: string;
    }) {
      const id = randomUUID();
      await db
        .insertInto("connector_configs")
        .values({
          id,
          connector_type: data.connectorType,
          auth_type: data.authType,
          credentials: data.credentials,
          scope_config: data.scopeConfig ?? "{}",
          team_access: data.teamAccess ?? null,
          created_by: data.createdBy,
        })
        .execute();

      return db.selectFrom("connector_configs").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
    },

    /** Update connector config fields. */
    async updateConfig(
      id: string,
      data: Partial<{
        credentials: string;
        scopeConfig: string;
        teamAccess: string | null;
        syncStatus: SyncStatus;
        syncCursor: string | null;
        lastSyncedAt: string | null;
        errorMessage: string | null;
      }>,
    ) {
      const values: Record<string, unknown> = {};
      if (data.credentials !== undefined) values.credentials = data.credentials;
      if (data.scopeConfig !== undefined) values.scope_config = data.scopeConfig;
      if (data.teamAccess !== undefined) values.team_access = data.teamAccess;
      if (data.syncStatus !== undefined) values.sync_status = data.syncStatus;
      if (data.syncCursor !== undefined) values.sync_cursor = data.syncCursor;
      if (data.lastSyncedAt !== undefined) values.last_synced_at = data.lastSyncedAt;
      if (data.errorMessage !== undefined) values.error_message = data.errorMessage;

      if (Object.keys(values).length > 0) {
        values.updated_at = new Date().toISOString();
        await db.updateTable("connector_configs").set(values).where("id", "=", id).execute();
      }

      return db.selectFrom("connector_configs").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
    },

    /** Delete a connector config (cascades to indexed_files). */
    async deleteConfig(id: string) {
      return db.deleteFrom("connector_configs").where("id", "=", id).execute();
    },

    /** Upsert an indexed file (insert or update based on connector + provider_file_id). */
    async upsertFile(data: {
      connectorConfigId: string;
      providerFileId: string;
      providerUrl: string | null;
      fileName: string;
      fileType: string | null;
      contentCategory: ContentCategory;
      content: string | null;
      summary: string | null;
      tags: string | null;
      source: string;
      sourcePath: string | null;
      contentHash: string | null;
      sourceCreatedAt: string | null;
      sourceUpdatedAt: string | null;
    }) {
      const now = new Date().toISOString();

      const existing = await db
        .selectFrom("indexed_files")
        .selectAll()
        .where("connector_config_id", "=", data.connectorConfigId)
        .where("provider_file_id", "=", data.providerFileId)
        .executeTakeFirst();

      if (existing) {
        await db
          .updateTable("indexed_files")
          .set({
            provider_url: data.providerUrl,
            file_name: data.fileName,
            file_type: data.fileType,
            content_category: data.contentCategory,
            content: data.content,
            summary: data.summary,
            tags: data.tags,
            source_path: data.sourcePath,
            content_hash: data.contentHash,
            is_archived: 0,
            source_created_at: data.sourceCreatedAt,
            source_updated_at: data.sourceUpdatedAt,
            synced_at: now,
          })
          .where("id", "=", existing.id)
          .execute();

        return { id: existing.id, created: false };
      }

      const id = randomUUID();
      await db
        .insertInto("indexed_files")
        .values({
          id,
          connector_config_id: data.connectorConfigId,
          provider_file_id: data.providerFileId,
          provider_url: data.providerUrl,
          file_name: data.fileName,
          file_type: data.fileType,
          content_category: data.contentCategory,
          content: data.content,
          summary: data.summary,
          tags: data.tags,
          source: data.source,
          source_path: data.sourcePath,
          content_hash: data.contentHash,
          source_created_at: data.sourceCreatedAt,
          source_updated_at: data.sourceUpdatedAt,
          synced_at: now,
        })
        .execute();

      return { id, created: true };
    },

    /** Archive files that weren't seen in this sync run. */
    async archiveStaleFiles(connectorConfigId: string, seenFileIds: Set<string>) {
      if (seenFileIds.size === 0) return 0;

      const allFiles = await db
        .selectFrom("indexed_files")
        .select(["id", "provider_file_id"])
        .where("connector_config_id", "=", connectorConfigId)
        .where("is_archived", "=", 0)
        .execute();

      const toArchive = allFiles.filter((f) => !seenFileIds.has(f.provider_file_id));

      if (toArchive.length === 0) return 0;

      const archiveIds = toArchive.map((f) => f.id);
      await db.updateTable("indexed_files").set({ is_archived: 1 }).where("id", "in", archiveIds).execute();

      return toArchive.length;
    },

    /** Update a file's summary after LLM generation. */
    async updateFileSummary(fileId: string, summary: string, tags: string | null) {
      await db.updateTable("indexed_files").set({ summary, tags }).where("id", "=", fileId).execute();
    },

    /**
     * Search indexed files using FTS5.
     * For the full search API with sanitization, use connectors/search.ts instead.
     */
    async searchFiles(query: string, opts?: { source?: string; limit?: number }) {
      const limit = opts?.limit ?? 20;

      const results = await sql`
        SELECT indexed_files.*, rank as relevance
        FROM indexed_files
        INNER JOIN indexed_files_fts ON indexed_files.rowid = indexed_files_fts.rowid
        WHERE indexed_files_fts MATCH ${query}
        AND indexed_files.is_archived = 0
        ${opts?.source ? sql`AND indexed_files.source = ${opts.source}` : sql``}
        ORDER BY rank
        LIMIT ${limit}
      `.execute(db);

      return results.rows;
    },

    /** Get a single indexed file by ID. */
    async findFileById(fileId: string) {
      return db.selectFrom("indexed_files").selectAll().where("id", "=", fileId).executeTakeFirst();
    },

    /** List files for a connector. */
    async listFilesByConnector(connectorConfigId: string, opts?: { archived?: boolean }) {
      let q = db.selectFrom("indexed_files").selectAll().where("connector_config_id", "=", connectorConfigId);

      if (opts?.archived !== undefined) {
        q = q.where("is_archived", "=", opts.archived ? 1 : 0);
      }

      return q.orderBy("synced_at", "desc").execute();
    },

    /** List connector configs accessible by a set of connector IDs. */
    async listConfigsByIds(ids: string[]) {
      if (ids.length === 0) return [];
      return db
        .selectFrom("connector_configs")
        .selectAll()
        .where("id", "in", ids)
        .orderBy("created_at", "desc")
        .execute();
    },

    /**
     * Replace file_access rows for an indexed file.
     * Called during sync to set who can access each file.
     * Optional emailMap provides provider_user_id → email for display.
     */
    async syncFileAccess(indexedFileId: string, providerUserIds: string[], emailMap?: Record<string, string>) {
      // Delete existing access rows for this file
      await db.deleteFrom("file_access").where("indexed_file_id", "=", indexedFileId).execute();

      if (providerUserIds.length === 0) return;

      // Insert new access rows
      await db
        .insertInto("file_access")
        .values(
          providerUserIds.map((uid) => ({
            indexed_file_id: indexedFileId,
            provider_user_id: uid,
            provider_email: emailMap?.[uid] ?? null,
          })),
        )
        .execute();
    },

    /**
     * Get file_access rows for a batch of file IDs.
     * Returns a map of fileId → provider_user_id[].
     * Files with no rows are unrestricted (visible to everyone).
     */
    async getFileAccessMap(fileIds: string[]): Promise<Map<string, string[]>> {
      if (fileIds.length === 0) return new Map();

      const rows = await db
        .selectFrom("file_access")
        .select(["indexed_file_id", "provider_user_id"])
        .where("indexed_file_id", "in", fileIds)
        .execute();

      const map = new Map<string, string[]>();
      for (const row of rows) {
        const existing = map.get(row.indexed_file_id);
        if (existing) {
          existing.push(row.provider_user_id);
        } else {
          map.set(row.indexed_file_id, [row.provider_user_id]);
        }
      }

      return map;
    },

    /**
     * Get detailed access info for a single file.
     * Resolves provider_user_id → Sketch user (if mapped via user_provider_identities).
     * Falls back to provider_email from the file_access row for display.
     * Returns both mapped users (with name) and unmapped provider IDs.
     */
    async getFileAccessDetails(
      fileId: string,
    ): Promise<
      { providerUserId: string; providerEmail: string | null; userName: string | null; userId: string | null }[]
    > {
      const rows = await sql<{
        provider_user_id: string;
        provider_email: string | null;
        user_name: string | null;
        user_id: string | null;
      }>`
        SELECT
          fa.provider_user_id,
          fa.provider_email,
          u.name AS user_name,
          u.id AS user_id
        FROM file_access fa
        LEFT JOIN user_provider_identities upi
          ON upi.provider_user_id = fa.provider_user_id
        LEFT JOIN users u
          ON u.id = upi.user_id
        WHERE fa.indexed_file_id = ${fileId}
        ORDER BY u.name IS NULL, u.name, fa.provider_user_id
      `.execute(db);

      return rows.rows.map((r) => ({
        providerUserId: r.provider_user_id,
        providerEmail: r.provider_email,
        userName: r.user_name,
        userId: r.user_id,
      }));
    },

    /**
     * List files across all connectors with pagination.
     * Joins connector_configs to include connector_type per file.
     * Ordered by synced_at descending (most recently synced first).
     * Optional connectorType filter for server-side source filtering.
     */
    async listAllFiles(opts: { limit: number; offset: number; connectorType?: string }) {
      let query = db
        .selectFrom("indexed_files")
        .innerJoin("connector_configs", "connector_configs.id", "indexed_files.connector_config_id")
        .select([
          "indexed_files.id",
          "indexed_files.connector_config_id",
          "indexed_files.file_name",
          "indexed_files.file_type",
          "indexed_files.content_category",
          "indexed_files.source",
          "indexed_files.source_path",
          "indexed_files.provider_url",
          "indexed_files.synced_at",
          "indexed_files.source_updated_at",
          "indexed_files.summary",
          "connector_configs.connector_type",
        ])
        .where("indexed_files.is_archived", "=", 0);

      if (opts.connectorType) {
        query = query.where("connector_configs.connector_type", "=", opts.connectorType);
      }

      return query.orderBy("indexed_files.synced_at", "desc").limit(opts.limit).offset(opts.offset).execute();
    },

    /** Count non-archived files, optionally filtered by connector type. */
    async countAllFiles(connectorType?: string) {
      let query = db
        .selectFrom("indexed_files")
        .innerJoin("connector_configs", "connector_configs.id", "indexed_files.connector_config_id")
        .select(sql`count(*)`.as("count"))
        .where("indexed_files.is_archived", "=", 0);

      if (connectorType) {
        query = query.where("connector_configs.connector_type", "=", connectorType);
      }

      const result = await query.executeTakeFirstOrThrow();
      return Number(result.count);
    },

    /** Count files per connector. */
    async countFilesByConnector(connectorConfigId: string) {
      const result = await db
        .selectFrom("indexed_files")
        .select(sql`count(*)`.as("count"))
        .where("connector_config_id", "=", connectorConfigId)
        .where("is_archived", "=", 0)
        .executeTakeFirstOrThrow();

      return Number(result.count);
    },
  };
}
