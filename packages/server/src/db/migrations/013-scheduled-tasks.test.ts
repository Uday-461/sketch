/**
 * Tests for the 013-scheduled-tasks migration.
 *
 * Verifies that up() creates the scheduled_tasks table with correct columns and
 * defaults, and that the status index is created. Each test uses a fresh blank
 * in-memory SQLite database (no schema pre-applied) so up() runs against a blank slate.
 */
import SQLite from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { up } from "./013-scheduled-tasks";

type TaskRow = {
  id: string;
  platform: string;
  context_type: string;
  delivery_target: string;
  thread_ts: string | null;
  prompt: string;
  schedule_type: string;
  schedule_value: string;
  timezone: string;
  session_mode: string;
  next_run_at: string | null;
  last_run_at: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
};

function createBlankDb(): Kysely<unknown> {
  return new Kysely<unknown>({
    dialect: new SqliteDialect({ database: new SQLite(":memory:") }),
  });
}

async function queryTasks(db: Kysely<unknown>): Promise<TaskRow[]> {
  return (db as Kysely<{ scheduled_tasks: TaskRow }>).selectFrom("scheduled_tasks").selectAll().execute();
}

describe("013-scheduled-tasks migration", () => {
  let db: Kysely<unknown>;

  beforeEach(() => {
    db = createBlankDb();
  });

  afterEach(async () => {
    await db.destroy();
  });

  it("creates the scheduled_tasks table and allows inserting and querying rows", async () => {
    await up(db);

    await (db as Kysely<{ scheduled_tasks: Omit<TaskRow, "created_at" | "timezone" | "session_mode" | "status"> }>)
      .insertInto("scheduled_tasks")
      .values({
        id: "task-001",
        platform: "slack",
        context_type: "dm",
        delivery_target: "U123456",
        thread_ts: null,
        prompt: "Check report",
        schedule_type: "cron",
        schedule_value: "0 9 * * 1",
        next_run_at: null,
        last_run_at: null,
        created_by: "U_CREATOR",
      })
      .execute();

    const rows = await queryTasks(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("task-001");
    expect(rows[0].platform).toBe("slack");
    expect(rows[0].delivery_target).toBe("U123456");
  });

  it("applies column defaults for timezone, session_mode, and status", async () => {
    await up(db);

    await (db as Kysely<{ scheduled_tasks: Omit<TaskRow, "created_at" | "timezone" | "session_mode" | "status"> }>)
      .insertInto("scheduled_tasks")
      .values({
        id: "task-002",
        platform: "whatsapp",
        context_type: "group",
        delivery_target: "1234567890@g.us",
        thread_ts: null,
        prompt: "Daily standup",
        schedule_type: "cron",
        schedule_value: "0 9 * * *",
        next_run_at: null,
        last_run_at: null,
        created_by: null,
      })
      .execute();

    const rows = await queryTasks(db);
    expect(rows[0].timezone).toBe("UTC");
    expect(rows[0].session_mode).toBe("fresh");
    expect(rows[0].status).toBe("active");
    expect(rows[0].created_at).toBeDefined();
  });

  it("stores thread_ts as null when not provided", async () => {
    await up(db);

    await (db as Kysely<{ scheduled_tasks: Omit<TaskRow, "created_at" | "timezone" | "session_mode" | "status"> }>)
      .insertInto("scheduled_tasks")
      .values({
        id: "task-003",
        platform: "slack",
        context_type: "channel",
        delivery_target: "C_CHANNEL",
        thread_ts: null,
        prompt: "Weekly digest",
        schedule_type: "interval",
        schedule_value: "3600",
        next_run_at: null,
        last_run_at: null,
        created_by: "U_OWNER",
      })
      .execute();

    const rows = await queryTasks(db);
    expect(rows[0].thread_ts).toBeNull();
  });

  it("the status index exists and supports filtering by status", async () => {
    await up(db);

    type InsertRow = Omit<TaskRow, "created_at" | "timezone" | "session_mode">;
    const insertDb = db as Kysely<{ scheduled_tasks: InsertRow }>;

    await insertDb
      .insertInto("scheduled_tasks")
      .values({
        id: "task-active-1",
        platform: "slack",
        context_type: "dm",
        delivery_target: "U_A",
        thread_ts: null,
        prompt: "Active task",
        schedule_type: "cron",
        schedule_value: "0 9 * * *",
        next_run_at: null,
        last_run_at: null,
        status: "active",
        created_by: null,
      })
      .execute();

    await insertDb
      .insertInto("scheduled_tasks")
      .values({
        id: "task-paused-1",
        platform: "slack",
        context_type: "dm",
        delivery_target: "U_B",
        thread_ts: null,
        prompt: "Paused task",
        schedule_type: "cron",
        schedule_value: "0 9 * * *",
        next_run_at: null,
        last_run_at: null,
        status: "paused",
        created_by: null,
      })
      .execute();

    const active = await (db as Kysely<{ scheduled_tasks: TaskRow }>)
      .selectFrom("scheduled_tasks")
      .selectAll()
      .where("status", "=", "active")
      .execute();

    expect(active).toHaveLength(1);
    expect(active[0].id).toBe("task-active-1");
  });
});
