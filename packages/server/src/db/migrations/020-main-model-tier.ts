/**
 * Adds main_model_tier column to settings.
 * Controls which SDK model tier the main chat loop uses (haiku/sonnet/opus).
 */
import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("settings")
    .addColumn("main_model_tier", "text", (col) => col.defaultTo("sonnet"))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("settings").dropColumn("main_model_tier").execute();
}
