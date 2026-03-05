/**
 * Add enrichment tracking columns to indexed_files.
 * - context_note: user/admin-provided context for a file
 * - enrichment_status: tracks LLM enrichment state ('raw', 'enriching', 'enriched', 'failed')
 */
import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("indexed_files").addColumn("context_note", "text").execute();

  await db.schema
    .alterTable("indexed_files")
    .addColumn("enrichment_status", "text", (col) => col.notNull().defaultTo("raw"))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // SQLite doesn't support DROP COLUMN before 3.35.0, but Kysely handles this
  await sql`ALTER TABLE indexed_files DROP COLUMN context_note`.execute(db);
  await sql`ALTER TABLE indexed_files DROP COLUMN enrichment_status`.execute(db);
}
