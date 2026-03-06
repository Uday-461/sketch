/**
 * Teams API — manage teams for connector RBAC.
 *
 * Admin-facing endpoints for:
 * - CRUD on teams
 * - Assigning/removing users from teams
 * - Viewing team membership
 */
import { Hono } from "hono";
import { z } from "zod";
import type { createConnectorRepository } from "../db/repositories/connectors";
import type { createTeamRepository } from "../db/repositories/teams";
import type { createUserRepository } from "../db/repositories/users";

type TeamRepo = ReturnType<typeof createTeamRepository>;
type UserRepo = ReturnType<typeof createUserRepository>;
type ConnectorRepo = ReturnType<typeof createConnectorRepository>;

const createTeamSchema = z.object({
  name: z.string().min(1, "Team name is required").max(100),
});

const renameTeamSchema = z.object({
  name: z.string().min(1, "Team name is required").max(100),
});

const memberSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
});

const teamAccessSchema = z.object({
  teamIds: z.array(z.string()).nullable(),
});

export function teamRoutes(teamRepo: TeamRepo, userRepo: UserRepo, connectorRepo: ConnectorRepo) {
  const routes = new Hono();

  /** List all teams with member counts. */
  routes.get("/", async (c) => {
    const teams = await teamRepo.listWithCounts();
    return c.json({ teams });
  });

  /** Get a single team with its members. */
  routes.get("/:id", async (c) => {
    const team = await teamRepo.findById(c.req.param("id"));
    if (!team) {
      return c.json({ error: { code: "NOT_FOUND", message: "Team not found" } }, 404);
    }

    const userIds = await teamRepo.getUserIdsInTeam(team.id);
    const members = await Promise.all(
      userIds.map(async (uid) => {
        const user = await userRepo.findById(uid);
        return user ? { id: user.id, name: user.name, email: user.email } : null;
      }),
    );

    return c.json({
      team: {
        id: team.id,
        name: team.name,
        createdAt: team.created_at,
        members: members.filter(Boolean),
      },
    });
  });

  /** Create a new team. */
  routes.post("/", async (c) => {
    const body = await c.req.json();
    const parsed = createTeamSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Invalid request";
      return c.json({ error: { code: "VALIDATION_ERROR", message } }, 400);
    }

    const existing = await teamRepo.findByName(parsed.data.name);
    if (existing) {
      return c.json({ error: { code: "CONFLICT", message: "A team with this name already exists" } }, 409);
    }

    const team = await teamRepo.create(parsed.data.name);
    return c.json({ team }, 201);
  });

  /** Rename a team. */
  routes.patch("/:id", async (c) => {
    const team = await teamRepo.findById(c.req.param("id"));
    if (!team) {
      return c.json({ error: { code: "NOT_FOUND", message: "Team not found" } }, 404);
    }

    const body = await c.req.json();
    const parsed = renameTeamSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Invalid request";
      return c.json({ error: { code: "VALIDATION_ERROR", message } }, 400);
    }

    if (parsed.data.name !== team.name) {
      const existing = await teamRepo.findByName(parsed.data.name);
      if (existing) {
        return c.json({ error: { code: "CONFLICT", message: "A team with this name already exists" } }, 409);
      }
    }

    const updated = await teamRepo.rename(team.id, parsed.data.name);
    return c.json({ team: updated });
  });

  /** Delete a team. */
  routes.delete("/:id", async (c) => {
    const team = await teamRepo.findById(c.req.param("id"));
    if (!team) {
      return c.json({ error: { code: "NOT_FOUND", message: "Team not found" } }, 404);
    }
    await teamRepo.remove(team.id);
    return c.json({ success: true });
  });

  /** Add a user to a team. */
  routes.post("/:id/members", async (c) => {
    const team = await teamRepo.findById(c.req.param("id"));
    if (!team) {
      return c.json({ error: { code: "NOT_FOUND", message: "Team not found" } }, 404);
    }

    const body = await c.req.json();
    const parsed = memberSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Invalid request";
      return c.json({ error: { code: "VALIDATION_ERROR", message } }, 400);
    }

    const user = await userRepo.findById(parsed.data.userId);
    if (!user) {
      return c.json({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);
    }

    await teamRepo.addUser(user.id, team.id);
    return c.json({ success: true });
  });

  /** Remove a user from a team. */
  routes.delete("/:id/members/:userId", async (c) => {
    const team = await teamRepo.findById(c.req.param("id"));
    if (!team) {
      return c.json({ error: { code: "NOT_FOUND", message: "Team not found" } }, 404);
    }

    await teamRepo.removeUser(c.req.param("userId"), team.id);
    return c.json({ success: true });
  });

  /** Update team_access on a connector. */
  routes.put("/connectors/:connectorId/access", async (c) => {
    const config = await connectorRepo.findConfigById(c.req.param("connectorId"));
    if (!config) {
      return c.json({ error: { code: "NOT_FOUND", message: "Connector not found" } }, 404);
    }

    const body = await c.req.json();
    const parsed = teamAccessSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Invalid request";
      return c.json({ error: { code: "VALIDATION_ERROR", message } }, 400);
    }

    // Validate all team IDs exist
    if (parsed.data.teamIds) {
      for (const teamId of parsed.data.teamIds) {
        const team = await teamRepo.findById(teamId);
        if (!team) {
          return c.json({ error: { code: "NOT_FOUND", message: `Team ${teamId} not found` } }, 404);
        }
      }
    }

    await connectorRepo.updateConfig(config.id, {
      teamAccess: parsed.data.teamIds ? JSON.stringify(parsed.data.teamIds) : null,
    });

    return c.json({ success: true });
  });

  return routes;
}
