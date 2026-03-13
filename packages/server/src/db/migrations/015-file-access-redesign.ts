/**
 * Migration 015: File access redesign.
 *
 * Two major changes:
 * 1. Access scopes — replace per-file × per-user materialized access rows
 *    with scope-level grouping (workspace, space, drive). Files reference a scope;
 *    scopes have members. Reduces 1.1M+ rows to ~200 scope member rows.
 *
 * 2. File deduplication — decouple files from connectors. A file exists once
 *    keyed on (source, provider_file_id). A new connector_files junction table
 *    tracks which connectors discovered each file.
 *
 * Access is now email-based everywhere (both ClickUp and Google Drive provide emails).
 */
import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // ── 1. Create access_scopes table ──────────────────────
  await db.schema
    .createTable("access_scopes")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("connector_config_id", "text", (col) => col.notNull().references("connector_configs.id"))
    .addColumn("scope_type", "text", (col) => col.notNull()) // 'workspace' | 'space' | 'drive' | 'folder'
    .addColumn("provider_scope_id", "text", (col) => col.notNull())
    .addColumn("label", "text")
    .execute();

  await sql`CREATE UNIQUE INDEX idx_access_scopes_connector_provider ON access_scopes(connector_config_id, provider_scope_id)`.execute(
    db,
  );

  // ── 2. Create access_scope_members table ───────────────
  await db.schema
    .createTable("access_scope_members")
    .addColumn("access_scope_id", "text", (col) => col.notNull().references("access_scopes.id").onDelete("cascade"))
    .addColumn("email", "text", (col) => col.notNull())
    .execute();

  await sql`CREATE UNIQUE INDEX idx_scope_members_pk ON access_scope_members(access_scope_id, email)`.execute(db);
  await sql`CREATE INDEX idx_scope_members_email ON access_scope_members(email)`.execute(db);

  // ── 3. Create connector_files junction table ───────────
  await db.schema
    .createTable("connector_files")
    .addColumn("connector_config_id", "text", (col) =>
      col.notNull().references("connector_configs.id").onDelete("cascade"),
    )
    .addColumn("indexed_file_id", "text", (col) => col.notNull().references("indexed_files.id").onDelete("cascade"))
    .execute();

  await sql`CREATE UNIQUE INDEX idx_connector_files_pk ON connector_files(connector_config_id, indexed_file_id)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_connector_files_file ON connector_files(indexed_file_id)`.execute(db);

  // ── 4. Add access_scope_id to indexed_files ────────────
  await db.schema.alterTable("indexed_files").addColumn("access_scope_id", "text").execute();

  // ── 5. Backfill connector_files from existing connector_config_id ──
  await sql`INSERT INTO connector_files (connector_config_id, indexed_file_id) SELECT connector_config_id, id FROM indexed_files`.execute(
    db,
  );

  // ── 6. Rebuild file_access with email-only schema ──────
  // Migrate provider_email (or provider_user_id for Google Drive where they're the same) to email column.
  await db.schema
    .createTable("file_access_new")
    .addColumn("indexed_file_id", "text", (col) => col.notNull().references("indexed_files.id").onDelete("cascade"))
    .addColumn("email", "text", (col) => col.notNull())
    .execute();

  // For Google Drive, provider_user_id IS the email.
  // For ClickUp, provider_email has the email (provider_user_id is numeric).
  // Migrate whichever has a valid email.
  await sql`
		INSERT INTO file_access_new (indexed_file_id, email)
		SELECT indexed_file_id, COALESCE(provider_email, provider_user_id)
		FROM file_access
		WHERE COALESCE(provider_email, provider_user_id) LIKE '%@%'
	`.execute(db);

  await sql`DROP TABLE file_access`.execute(db);
  await sql`ALTER TABLE file_access_new RENAME TO file_access`.execute(db);

  await sql`CREATE UNIQUE INDEX idx_file_access_pk ON file_access(indexed_file_id, email)`.execute(db);
  await sql`CREATE INDEX idx_file_access_email ON file_access(email)`.execute(db);

  // ── 7. Make (source, provider_file_id) unique on indexed_files ──
  // First deduplicate: if the same provider_file_id exists under multiple connectors,
  // keep the one with the most recent synced_at and link others via connector_files.
  // For this initial migration, we just add the unique index — duplicates don't exist yet
  // because only one Google Drive connector is currently configured.
  // When multiple connectors exist, the upsert logic will prevent duplicates.
  await sql`CREATE UNIQUE INDEX idx_indexed_files_source_provider ON indexed_files(source, provider_file_id)`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_indexed_files_source_provider`.execute(db);

  // Restore old file_access schema
  await sql`DROP TABLE IF EXISTS file_access`.execute(db);
  await db.schema
    .createTable("file_access")
    .addColumn("indexed_file_id", "text", (col) => col.notNull().references("indexed_files.id"))
    .addColumn("provider_user_id", "text", (col) => col.notNull())
    .addColumn("provider_email", "text")
    .execute();
  await sql`CREATE UNIQUE INDEX idx_file_access_pk ON file_access(indexed_file_id, provider_user_id)`.execute(db);
  await sql`CREATE INDEX idx_file_access_user ON file_access(provider_user_id)`.execute(db);

  await db.schema.alterTable("indexed_files").dropColumn("access_scope_id").execute();
  await db.schema.dropTable("connector_files").execute();
  await db.schema.dropTable("access_scope_members").execute();
  await db.schema.dropTable("access_scopes").execute();
}
