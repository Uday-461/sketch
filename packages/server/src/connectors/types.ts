/**
 * Core types for the connector system.
 *
 * Connectors pull data from external sources (Google Drive, ClickUp, Notion, Linear)
 * into Sketch's local index. Two content categories:
 * - "document": full content stored locally (docs, pages, PRDs)
 * - "structured": metadata only, live-fetched when needed (tasks, issues)
 */
import type { Logger } from "pino";

export type ConnectorType = "google_drive" | "clickup" | "notion" | "linear";

export type AuthType = "oauth" | "api_key" | "service_account";

export type SyncStatus = "pending" | "active" | "syncing" | "paused" | "error";

export type ContentCategory = "document" | "structured";

/**
 * Decrypted credentials stored per connector.
 * Shape varies by provider + auth type.
 */
export interface OAuthCredentials {
  type: "oauth";
  /** Initially empty — populated on first token refresh. */
  access_token: string;
  refresh_token: string;
  token_type?: string;
  /** ISO timestamp. Missing or empty = treat as expired → triggers refresh. */
  expires_at?: string;
  client_id: string;
  client_secret: string;
}

export interface ApiKeyCredentials {
  type: "api_key";
  api_key: string;
}

export interface ServiceAccountCredentials {
  type: "service_account";
  service_account_json: string;
}

export type ConnectorCredentials = OAuthCredentials | ApiKeyCredentials | ServiceAccountCredentials;

/**
 * A file/item discovered during sync that should be indexed.
 */
export interface SyncedItem {
  providerFileId: string;
  providerUrl: string | null;
  fileName: string;
  fileType: string | null;
  contentCategory: ContentCategory;
  content: string | null;
  sourcePath: string | null;
  contentHash: string | null;
  sourceCreatedAt: string | null;
  sourceUpdatedAt: string | null;
  /**
   * Provider user IDs who can access this item.
   * - Array of provider-specific user IDs → creates file_access rows
   * - null → no access restrictions (legacy/unrestricted)
   *
   * Populated differently per provider:
   * - ClickUp: space members (private) or all workspace members (public)
   * - Google Drive: file permission grantee emails
   * - Linear: team members (private) or all workspace members (public)
   * - Notion: discovered via per-user token
   */
  accessibleBy: string[] | null;
  /**
   * Optional mapping of provider user ID → email address.
   * Used to display human-readable identifiers for unmapped users.
   * Only populated by connectors that expose member emails (e.g., ClickUp).
   */
  accessEmails?: Record<string, string>;
}

/**
 * Result of a sync run.
 */
export interface SyncResult {
  itemsProcessed: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsArchived: number;
  newCursor: string | null;
  errors: Array<{ fileId: string; error: string }>;
}

/**
 * Base interface all connectors must implement.
 */
export interface Connector {
  readonly type: ConnectorType;

  /** Validate credentials work (test API call). */
  validateCredentials(credentials: ConnectorCredentials): Promise<void>;

  /** Run initial or incremental sync. Returns items to index. */
  sync(opts: {
    credentials: ConnectorCredentials;
    scopeConfig: Record<string, unknown>;
    cursor: string | null;
    logger: Logger;
  }): AsyncGenerator<SyncedItem>;

  /** Return the new sync cursor after a sync run. */
  getCursor(opts: {
    credentials: ConnectorCredentials;
    scopeConfig: Record<string, unknown>;
    currentCursor: string | null;
    logger: Logger;
  }): Promise<string | null>;

  /**
   * Refresh OAuth tokens if needed.
   * Returns updated credentials or null if no refresh needed.
   */
  refreshTokens?(credentials: OAuthCredentials): Promise<OAuthCredentials | null>;
}
