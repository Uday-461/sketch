import SQLite from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { down, up } from "./017-telegram-discord";

function createDbWithTables(): Kysely<unknown> {
  const db = new Kysely<unknown>({
    dialect: new SqliteDialect({ database: new SQLite(":memory:") }),
  });
  return db;
}

async function seedTables(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("users")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("settings")
    .addColumn("key", "text", (col) => col.primaryKey())
    .execute();
}

describe("017-telegram-discord migration", () => {
  let db: Kysely<unknown>;

  beforeEach(async () => {
    db = createDbWithTables();
    await seedTables(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  it("adds telegram_user_id and discord_user_id columns to users", async () => {
    await up(db);

    type UserRow = { id: string; name: string; telegram_user_id: string | null; discord_user_id: string | null };

    await (db as Kysely<{ users: UserRow }>)
      .insertInto("users")
      .values({ id: "u1", name: "Alice", telegram_user_id: "111222", discord_user_id: "333444" })
      .execute();

    const row = await (db as Kysely<{ users: UserRow }>)
      .selectFrom("users")
      .selectAll()
      .where("id", "=", "u1")
      .executeTakeFirstOrThrow();

    expect(row.telegram_user_id).toBe("111222");
    expect(row.discord_user_id).toBe("333444");
  });

  it("allows null telegram/discord user IDs", async () => {
    await up(db);

    type UserRow = { id: string; name: string; telegram_user_id: string | null; discord_user_id: string | null };

    await (db as Kysely<{ users: UserRow }>).insertInto("users").values({ id: "u2", name: "Bob" }).execute();

    const row = await (db as Kysely<{ users: UserRow }>)
      .selectFrom("users")
      .selectAll()
      .where("id", "=", "u2")
      .executeTakeFirstOrThrow();

    expect(row.telegram_user_id).toBeNull();
    expect(row.discord_user_id).toBeNull();
  });

  it("adds telegram_bot_token and discord_bot_token columns to settings", async () => {
    await up(db);

    type SettingsRow = { key: string; telegram_bot_token: string | null; discord_bot_token: string | null };

    await (db as Kysely<{ settings: SettingsRow }>)
      .insertInto("settings")
      .values({ key: "main", telegram_bot_token: "tg-token", discord_bot_token: "dc-token" })
      .execute();

    const row = await (db as Kysely<{ settings: SettingsRow }>)
      .selectFrom("settings")
      .selectAll()
      .where("key", "=", "main")
      .executeTakeFirstOrThrow();

    expect(row.telegram_bot_token).toBe("tg-token");
    expect(row.discord_bot_token).toBe("dc-token");
  });

  it("down migration drops the added columns", async () => {
    await up(db);
    await down(db);

    // After down, inserting without the new columns should work
    await (db as Kysely<{ users: { id: string; name: string } }>)
      .insertInto("users")
      .values({ id: "u3", name: "Carol" })
      .execute();

    const row = await (db as Kysely<{ users: { id: string; name: string } }>)
      .selectFrom("users")
      .selectAll()
      .where("id", "=", "u3")
      .executeTakeFirstOrThrow();

    expect(row).not.toHaveProperty("telegram_user_id");
    expect(row).not.toHaveProperty("discord_user_id");
  });
});
