/**
 * Add source_path to the FTS5 index so folder-based searches work natively.
 * Requires rebuilding the FTS table and its triggers.
 */
import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
	// Drop old triggers
	await sql`DROP TRIGGER IF EXISTS indexed_files_au`.execute(db);
	await sql`DROP TRIGGER IF EXISTS indexed_files_ad`.execute(db);
	await sql`DROP TRIGGER IF EXISTS indexed_files_ai`.execute(db);

	// Drop old FTS table
	await sql`DROP TABLE IF EXISTS indexed_files_fts`.execute(db);

	// Recreate with source_path added
	await sql`
		CREATE VIRTUAL TABLE indexed_files_fts USING fts5(
			file_name,
			summary,
			tags,
			source,
			source_path,
			content='indexed_files',
			content_rowid='rowid'
		)
	`.execute(db);

	// Rebuild triggers with source_path
	await sql`
		CREATE TRIGGER indexed_files_ai AFTER INSERT ON indexed_files BEGIN
			INSERT INTO indexed_files_fts(rowid, file_name, summary, tags, source, source_path)
			VALUES (new.rowid, new.file_name, new.summary, new.tags, new.source, new.source_path);
		END
	`.execute(db);

	await sql`
		CREATE TRIGGER indexed_files_ad AFTER DELETE ON indexed_files BEGIN
			INSERT INTO indexed_files_fts(indexed_files_fts, rowid, file_name, summary, tags, source, source_path)
			VALUES ('delete', old.rowid, old.file_name, old.summary, old.tags, old.source, old.source_path);
		END
	`.execute(db);

	await sql`
		CREATE TRIGGER indexed_files_au AFTER UPDATE ON indexed_files BEGIN
			INSERT INTO indexed_files_fts(indexed_files_fts, rowid, file_name, summary, tags, source, source_path)
			VALUES ('delete', old.rowid, old.file_name, old.summary, old.tags, old.source, old.source_path);
			INSERT INTO indexed_files_fts(rowid, file_name, summary, tags, source, source_path)
			VALUES (new.rowid, new.file_name, new.summary, new.tags, new.source, new.source_path);
		END
	`.execute(db);

	// Rebuild FTS index from existing data
	await sql`INSERT INTO indexed_files_fts(indexed_files_fts) VALUES ('rebuild')`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
	await sql`DROP TRIGGER IF EXISTS indexed_files_au`.execute(db);
	await sql`DROP TRIGGER IF EXISTS indexed_files_ad`.execute(db);
	await sql`DROP TRIGGER IF EXISTS indexed_files_ai`.execute(db);
	await sql`DROP TABLE IF EXISTS indexed_files_fts`.execute(db);

	// Recreate original without source_path
	await sql`
		CREATE VIRTUAL TABLE indexed_files_fts USING fts5(
			file_name, summary, tags, source,
			content='indexed_files', content_rowid='rowid'
		)
	`.execute(db);

	await sql`
		CREATE TRIGGER indexed_files_ai AFTER INSERT ON indexed_files BEGIN
			INSERT INTO indexed_files_fts(rowid, file_name, summary, tags, source)
			VALUES (new.rowid, new.file_name, new.summary, new.tags, new.source);
		END
	`.execute(db);

	await sql`
		CREATE TRIGGER indexed_files_ad AFTER DELETE ON indexed_files BEGIN
			INSERT INTO indexed_files_fts(indexed_files_fts, rowid, file_name, summary, tags, source)
			VALUES ('delete', old.rowid, old.file_name, old.summary, old.tags, old.source);
		END
	`.execute(db);

	await sql`
		CREATE TRIGGER indexed_files_au AFTER UPDATE ON indexed_files BEGIN
			INSERT INTO indexed_files_fts(indexed_files_fts, rowid, file_name, summary, tags, source)
			VALUES ('delete', old.rowid, old.file_name, old.summary, old.tags, old.source);
			INSERT INTO indexed_files_fts(rowid, file_name, summary, tags, source)
			VALUES (new.rowid, new.file_name, new.summary, new.tags, new.source);
		END
	`.execute(db);

	await sql`INSERT INTO indexed_files_fts(indexed_files_fts) VALUES ('rebuild')`.execute(db);
}
