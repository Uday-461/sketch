import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { PostgresJSDialect } from "kysely-postgres-js";
import pg from "postgres";
import type { Config } from "../config";
import type { DB } from "./schema";

export function createDatabase(config: Config): Kysely<DB> {
  if (config.DB_TYPE === "postgres") {
    return new Kysely<DB>({
      dialect: new PostgresJSDialect({
        connectionString: config.DATABASE_URL as string,
        postgres: pg,
        options: {
          types: {
            date: { to: 25, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
            timestamp: { to: 25, from: [1114], serialize: (x: string) => x, parse: (x: string) => x },
            timestamptz: { to: 25, from: [1184], serialize: (x: string) => x, parse: (x: string) => x },
          },
        },
      }),
    });
  }

  mkdirSync(dirname(config.SQLITE_PATH), { recursive: true });
  const sqlite = new Database(config.SQLITE_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return new Kysely<DB>({ dialect: new SqliteDialect({ database: sqlite }) });
}
