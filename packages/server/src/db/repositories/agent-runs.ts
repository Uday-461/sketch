import type { Insertable, Kysely, Selectable } from "kysely";
import { sql } from "kysely";
import type { AgentMessagesTable, AgentRunsTable, DB } from "../schema";

export function createAgentRunRepository(db: Kysely<DB>) {
  return {
    async insertRun(run: Insertable<AgentRunsTable>): Promise<void> {
      await db.insertInto("agent_runs").values(run).execute();
    },

    async insertMessages(messages: Insertable<AgentMessagesTable>[]): Promise<void> {
      if (messages.length === 0) return;
      await db.insertInto("agent_messages").values(messages).execute();
    },

    async listRuns(filters: {
      userId?: string;
      platform?: string;
      limit?: number;
      offset?: number;
    }): Promise<{ runs: Selectable<AgentRunsTable>[]; total: number }> {
      let query = db.selectFrom("agent_runs").selectAll();
      let countQuery = db.selectFrom("agent_runs").select(sql<number>`count(*)`.as("count"));

      if (filters.userId) {
        query = query.where("user_id", "=", filters.userId);
        countQuery = countQuery.where("user_id", "=", filters.userId);
      }
      if (filters.platform) {
        query = query.where("platform", "=", filters.platform);
        countQuery = countQuery.where("platform", "=", filters.platform);
      }

      const countResult = await countQuery.executeTakeFirstOrThrow();
      const total = Number(countResult.count);

      const runs = await query
        .orderBy("created_at", "desc")
        .limit(filters.limit ?? 50)
        .offset(filters.offset ?? 0)
        .execute();

      return { runs, total };
    },

    async getRun(id: string): Promise<Selectable<AgentRunsTable> | null> {
      const row = await db.selectFrom("agent_runs").selectAll().where("id", "=", id).executeTakeFirst();
      return row ?? null;
    },

    async getRunMessages(runId: string): Promise<Selectable<AgentMessagesTable>[]> {
      return db
        .selectFrom("agent_messages")
        .selectAll()
        .where("run_id", "=", runId)
        .orderBy("sequence", "asc")
        .execute();
    },

    async getStats(days: number): Promise<{
      totalCost: number;
      totalRuns: number;
      errorCount: number;
      activeUserIds: string[];
    }> {
      const since = new Date(Date.now() - days * 86_400_000).toISOString();

      const result = await db
        .selectFrom("agent_runs")
        .select([
          sql<number>`coalesce(sum(cost_usd), 0)`.as("total_cost"),
          sql<number>`count(*)`.as("total_runs"),
          sql<number>`sum(case when status = 'error' then 1 else 0 end)`.as("error_count"),
        ])
        .where("created_at", ">=", since)
        .executeTakeFirstOrThrow();

      const userRows = await db
        .selectFrom("agent_runs")
        .select("user_id")
        .distinct()
        .where("created_at", ">=", since)
        .where("user_id", "is not", null)
        .execute();

      return {
        totalCost: Number(result.total_cost),
        totalRuns: Number(result.total_runs),
        errorCount: Number(result.error_count),
        activeUserIds: userRows.map((r) => r.user_id).filter((id): id is string => Boolean(id)),
      };
    },
  };
}
