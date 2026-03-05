/**
 * FTS5 search interface for the agent.
 *
 * Provides a clean API over the indexed_files_fts virtual table.
 * The agent uses this to find relevant documents/items when users
 * ask questions that need organizational context.
 *
 * Uses raw SQL for FTS5 queries because Kysely's typed query builder
 * doesn't support FTS5 virtual table joins natively.
 */
import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { DB } from "../db/schema";

export interface SearchResult {
  id: string;
  fileName: string;
  source: string;
  contentCategory: string;
  summary: string | null;
  providerUrl: string | null;
  sourcePath: string | null;
  sourceUpdatedAt: string | null;
  /** FTS5 relevance rank (lower = more relevant). */
  relevance: number;
}

export interface SearchOptions {
  /** Filter by source provider. */
  source?: string;
  /** Max results (default 10). */
  limit?: number;
  /** Content category filter: "document" or "structured". */
  category?: string;
  /**
   * RBAC (team-level): restrict results to files from these connector config IDs.
   * When provided, only files belonging to these connectors are returned.
   * When omitted, no team-level filtering is applied (admin/unrestricted access).
   */
  allowedConnectorIds?: string[];
  /**
   * RBAC (user-level): restrict results to files the user can access.
   * Provider user IDs (from user_provider_identities) to match against file_access.
   * Files with NO file_access rows are treated as unrestricted (visible to all).
   * When omitted, no user-level filtering is applied.
   */
  providerUserIds?: string[];
}

/**
 * Search the FTS5 index.
 *
 * Supports FTS5 query syntax:
 * - Simple terms: "planning doc"
 * - Prefix: "plan*"
 * - Phrase: '"Q1 planning"'
 * - Column filter: "file_name:report"
 */
export async function searchFiles(db: Kysely<DB>, query: string, opts?: SearchOptions): Promise<SearchResult[]> {
  const limit = opts?.limit ?? 10;

  const ftsQuery = sanitizeFtsQuery(query);
  if (!ftsQuery) return [];

  // Build connector ID filter for team-level RBAC
  const connectorFilter =
    opts?.allowedConnectorIds && opts.allowedConnectorIds.length > 0
      ? sql`AND indexed_files.connector_config_id IN (${sql.join(
          opts.allowedConnectorIds.map((id) => sql`${id}`),
          sql`,`,
        )})`
      : sql``;

  // Build user-level file access filter.
  // Files with no file_access rows are unrestricted (visible to all).
  // Files WITH file_access rows are only visible if the user's provider ID is listed.
  const userFilter =
    opts?.providerUserIds && opts.providerUserIds.length > 0
      ? sql`AND (
				NOT EXISTS (SELECT 1 FROM file_access WHERE file_access.indexed_file_id = indexed_files.id)
				OR EXISTS (
					SELECT 1 FROM file_access
					WHERE file_access.indexed_file_id = indexed_files.id
					AND file_access.provider_user_id IN (${sql.join(
            opts.providerUserIds.map((id) => sql`${id}`),
            sql`,`,
          )})
				)
			)`
      : sql``;

  const baseQuery = sql<SearchResult>`
		SELECT
			indexed_files.id,
			indexed_files.file_name as "fileName",
			indexed_files.source,
			indexed_files.content_category as "contentCategory",
			indexed_files.summary,
			indexed_files.provider_url as "providerUrl",
			indexed_files.source_path as "sourcePath",
			indexed_files.source_updated_at as "sourceUpdatedAt",
			rank as relevance
		FROM indexed_files
		INNER JOIN indexed_files_fts ON indexed_files.rowid = indexed_files_fts.rowid
		WHERE indexed_files_fts MATCH ${ftsQuery}
		AND indexed_files.is_archived = 0
		${connectorFilter}
		${userFilter}
		${opts?.source ? sql`AND indexed_files.source = ${opts.source}` : sql``}
		${opts?.category ? sql`AND indexed_files.content_category = ${opts.category}` : sql``}
		ORDER BY rank
		LIMIT ${limit}
	`;

  const results = await baseQuery.execute(db);
  return results.rows;
}

/**
 * Get the full content of an indexed file.
 * Used by the agent when it wants to load a document into conversation context,
 * and by the frontend file detail sheet.
 *
 * Access control:
 * - allowedConnectorIds: team-level connector filter
 * - providerUserIds: user-level file_access filter
 */
export async function getFileContent(
  db: Kysely<DB>,
  fileId: string,
  allowedConnectorIds?: string[],
  providerUserIds?: string[],
): Promise<{
  id: string;
  fileName: string;
  fileType: string | null;
  source: string;
  sourcePath: string | null;
  content: string | null;
  summary: string | null;
  contextNote: string | null;
  tags: string | null;
  providerUrl: string | null;
  enrichmentStatus: string;
} | null> {
  let q = db
    .selectFrom("indexed_files")
    .select([
      "id",
      "file_name",
      "file_type",
      "source",
      "source_path",
      "content",
      "summary",
      "context_note",
      "tags",
      "provider_url",
      "enrichment_status",
    ])
    .where("id", "=", fileId);

  // RBAC: restrict to files from allowed connectors
  if (allowedConnectorIds && allowedConnectorIds.length > 0) {
    q = q.where("connector_config_id", "in", allowedConnectorIds);
  } else if (allowedConnectorIds && allowedConnectorIds.length === 0) {
    // User has access to zero connectors — no file can match
    return null;
  }

  const file = await q.executeTakeFirst();

  if (!file) return null;

  // User-level RBAC: check file_access if providerUserIds specified
  if (providerUserIds && providerUserIds.length > 0) {
    const hasAccessRows = await db
      .selectFrom("file_access")
      .select("provider_user_id")
      .where("indexed_file_id", "=", fileId)
      .limit(1)
      .execute();

    // If file has access rows, user must be in the list
    if (hasAccessRows.length > 0) {
      const userHasAccess = await db
        .selectFrom("file_access")
        .select("provider_user_id")
        .where("indexed_file_id", "=", fileId)
        .where("provider_user_id", "in", providerUserIds)
        .limit(1)
        .execute();

      if (userHasAccess.length === 0) return null;
    }
  }

  return {
    id: file.id,
    fileName: file.file_name,
    fileType: file.file_type,
    source: file.source,
    sourcePath: file.source_path,
    content: file.content,
    summary: file.summary,
    contextNote: file.context_note,
    tags: file.tags,
    providerUrl: file.provider_url,
    enrichmentStatus: file.enrichment_status,
  };
}

/**
 * List all indexed sources with file counts.
 * Useful for the agent to report what data is available.
 *
 * When allowedConnectorIds is provided, only counts files from those connectors.
 */
export async function listIndexedSources(
  db: Kysely<DB>,
  allowedConnectorIds?: string[],
): Promise<Array<{ source: string; fileCount: number; lastSynced: string | null }>> {
  let q = db
    .selectFrom("indexed_files")
    .select(["source", sql<number>`count(*)`.as("fileCount"), sql<string>`max(synced_at)`.as("lastSynced")])
    .where("is_archived", "=", 0);

  if (allowedConnectorIds && allowedConnectorIds.length > 0) {
    q = q.where("connector_config_id", "in", allowedConnectorIds);
  } else if (allowedConnectorIds && allowedConnectorIds.length === 0) {
    return [];
  }

  const results = await q.groupBy("source").execute();

  return results.map((r) => ({
    source: r.source,
    fileCount: Number(r.fileCount),
    lastSynced: r.lastSynced,
  }));
}

/**
 * Sanitize user input for FTS5 queries.
 * Strips characters that would cause FTS5 syntax errors.
 */
function sanitizeFtsQuery(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed;
  }

  if (trimmed.includes(":") && /^\w+:/.test(trimmed)) {
    return trimmed;
  }

  const cleaned = trimmed
    .replace(/[^\w\s*"-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned;
}
