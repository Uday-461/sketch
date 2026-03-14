import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("users").addColumn("telegram_user_id", "text").execute();
  await db.schema.alterTable("users").addColumn("discord_user_id", "text").execute();
  await db.schema.alterTable("settings").addColumn("telegram_bot_token", "text").execute();
  await db.schema.alterTable("settings").addColumn("discord_bot_token", "text").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("users").dropColumn("telegram_user_id").execute();
  await db.schema.alterTable("users").dropColumn("discord_user_id").execute();
  await db.schema.alterTable("settings").dropColumn("telegram_bot_token").execute();
  await db.schema.alterTable("settings").dropColumn("discord_bot_token").execute();
}
