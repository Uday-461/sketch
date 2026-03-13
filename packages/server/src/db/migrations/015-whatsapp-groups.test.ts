import SQLite from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { up } from "./015-whatsapp-groups";

type WhatsAppGroupRow = {
  jid: string;
  name: string;
  description: string | null;
  updated_at: string;
};

function createBlankDb(): Kysely<unknown> {
  return new Kysely<unknown>({
    dialect: new SqliteDialect({ database: new SQLite(":memory:") }),
  });
}

describe("015-whatsapp-groups migration", () => {
  let db: Kysely<unknown>;

  beforeEach(() => {
    db = createBlankDb();
  });

  afterEach(async () => {
    await db.destroy();
  });

  it("creates the whatsapp_groups table and allows insert/query by jid", async () => {
    await up(db);

    await (db as Kysely<{ whatsapp_groups: Omit<WhatsAppGroupRow, "updated_at"> }>)
      .insertInto("whatsapp_groups")
      .values({
        jid: "1234567890@g.us",
        name: "Product Team",
        description: "Roadmap syncs",
      })
      .execute();

    const rows = await (db as Kysely<{ whatsapp_groups: WhatsAppGroupRow }>)
      .selectFrom("whatsapp_groups")
      .selectAll()
      .execute();

    expect(rows).toHaveLength(1);
    expect(rows[0].jid).toBe("1234567890@g.us");
    expect(rows[0].name).toBe("Product Team");
    expect(rows[0].description).toBe("Roadmap syncs");
    expect(rows[0].updated_at).toBeDefined();
  });

  it("stores null descriptions when omitted", async () => {
    await up(db);

    await (db as Kysely<{ whatsapp_groups: { jid: string; name: string } }>)
      .insertInto("whatsapp_groups")
      .values({
        jid: "222@g.us",
        name: "Ops",
      })
      .execute();

    const row = await (db as Kysely<{ whatsapp_groups: WhatsAppGroupRow }>)
      .selectFrom("whatsapp_groups")
      .selectAll()
      .where("jid", "=", "222@g.us")
      .executeTakeFirstOrThrow();

    expect(row.description).toBeNull();
  });
});
