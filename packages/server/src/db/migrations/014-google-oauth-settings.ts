import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE settings ADD COLUMN google_oauth_client_id TEXT`.execute(db);
  await sql`ALTER TABLE settings ADD COLUMN google_oauth_client_secret TEXT`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  void db;
}
