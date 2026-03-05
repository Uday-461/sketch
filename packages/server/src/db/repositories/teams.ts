/**
 * Repository for teams and user_teams tables.
 * Handles team CRUD, user↔team assignment, and access resolution.
 */
import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { DB } from "../schema";

export function createTeamRepository(db: Kysely<DB>) {
  return {
    /** List all teams. */
    async list() {
      return db.selectFrom("teams").selectAll().orderBy("name", "asc").execute();
    },

    /** Find a team by ID. */
    async findById(id: string) {
      return db.selectFrom("teams").selectAll().where("id", "=", id).executeTakeFirst();
    },

    /** Find a team by name (case-insensitive). */
    async findByName(name: string) {
      return db.selectFrom("teams").selectAll().where("name", "=", name).executeTakeFirst();
    },

    /** Create a new team. */
    async create(name: string) {
      const id = randomUUID();
      await db.insertInto("teams").values({ id, name }).execute();

      return db.selectFrom("teams").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
    },

    /** Rename a team. */
    async rename(id: string, name: string) {
      await db.updateTable("teams").set({ name }).where("id", "=", id).execute();
      return db.selectFrom("teams").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
    },

    /** Delete a team (cascades user_teams rows via ON DELETE CASCADE). */
    async remove(id: string) {
      // Clean up user_teams first (SQLite foreign key enforcement varies)
      await db.deleteFrom("user_teams").where("team_id", "=", id).execute();
      return db.deleteFrom("teams").where("id", "=", id).execute();
    },

    /** Add a user to a team. Idempotent — ignores if already a member. */
    async addUser(userId: string, teamId: string) {
      const existing = await db
        .selectFrom("user_teams")
        .selectAll()
        .where("user_id", "=", userId)
        .where("team_id", "=", teamId)
        .executeTakeFirst();

      if (existing) return;

      await db.insertInto("user_teams").values({ user_id: userId, team_id: teamId }).execute();
    },

    /** Remove a user from a team. */
    async removeUser(userId: string, teamId: string) {
      await db.deleteFrom("user_teams").where("user_id", "=", userId).where("team_id", "=", teamId).execute();
    },

    /** Get all team IDs for a user. */
    async getTeamIdsForUser(userId: string): Promise<string[]> {
      const rows = await db.selectFrom("user_teams").select("team_id").where("user_id", "=", userId).execute();

      return rows.map((r) => r.team_id);
    },

    /** Get all user IDs in a team. */
    async getUserIdsInTeam(teamId: string): Promise<string[]> {
      const rows = await db.selectFrom("user_teams").select("user_id").where("team_id", "=", teamId).execute();

      return rows.map((r) => r.user_id);
    },

    /** Get teams with member counts. Used by admin API. */
    async listWithCounts() {
      const teams = await db.selectFrom("teams").selectAll().orderBy("name", "asc").execute();

      const counts = await db
        .selectFrom("user_teams")
        .select(["team_id"])
        .select(db.fn.count("user_id").as("member_count"))
        .groupBy("team_id")
        .execute();

      const countMap = new Map(counts.map((c) => [c.team_id, Number(c.member_count)]));

      return teams.map((t) => ({
        ...t,
        memberCount: countMap.get(t.id) ?? 0,
      }));
    },

    /**
     * Resolve which connector config IDs a user can access.
     * Returns null if the user has no team membership (meaning: apply no team filter,
     * but only show unrestricted connectors).
     *
     * Logic:
     * - Get user's team IDs
     * - Find connector_configs where team_access is null (unrestricted)
     *   OR team_access JSON array contains any of the user's team IDs
     */
    async getAccessibleConnectorIds(userId: string): Promise<string[]> {
      const teamIds = await this.getTeamIdsForUser(userId);

      // All connectors with null team_access are unrestricted
      const unrestricted = await db
        .selectFrom("connector_configs")
        .select("id")
        .where("team_access", "is", null)
        .execute();

      const unrestrictedIds = unrestricted.map((r) => r.id);

      if (teamIds.length === 0) {
        // User has no teams — only unrestricted connectors
        return unrestrictedIds;
      }

      // Find connectors whose team_access JSON contains any of the user's team IDs.
      // SQLite JSON: use json_each to expand the array and check for membership.
      const restricted = await db
        .selectFrom("connector_configs")
        .select("id")
        .where("team_access", "is not", null)
        .execute();

      const matchedIds: string[] = [];
      for (const row of restricted) {
        // Load the config to check team_access
        const config = await db
          .selectFrom("connector_configs")
          .select("team_access")
          .where("id", "=", row.id)
          .executeTakeFirst();

        if (!config?.team_access) continue;

        try {
          const accessTeams = JSON.parse(config.team_access) as string[];
          if (Array.isArray(accessTeams) && accessTeams.some((t) => teamIds.includes(t))) {
            matchedIds.push(row.id);
          }
        } catch {
          // Invalid JSON — skip this connector
        }
      }

      return [...unrestrictedIds, ...matchedIds];
    },
  };
}
