/**
 * Resolve a Slack user to a users table row. Handles three cases:
 * 1. User found by Slack ID (existing). Backfills email if missing.
 * 2. User not found by Slack ID but found by email (admin-created). Links Slack ID.
 * 3. User not found at all. Creates a new row.
 *
 * When linking by email, only links if the matched user doesn't already have
 * a different Slack ID to avoid accidental identity merging.
 */
import type { Logger } from "../logger";

type UserRow = {
  id: string;
  name: string;
  email: string | null;
  slack_user_id: string | null;
  whatsapp_number: string | null;
  created_at: string;
  email_verified_at: string | null;
};

export interface ResolveSlackUserDeps {
  users: {
    findBySlackId(slackUserId: string): Promise<UserRow | undefined>;
    findByEmail(email: string): Promise<UserRow | undefined>;
    create(data: { name: string; slackUserId: string; email: string | null }): Promise<UserRow>;
    update(id: string, data: { slackUserId?: string | null; email?: string | null }): Promise<UserRow>;
  };
  getUserInfo(slackUserId: string): Promise<{ name: string; realName: string; email: string | null }>;
  logger: Logger;
}

export async function resolveSlackUser(slackUserId: string, deps: ResolveSlackUserDeps): Promise<UserRow> {
  const { users, getUserInfo, logger } = deps;

  let user = await users.findBySlackId(slackUserId);
  if (!user) {
    const userInfo = await getUserInfo(slackUserId);
    if (userInfo.email) {
      const existing = await users.findByEmail(userInfo.email);
      if (existing && !existing.slack_user_id) {
        user = await users.update(existing.id, { slackUserId });
        logger.info({ userId: user.id, name: user.name }, "Linked Slack ID to existing user by email");
      }
    }
    if (!user) {
      user = await users.create({
        name: userInfo.realName,
        slackUserId,
        email: userInfo.email,
      });
      logger.info({ userId: user.id, name: user.name }, "New user created");
    }
  } else if (!user.email) {
    const userInfo = await getUserInfo(slackUserId);
    if (userInfo.email) {
      user = await users.update(user.id, { email: userInfo.email });
    }
  }
  return user;
}
