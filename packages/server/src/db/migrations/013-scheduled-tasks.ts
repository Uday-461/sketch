/**
 * Creates the scheduled_tasks table and a status index.
 *
 * Tasks are identified by a caller-supplied TEXT primary key (UUID) rather than an
 * auto-increment integer so the scheduler service can generate and refer to the ID
 * before writing to the DB. The status index supports the common query pattern of
 * loading all active tasks at startup.
 *
 * timezone defaults to 'UTC' so cron expressions without an explicit timezone are
 * always interpreted consistently. session_mode defaults to 'fresh' — no prior
 * context — which is the safest default for recurring automated runs.
 */
import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("scheduled_tasks")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("platform", "text", (col) => col.notNull())
    .addColumn("context_type", "text", (col) => col.notNull())
    .addColumn("delivery_target", "text", (col) => col.notNull())
    .addColumn("thread_ts", "text")
    .addColumn("prompt", "text", (col) => col.notNull())
    .addColumn("schedule_type", "text", (col) => col.notNull())
    .addColumn("schedule_value", "text", (col) => col.notNull())
    .addColumn("timezone", "text", (col) => col.defaultTo("UTC"))
    .addColumn("session_mode", "text", (col) => col.notNull().defaultTo("fresh"))
    .addColumn("next_run_at", "text")
    .addColumn("last_run_at", "text")
    .addColumn("status", "text", (col) => col.notNull().defaultTo("active"))
    .addColumn("created_by", "text")
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await sql`CREATE INDEX idx_scheduled_tasks_status ON scheduled_tasks(status)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("scheduled_tasks").execute();
}
