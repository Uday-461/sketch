/**
 * Creates agent_runs and agent_messages tables for logging agent execution
 * metrics and full conversation transcripts.
 *
 * agent_runs stores per-invocation metrics (cost, tokens, duration, status).
 * agent_messages stores the full message transcript for each run.
 *
 * Uses Kysely builder for cross-dialect compatibility (SQLite + Postgres).
 */
import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("agent_runs")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("user_id", "text")
    .addColumn("workspace_key", "text", (col) => col.notNull())
    .addColumn("thread_key", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("platform", "text", (col) => col.notNull())
    .addColumn("session_id", "text", (col) => col.notNull())
    .addColumn("model", "text")
    .addColumn("cost_usd", "real")
    .addColumn("input_tokens", "integer")
    .addColumn("output_tokens", "integer")
    .addColumn("cache_read_tokens", "integer")
    .addColumn("cache_creation_tokens", "integer")
    .addColumn("duration_ms", "integer")
    .addColumn("duration_api_ms", "integer")
    .addColumn("num_turns", "integer")
    .addColumn("status", "text", (col) => col.notNull().defaultTo("success"))
    .addColumn("error_type", "text")
    .addColumn("errors_json", "text")
    .addColumn("tools_used_json", "text")
    .addColumn("permission_denials_json", "text")
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await sql`CREATE INDEX idx_agent_runs_user_id ON agent_runs(user_id)`.execute(db);
  await sql`CREATE INDEX idx_agent_runs_created_at ON agent_runs(created_at)`.execute(db);
  await sql`CREATE INDEX idx_agent_runs_platform ON agent_runs(platform)`.execute(db);

  await db.schema
    .createTable("agent_messages")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("run_id", "text", (col) => col.notNull())
    .addColumn("sequence", "integer", (col) => col.notNull())
    .addColumn("role", "text", (col) => col.notNull())
    .addColumn("content_json", "text", (col) => col.notNull())
    .addColumn("tool_use_id", "text")
    .addColumn("tool_name", "text")
    .addColumn("input_tokens", "integer")
    .addColumn("output_tokens", "integer")
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await sql`CREATE INDEX idx_agent_messages_run_id ON agent_messages(run_id)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("agent_messages").execute();
  await db.schema.dropTable("agent_runs").execute();
}
