import type { Generated } from "kysely";

export interface UsersTable {
  id: string;
  name: string;
  email: string | null;
  slack_user_id: string | null;
  whatsapp_number: string | null;
  created_at: Generated<string>;
}

export interface ChannelsTable {
  id: string;
  slack_channel_id: string;
  name: string;
  type: string;
  created_at: Generated<string>;
}

export interface WhatsAppCredsTable {
  id: string;
  creds: string;
  updated_at: Generated<string>;
}

export interface WhatsAppKeysTable {
  type: string;
  key_id: string;
  value: string;
}

export interface SettingsTable {
  id: string;
  admin_email: string | null;
  admin_password_hash: string | null;
  org_name: string | null;
  bot_name: Generated<string>;
  slack_bot_token: string | null;
  slack_app_token: string | null;
  llm_provider: string | null;
  anthropic_api_key: string | null;
  aws_access_key_id: string | null;
  aws_secret_access_key: string | null;
  aws_region: string | null;
  jwt_secret: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_pass: string | null;
  smtp_from: string | null;
  smtp_secure: Generated<number>;
  onboarding_completed_at: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface ConnectorConfigsTable {
  id: string;
  connector_type: string;
  auth_type: string;
  credentials: string;
  scope_config: Generated<string>;
  team_access: string | null;
  sync_status: Generated<string>;
  sync_cursor: string | null;
  last_synced_at: string | null;
  error_message: string | null;
  created_by: string;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface IndexedFilesTable {
  id: string;
  connector_config_id: string;
  provider_file_id: string;
  provider_url: string | null;
  file_name: string;
  file_type: string | null;
  content_category: string;
  content: string | null;
  summary: string | null;
  tags: string | null;
  source: string;
  source_path: string | null;
  content_hash: string | null;
  is_archived: Generated<number>;
  source_created_at: string | null;
  source_updated_at: string | null;
  synced_at: string;
  indexed_at: Generated<string>;
  context_note: string | null;
  enrichment_status: Generated<string>;
}

export interface TeamsTable {
  id: string;
  name: string;
  created_at: Generated<string>;
}

export interface UserTeamsTable {
  user_id: string;
  team_id: string;
}

export interface UserProviderIdentitiesTable {
  id: string;
  user_id: string;
  provider: string;
  provider_user_id: string;
  provider_email: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  connected_at: Generated<string>;
}

export interface FileAccessTable {
  indexed_file_id: string;
  provider_user_id: string;
  provider_email: string | null;
}

export interface DB {
  users: UsersTable;
  channels: ChannelsTable;
  whatsapp_creds: WhatsAppCredsTable;
  whatsapp_keys: WhatsAppKeysTable;
  settings: SettingsTable;
  connector_configs: ConnectorConfigsTable;
  indexed_files: IndexedFilesTable;
  teams: TeamsTable;
  user_teams: UserTeamsTable;
  user_provider_identities: UserProviderIdentitiesTable;
  file_access: FileAccessTable;
}
