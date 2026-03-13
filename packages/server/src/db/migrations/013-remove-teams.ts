/**
 * Remove team-based access control.
 *
 * Drops teams + user_teams tables and the team_access column from connector_configs.
 * Access control is now purely user-based via file_access (email/provider_user_id).
 */
import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Drop teams tables (IF EXISTS for idempotency — some envs may not have them)
  await sql`DROP TABLE IF EXISTS user_teams`.execute(db);
  await sql`DROP TABLE IF EXISTS teams`.execute(db);

  // Remove team_access column from connector_configs.
  // Check if the column exists first — some envs may not have it.
  const cols = await sql<{ name: string }>`PRAGMA table_info(connector_configs)`.execute(db);
  const hasTeamAccess = cols.rows.some((c) => c.name === "team_access");

  if (hasTeamAccess) {
    // SQLite doesn't reliably support ALTER TABLE DROP COLUMN on all versions,
    // so we recreate the table without the column.
    // Must disable FK checks to drop a table referenced by indexed_files.
    await sql`PRAGMA foreign_keys = OFF`.execute(db);

    await sql`DROP TABLE IF EXISTS connector_configs_new`.execute(db);

    await sql`CREATE TABLE connector_configs_new (
			id text PRIMARY KEY,
			connector_type text NOT NULL,
			auth_type text NOT NULL,
			credentials text NOT NULL,
			scope_config text NOT NULL DEFAULT '{}',
			sync_status text NOT NULL DEFAULT 'pending',
			sync_cursor text,
			last_synced_at text,
			error_message text,
			created_by text NOT NULL,
			created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`.execute(db);

    await sql`INSERT INTO connector_configs_new
			SELECT id, connector_type, auth_type, credentials, scope_config,
				sync_status, sync_cursor, last_synced_at, error_message,
				created_by, created_at, updated_at
			FROM connector_configs`.execute(db);

    await sql`DROP TABLE connector_configs`.execute(db);
    await sql`ALTER TABLE connector_configs_new RENAME TO connector_configs`.execute(db);

    await sql`PRAGMA foreign_keys = ON`.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Re-add team_access column
  await db.schema.alterTable("connector_configs").addColumn("team_access", "text").execute();

  // Recreate teams tables
  await db.schema
    .createTable("teams")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull().unique())
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await db.schema
    .createTable("user_teams")
    .addColumn("user_id", "text", (col) => col.notNull().references("users.id"))
    .addColumn("team_id", "text", (col) => col.notNull().references("teams.id"))
    .execute();

  await sql`CREATE UNIQUE INDEX idx_user_teams_pk ON user_teams(user_id, team_id)`.execute(db);
}
