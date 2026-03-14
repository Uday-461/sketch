/**
 * No-op: SMTP columns are now created in 010-settings-extended.
 * Kept for migration history compatibility.
 */
import type { Kysely } from "kysely";

export async function up(_db: Kysely<unknown>): Promise<void> {}

export async function down(_db: Kysely<unknown>): Promise<void> {}
