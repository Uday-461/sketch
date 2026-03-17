import { Hono } from "hono";
import type { Kysely } from "kysely";
import { createAgentRunRepository } from "../db/repositories/agent-runs";
import { createUserRepository } from "../db/repositories/users";
import type { DB } from "../db/schema";
import { requireAdmin } from "./middleware";

export function agentRunRoutes(db: Kysely<DB>) {
  const routes = new Hono();
  const repo = createAgentRunRepository(db);
  const users = createUserRepository(db);

  routes.get("/", async (c) => {
    const role = c.get("role");
    const sub = c.get("sub");

    const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
    const offset = Number(c.req.query("offset") ?? 0);
    const platform = c.req.query("platform");

    const filters: { userId?: string; platform?: string; limit: number; offset: number } = {
      limit,
      offset,
    };

    if (role !== "admin") {
      filters.userId = sub;
    }
    if (platform) {
      filters.platform = platform;
    }

    const { runs, total } = await repo.listRuns(filters);

    const userIds = [...new Set(runs.map((r) => r.user_id).filter((id): id is string => Boolean(id)))];
    const userEntries = await Promise.all(
      userIds.map(async (id) => {
        const user = await users.findById(id);
        return [id, user?.name ?? null] as const;
      }),
    );
    const userNames = new Map(userEntries);

    const summaries = runs.map((run) => ({
      id: run.id,
      userId: run.user_id,
      platform: run.platform,
      model: run.model,
      costUsd: run.cost_usd,
      inputTokens: run.input_tokens,
      outputTokens: run.output_tokens,
      numTurns: run.num_turns,
      durationMs: run.duration_ms,
      status: run.status,
      createdAt: run.created_at,
      userName: run.user_id ? (userNames.get(run.user_id) ?? null) : null,
    }));

    return c.json({ runs: summaries, total });
  });

  routes.get("/stats", requireAdmin(), async (c) => {
    const days = Number(c.req.query("days") ?? 30);
    const stats = await repo.getStats(days);

    return c.json({
      totalCost: stats.totalCost,
      totalRuns: stats.totalRuns,
      errorCount: stats.errorCount,
      activeUsers: stats.activeUserIds.length,
    });
  });

  routes.get("/:id", async (c) => {
    const id = c.req.param("id");
    const role = c.get("role");
    const sub = c.get("sub");

    const run = await repo.getRun(id);
    if (!run) {
      return c.json({ error: { code: "NOT_FOUND", message: "Agent run not found" } }, 404);
    }

    if (role !== "admin" && run.user_id !== sub) {
      return c.json({ error: { code: "FORBIDDEN", message: "You do not have access to this run" } }, 403);
    }

    const messages = await repo.getRunMessages(id);

    return c.json({
      run: {
        id: run.id,
        userId: run.user_id,
        workspaceKey: run.workspace_key,
        threadKey: run.thread_key,
        platform: run.platform,
        sessionId: run.session_id,
        model: run.model,
        costUsd: run.cost_usd,
        inputTokens: run.input_tokens,
        outputTokens: run.output_tokens,
        cacheReadTokens: run.cache_read_tokens,
        cacheCreationTokens: run.cache_creation_tokens,
        durationMs: run.duration_ms,
        durationApiMs: run.duration_api_ms,
        numTurns: run.num_turns,
        status: run.status,
        errorType: run.error_type,
        errorsJson: run.errors_json,
        toolsUsedJson: run.tools_used_json,
        permissionDenialsJson: run.permission_denials_json,
        createdAt: run.created_at,
      },
      messages: messages.map((m) => ({
        id: m.id,
        runId: m.run_id,
        sequence: m.sequence,
        role: m.role,
        contentJson: m.content_json,
        toolUseId: m.tool_use_id,
        toolName: m.tool_name,
        inputTokens: m.input_tokens,
        outputTokens: m.output_tokens,
        createdAt: m.created_at,
      })),
    });
  });

  return routes;
}
