import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE settings ADD COLUMN smtp_host TEXT`.execute(db);
  await sql`ALTER TABLE settings ADD COLUMN smtp_port INTEGER`.execute(db);
  await sql`ALTER TABLE settings ADD COLUMN smtp_user TEXT`.execute(db);
  await sql`ALTER TABLE settings ADD COLUMN smtp_pass TEXT`.execute(db);
  await sql`ALTER TABLE settings ADD COLUMN smtp_from TEXT`.execute(db);
  await sql`ALTER TABLE settings ADD COLUMN smtp_secure INTEGER DEFAULT 1`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // SQLite doesn't support DROP COLUMN before 3.35.0 — recreate approach omitted for brevity.
  // In practice, we never run down migrations.
  void db;
}
