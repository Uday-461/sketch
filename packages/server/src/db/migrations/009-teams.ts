/**
 * Add teams and user_teams tables for connector RBAC.
 *
 * Teams are admin-created groups. Users can belong to multiple teams.
 * Connector visibility is controlled via connector_configs.team_access
 * (already exists) — a JSON array of team IDs. When team_access is null,
 * the connector is unrestricted (visible to everyone).
 */
import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
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

  // Composite primary key — SQLite supports this via raw SQL
  await sql`CREATE UNIQUE INDEX idx_user_teams_pk ON user_teams(user_id, team_id)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("user_teams").execute();
  await db.schema.dropTable("teams").execute();
}
