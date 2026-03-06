/**
 * Per-user OAuth identity mapping and file-level access control.
 *
 * user_provider_identities: links each Sketch user to their account in each
 * provider (Google, ClickUp, Notion, Linear) via OAuth. Stores the user's
 * own access token so we can verify what they can see.
 *
 * file_access: per-file access list populated during sync. Each row means
 * "provider user X can see indexed file Y". At query time, we resolve the
 * Sketch user → provider_user_id → filter indexed_files via this table.
 */
import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("user_provider_identities")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("user_id", "text", (col) => col.notNull().references("users.id"))
    .addColumn("provider", "text", (col) => col.notNull())
    .addColumn("provider_user_id", "text", (col) => col.notNull())
    .addColumn("provider_email", "text")
    .addColumn("access_token", "text")
    .addColumn("refresh_token", "text")
    .addColumn("token_expires_at", "text")
    .addColumn("connected_at", "text", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await sql`CREATE UNIQUE INDEX idx_upi_user_provider ON user_provider_identities(user_id, provider)`.execute(db);

  await db.schema
    .createTable("file_access")
    .addColumn("indexed_file_id", "text", (col) => col.notNull().references("indexed_files.id"))
    .addColumn("provider_user_id", "text", (col) => col.notNull())
    .execute();

  await sql`CREATE UNIQUE INDEX idx_file_access_pk ON file_access(indexed_file_id, provider_user_id)`.execute(db);
  await sql`CREATE INDEX idx_file_access_user ON file_access(provider_user_id)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("file_access").execute();
  await db.schema.dropTable("user_provider_identities").execute();
}
