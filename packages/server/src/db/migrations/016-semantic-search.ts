/**
 * Migration 016: Semantic search infrastructure.
 *
 * Adds the schema for embedding-based semantic search:
 * 1. document_chunks — text segments for granular embedding + retrieval
 * 2. document_timeframes — temporal references extracted from documents
 * 3. mime_type + embedding_status columns on indexed_files
 *
 * Note: sqlite-vec virtual tables (chunk_embeddings, file_embeddings) are created
 * outside of Kysely migrations since they require the sqlite-vec extension to be
 * loaded first. See db/index.ts for vec table initialization.
 */
import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // ── 1. document_chunks ─────────────────────────────────────
  await db.schema
    .createTable("document_chunks")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("indexed_file_id", "text", (col) => col.notNull().references("indexed_files.id").onDelete("cascade"))
    .addColumn("chunk_index", "integer", (col) => col.notNull())
    .addColumn("content", "text", (col) => col.notNull())
    .addColumn("token_count", "integer")
    .execute();

  await sql`CREATE UNIQUE INDEX idx_chunks_file_index ON document_chunks(indexed_file_id, chunk_index)`.execute(db);
  await sql`CREATE INDEX idx_chunks_file ON document_chunks(indexed_file_id)`.execute(db);

  // ── 2. document_timeframes ─────────────────────────────────
  await db.schema
    .createTable("document_timeframes")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("indexed_file_id", "text", (col) => col.notNull().references("indexed_files.id").onDelete("cascade"))
    .addColumn("start_date", "text", (col) => col.notNull())
    .addColumn("end_date", "text")
    .addColumn("context", "text")
    .execute();

  await sql`CREATE INDEX idx_timeframes_file ON document_timeframes(indexed_file_id)`.execute(db);
  await sql`CREATE INDEX idx_timeframes_dates ON document_timeframes(start_date, end_date)`.execute(db);

  // ── 3. Add columns to indexed_files ────────────────────────
  await db.schema.alterTable("indexed_files").addColumn("mime_type", "text").execute();
  await db.schema
    .alterTable("indexed_files")
    .addColumn("embedding_status", "text", (col) => col.defaultTo("pending"))
    .execute();

  // ── 4. Add gemini_api_key to settings ──────────────────────
  await db.schema.alterTable("settings").addColumn("gemini_api_key", "text").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("settings").dropColumn("gemini_api_key").execute();
  await db.schema.alterTable("indexed_files").dropColumn("embedding_status").execute();
  await db.schema.alterTable("indexed_files").dropColumn("mime_type").execute();
  await db.schema.dropTable("document_timeframes").execute();
  await db.schema.dropTable("document_chunks").execute();
}
