/**
 * Adds model usage, LiteLLM cost, and SDK events columns to agent_runs.
 *
 * - model_usage_json: SDK's per-model token/cost breakdown (Anthropic rates)
 * - litellm_cost_usd: actual provider cost from LiteLLM /spend/logs
 * - sdk_events_json: captured SDK events (subagent tasks, compaction, hooks)
 */
import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("agent_runs")
    .addColumn("model_usage_json", "text")
    .addColumn("litellm_cost_usd", "real")
    .addColumn("sdk_events_json", "text")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("agent_runs").dropColumn("model_usage_json").execute();
  await db.schema.alterTable("agent_runs").dropColumn("litellm_cost_usd").execute();
  await db.schema.alterTable("agent_runs").dropColumn("sdk_events_json").execute();
}
