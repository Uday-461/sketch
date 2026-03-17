import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../test-utils";
import type { DB } from "../schema";
import { createAgentRunRepository } from "./agent-runs";

describe("agent-runs repository", () => {
  let db: Kysely<DB>;
  let repo: ReturnType<typeof createAgentRunRepository>;

  beforeEach(async () => {
    db = await createTestDb();
    repo = createAgentRunRepository(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  function makeRun(overrides: Record<string, unknown> = {}) {
    return {
      id: randomUUID(),
      user_id: "user-1",
      workspace_key: "user-1",
      thread_key: "",
      platform: "slack",
      session_id: "sess-1",
      model: "claude-sonnet-4-20250514",
      cost_usd: 0.05,
      input_tokens: 1000,
      output_tokens: 500,
      cache_read_tokens: 200,
      cache_creation_tokens: 100,
      duration_ms: 5000,
      duration_api_ms: 4000,
      num_turns: 3,
      status: "success",
      error_type: null,
      errors_json: null,
      tools_used_json: JSON.stringify(["Read", "Write"]),
      permission_denials_json: null,
      ...overrides,
    };
  }

  describe("insertRun + getRun", () => {
    it("inserts and retrieves a run", async () => {
      const run = makeRun();
      await repo.insertRun(run);

      const retrieved = await repo.getRun(run.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(run.id);
      expect(retrieved?.user_id).toBe("user-1");
      expect(retrieved?.platform).toBe("slack");
      expect(retrieved?.cost_usd).toBe(0.05);
      expect(retrieved?.status).toBe("success");
    });

    it("returns null for non-existent run", async () => {
      const result = await repo.getRun("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("insertMessages + getRunMessages", () => {
    it("inserts and retrieves messages in order", async () => {
      const run = makeRun();
      await repo.insertRun(run);

      const messages = [
        {
          id: randomUUID(),
          run_id: run.id,
          sequence: 0,
          role: "user",
          content_json: JSON.stringify("Hello"),
          tool_use_id: null,
          tool_name: null,
          input_tokens: null,
          output_tokens: null,
        },
        {
          id: randomUUID(),
          run_id: run.id,
          sequence: 1,
          role: "assistant",
          content_json: JSON.stringify([{ type: "text", text: "Hi there" }]),
          tool_use_id: null,
          tool_name: null,
          input_tokens: 100,
          output_tokens: 50,
        },
      ];

      await repo.insertMessages(messages);

      const retrieved = await repo.getRunMessages(run.id);
      expect(retrieved).toHaveLength(2);
      expect(retrieved[0].role).toBe("user");
      expect(retrieved[0].sequence).toBe(0);
      expect(retrieved[1].role).toBe("assistant");
      expect(retrieved[1].sequence).toBe(1);
    });

    it("handles empty messages array", async () => {
      await repo.insertMessages([]);
      // Should not throw
    });
  });

  describe("listRuns", () => {
    it("lists runs ordered by created_at desc", async () => {
      await repo.insertRun(makeRun({ id: "r1" }));
      await repo.insertRun(makeRun({ id: "r2" }));

      const { runs, total } = await repo.listRuns({});
      expect(total).toBe(2);
      expect(runs).toHaveLength(2);
    });

    it("filters by userId", async () => {
      await repo.insertRun(makeRun({ id: "r1", user_id: "u1" }));
      await repo.insertRun(makeRun({ id: "r2", user_id: "u2" }));

      const { runs, total } = await repo.listRuns({ userId: "u1" });
      expect(total).toBe(1);
      expect(runs[0].user_id).toBe("u1");
    });

    it("filters by platform", async () => {
      await repo.insertRun(makeRun({ id: "r1", platform: "slack" }));
      await repo.insertRun(makeRun({ id: "r2", platform: "whatsapp" }));

      const { runs, total } = await repo.listRuns({ platform: "whatsapp" });
      expect(total).toBe(1);
      expect(runs[0].platform).toBe("whatsapp");
    });

    it("supports pagination", async () => {
      for (let i = 0; i < 5; i++) {
        await repo.insertRun(makeRun({ id: `r${i}` }));
      }

      const page1 = await repo.listRuns({ limit: 2, offset: 0 });
      expect(page1.runs).toHaveLength(2);
      expect(page1.total).toBe(5);

      const page2 = await repo.listRuns({ limit: 2, offset: 2 });
      expect(page2.runs).toHaveLength(2);
    });
  });

  describe("getStats", () => {
    it("returns aggregated stats", async () => {
      await repo.insertRun(makeRun({ id: "r1", cost_usd: 0.1, status: "success" }));
      await repo.insertRun(makeRun({ id: "r2", cost_usd: 0.2, status: "error" }));
      await repo.insertRun(makeRun({ id: "r3", cost_usd: 0.05, status: "success", user_id: "u2" }));

      const stats = await repo.getStats(30);
      expect(stats.totalRuns).toBe(3);
      expect(stats.totalCost).toBeCloseTo(0.35);
      expect(stats.errorCount).toBe(1);
      expect(stats.activeUserIds).toHaveLength(2);
      expect(stats.activeUserIds).toContain("user-1");
      expect(stats.activeUserIds).toContain("u2");
    });

    it("returns zeros when no runs exist", async () => {
      const stats = await repo.getStats(30);
      expect(stats.totalRuns).toBe(0);
      expect(stats.totalCost).toBe(0);
      expect(stats.errorCount).toBe(0);
      expect(stats.activeUserIds).toHaveLength(0);
    });
  });
});
