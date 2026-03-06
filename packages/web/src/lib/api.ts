/**
 * Typed API client for the control plane backend.
 * All methods throw on non-2xx responses with the standard error shape.
 */

import type { SkillCategory } from "@/lib/skills-data";

export interface ApiError {
  error: { code: string; message: string };
}

export interface User {
  id: string;
  name: string;
  email: string | null;
  slack_user_id: string | null;
  whatsapp_number: string | null;
  created_at: string;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: { code: "UNKNOWN", message: res.statusText } }))) as ApiError;
    throw new Error(body.error.message);
  }

  return res.json() as Promise<T>;
}

export interface ChannelStatus {
  platform: "slack" | "whatsapp" | "email";
  configured: boolean;
  connected: boolean | null;
  phoneNumber: string | null;
  fromAddress: string | null;
}

export interface SetupStatus {
  completed: boolean;
  currentStep: number;
  adminEmail: string | null;
  orgName: string | null;
  botName: string;
  slackConnected: boolean;
  llmConnected: boolean;
  llmProvider: "anthropic" | "bedrock" | null;
}

export interface ConnectorConfig {
  id: string;
  connectorType: string;
  authType: string;
  scopeConfig: Record<string, unknown>;
  teamAccess: string[] | null;
  syncStatus: "active" | "syncing" | "error" | "paused" | "pending";
  lastSyncedAt: string | null;
  errorMessage: string | null;
  createdBy: string;
  createdAt: string;
  fileCount?: number;
}

export interface ConnectorFile {
  id: string;
  fileName: string;
  fileType: string | null;
  contentCategory: "document" | "structured";
  source: string;
  sourcePath: string | null;
  providerUrl: string | null;
  syncedAt: string;
  sourceUpdatedAt: string | null;
  hasSummary: boolean;
  accessScope: "restricted" | "unrestricted";
  accessCount: number | null;
}

export interface FileContent {
  id: string;
  fileName: string;
  fileType: string | null;
  content: string | null;
  summary: string | null;
  contextNote: string | null;
  tags: string | null;
  source: string;
  sourcePath: string | null;
  providerUrl: string | null;
  enrichmentStatus: string;
}

export interface FileAccessMember {
  providerUserId: string;
  providerEmail: string | null;
  userName: string | null;
  userId: string | null;
  mapped: boolean;
}

/** A file with its parent connector metadata — returned by the paginated all-files endpoint. */
export interface UnifiedFile extends ConnectorFile {
  connectorId: string;
  connectorType: string;
}

export interface FileAccess {
  scope: "restricted" | "unrestricted";
  members: FileAccessMember[];
}

export interface ProviderIdentity {
  id: string;
  provider: string;
  providerUserId: string;
  providerEmail: string | null;
  connectedAt: string;
  hasToken: boolean;
}

export interface SkillRecord {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  body: string;
}

export const api = {
  setup: {
    status() {
      return request<SetupStatus>("/api/setup/status");
    },
    verifySlack(botToken: string, appToken: string) {
      return request<{ success: boolean; workspaceName?: string }>("/api/setup/slack/verify", {
        method: "POST",
        body: JSON.stringify({ botToken, appToken }),
      });
    },
    verifyLlm(
      data:
        | { provider: "anthropic"; apiKey: string }
        | { provider: "bedrock"; awsAccessKeyId: string; awsSecretAccessKey: string; awsRegion: string },
    ) {
      return request<{ success: boolean }>("/api/setup/llm/verify", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    createAccount(email: string, password: string) {
      return request<{ success: boolean }>("/api/setup/account", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
    },
    identity(orgName: string, botName: string) {
      return request<{ success: boolean }>("/api/setup/identity", {
        method: "POST",
        body: JSON.stringify({ orgName, botName }),
      });
    },
    slack(botToken: string, appToken: string) {
      return request<{ success: boolean }>("/api/setup/slack", {
        method: "POST",
        body: JSON.stringify({ botToken, appToken }),
      });
    },
    llm(
      data:
        | { provider: "anthropic"; apiKey: string }
        | { provider: "bedrock"; awsAccessKeyId: string; awsSecretAccessKey: string; awsRegion: string },
    ) {
      return request<{ success: boolean }>("/api/setup/llm", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    complete() {
      return request<{ success: boolean }>("/api/setup/complete", {
        method: "POST",
      });
    },
  },
  auth: {
    login(email: string, password: string) {
      return request<{ authenticated: boolean; email: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
    },
    logout() {
      return request<{ authenticated: boolean }>("/api/auth/logout", { method: "POST" });
    },
    session() {
      return request<{ authenticated: boolean; email?: string }>("/api/auth/session");
    },
  },
  channels: {
    status() {
      return request<{ channels: ChannelStatus[] }>("/api/channels/status");
    },
    disconnectSlack() {
      return request<{ success: boolean }>("/api/channels/slack", { method: "DELETE" });
    },
  },
  email: {
    verifySmtp(data: { host: string; port: number; user: string; pass: string; from: string; secure: boolean }) {
      return request<{ success: boolean }>("/api/channels/email/verify", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    configure(data: { host: string; port: number; user: string; pass: string; from: string; secure: boolean }) {
      return request<{ success: boolean }>("/api/channels/email/configure", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    disconnect() {
      return request<{ success: boolean }>("/api/channels/email/configure", { method: "DELETE" });
    },
    sendCode(email: string) {
      return request<{ success: boolean }>("/api/channels/email/send-code", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
    },
    verifyCode(email: string, code: string) {
      return request<{ success: boolean; email: string }>("/api/channels/email/verify-code", {
        method: "POST",
        body: JSON.stringify({ email, code }),
      });
    },
  },
  whatsapp: {
    status() {
      return request<{ connected: boolean; phoneNumber: string | null }>("/api/channels/whatsapp");
    },
    cancelPairing() {
      return request<{ success: boolean }>("/api/channels/whatsapp/pair", { method: "DELETE" });
    },
    disconnect() {
      return request<{ success: boolean }>("/api/channels/whatsapp", { method: "DELETE" });
    },
  },
  settings: {
    identity() {
      return request<{ orgName: string | null; botName: string }>("/api/settings/identity");
    },
  },
  integrations: {
    list() {
      return request<{ connectors: ConnectorConfig[] }>("/api/connectors");
    },
    get(id: string) {
      return request<{ connector: ConnectorConfig }>(`/api/connectors/${id}`);
    },
    connect(data: {
      connectorType: string;
      authType: string;
      credentials: Record<string, unknown>;
      scopeConfig?: Record<string, unknown>;
    }) {
      return request<{ connector: { id: string; connectorType: string; syncStatus: string } }>("/api/connectors", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    disconnect(id: string) {
      return request<{ success: boolean }>(`/api/connectors/${id}`, { method: "DELETE" });
    },
    sync(id: string) {
      return request<{ message: string; connectorId: string }>(`/api/connectors/${id}/sync`, { method: "POST" });
    },
    files(id: string) {
      return request<{ files: ConnectorFile[] }>(`/api/connectors/${id}/files`);
    },
    allFiles(opts?: { limit?: number; offset?: number; source?: string }) {
      const params = new URLSearchParams();
      if (opts?.limit) params.set("limit", String(opts.limit));
      if (opts?.offset) params.set("offset", String(opts.offset));
      if (opts?.source) params.set("source", opts.source);
      const qs = params.toString();
      return request<{ files: UnifiedFile[]; total: number; hasMore: boolean }>(
        `/api/connectors/all-files${qs ? `?${qs}` : ""}`,
      );
    },
    fileContent(fileId: string) {
      return request<{ file: FileContent; access: FileAccess }>(`/api/connectors/files/${fileId}/content`);
    },
    enrich(id: string, data: { fileIds: string[]; instruction: string }) {
      return request<{ success: boolean; jobId: string }>(`/api/connectors/${id}/enrich`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    browseGoogleDrive(credentials: { client_id: string; client_secret: string; refresh_token: string }) {
      return request<{
        sharedDrives: Array<{ id: string; name: string }>;
        rootFolders: Array<{ id: string; name: string }>;
      }>("/api/connectors/google-drive/browse", {
        method: "POST",
        body: JSON.stringify({ credentials }),
      });
    },
    browseGoogleDriveExisting(connectorId: string) {
      return request<{
        sharedDrives: Array<{ id: string; name: string; selected: boolean }>;
        rootFolders: Array<{ id: string; name: string; selected: boolean }>;
      }>(`/api/connectors/google-drive/browse/${connectorId}`);
    },
    updateScope(id: string, scopeConfig: Record<string, unknown>) {
      return request<{
        connector: { id: string; connectorType: string; scopeConfig: Record<string, unknown>; syncStatus: string };
      }>(`/api/connectors/${id}/scope`, {
        method: "PATCH",
        body: JSON.stringify({ scopeConfig }),
      });
    },
  },
  identities: {
    listForUser(userId: string) {
      return request<{ identities: ProviderIdentity[] }>(`/api/identities/user/${userId}`);
    },
    connect(data: { userId: string; provider: string; providerUserId: string; providerEmail?: string | null }) {
      return request<{ identity: ProviderIdentity }>("/api/identities/connect", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    disconnect(userId: string, provider: string) {
      return request<{ success: boolean }>(`/api/identities/user/${userId}/provider/${provider}`, {
        method: "DELETE",
      });
    },
  },
  users: {
    list() {
      return request<{ users: User[] }>("/api/users");
    },
    create(data: { name: string; email?: string; whatsappNumber?: string }) {
      return request<{ user: User }>("/api/users", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    update(id: string, data: { name?: string; email?: string | null; whatsappNumber?: string | null }) {
      return request<{ user: User }>(`/api/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    remove(id: string) {
      return request<{ success: boolean }>(`/api/users/${id}`, {
        method: "DELETE",
      });
    },
  },
  skills: {
    list() {
      return request<{ skills: SkillRecord[] }>("/api/skills");
    },
    get(id: string) {
      return request<{ skill: SkillRecord }>(`/api/skills/${id}`);
    },
    create(data: { name: string; description: string; category: SkillRecord["category"]; body: string; id?: string }) {
      return request<{ skill: SkillRecord }>("/api/skills", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    update(id: string, data: { name: string; description: string; category: SkillRecord["category"]; body: string }) {
      return request<{ skill: SkillRecord }>(`/api/skills/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },
    remove(id: string) {
      return request<{ success: true }>(`/api/skills/${id}`, { method: "DELETE" });
    },
  },
};
