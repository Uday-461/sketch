/**
 * Extend settings with SMTP, Google OAuth, and Gemini API key columns.
 */
import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // SMTP settings
  await sql`ALTER TABLE settings ADD COLUMN smtp_host TEXT`.execute(db);
  await sql`ALTER TABLE settings ADD COLUMN smtp_port INTEGER`.execute(db);
  await sql`ALTER TABLE settings ADD COLUMN smtp_user TEXT`.execute(db);
  await sql`ALTER TABLE settings ADD COLUMN smtp_password TEXT`.execute(db);
  await sql`ALTER TABLE settings ADD COLUMN smtp_from TEXT`.execute(db);
  await sql`ALTER TABLE settings ADD COLUMN smtp_secure INTEGER DEFAULT 1`.execute(db);

  // Google OAuth settings
  await sql`ALTER TABLE settings ADD COLUMN google_oauth_client_id TEXT`.execute(db);
  await sql`ALTER TABLE settings ADD COLUMN google_oauth_client_secret TEXT`.execute(db);

  // Gemini API key for embeddings
  await sql`ALTER TABLE settings ADD COLUMN gemini_api_key TEXT`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // SQLite doesn't reliably support DROP COLUMN before 3.35.0 — recreate approach omitted.
  // In practice, we never run down migrations.
  void db;
}
