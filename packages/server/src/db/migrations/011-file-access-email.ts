/**
 * Add provider_email to file_access table.
 *
 * ClickUp (and other providers) expose email addresses for workspace members.
 * Storing the email alongside the numeric provider_user_id gives us a
 * human-readable display name for unmapped users in the access list UI.
 */
import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("file_access").addColumn("provider_email", "text").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("file_access").dropColumn("provider_email").execute();
}
