import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("settings").addColumn("litellm_api_key", "text").execute();
  await db.schema.alterTable("settings").addColumn("litellm_model", "text").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("settings").dropColumn("litellm_api_key").execute();
  await db.schema.alterTable("settings").dropColumn("litellm_model").execute();
}
