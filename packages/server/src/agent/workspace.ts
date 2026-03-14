import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Config } from "../config";

export async function ensureWorkspace(config: Config, userId: string): Promise<string> {
  const workspaceDir = join(config.DATA_DIR, "workspaces", userId);
  await mkdir(workspaceDir, { recursive: true });
  return workspaceDir;
}

export async function ensureChannelWorkspace(config: Config, slackChannelId: string): Promise<string> {
  const workspaceDir = join(config.DATA_DIR, "workspaces", `channel-${slackChannelId}`);
  await mkdir(workspaceDir, { recursive: true });
  return workspaceDir;
}

export async function ensureGroupWorkspace(config: Config, groupJid: string): Promise<string> {
  const groupId = groupJid.replace("@g.us", "");
  const workspaceDir = join(config.DATA_DIR, "workspaces", `wa-group-${groupId}`);
  await mkdir(workspaceDir, { recursive: true });
  return workspaceDir;
}

export async function ensureTelegramGroupWorkspace(config: Config, chatId: string): Promise<string> {
  const workspaceDir = join(config.DATA_DIR, "workspaces", `tg-group-${chatId}`);
  await mkdir(workspaceDir, { recursive: true });
  return workspaceDir;
}

export async function ensureDiscordChannelWorkspace(
  config: Config,
  guildId: string,
  channelId: string,
): Promise<string> {
  const workspaceDir = join(config.DATA_DIR, "workspaces", `discord-${guildId}-${channelId}`);
  await mkdir(workspaceDir, { recursive: true });
  return workspaceDir;
}
