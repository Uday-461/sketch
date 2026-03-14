export function generateSlackManifest(botName = "Sketch"): string {
  const name = botName.trim() || "Sketch";

  return JSON.stringify(
    {
      display_information: { name },
      features: {
        bot_user: { display_name: name, always_online: true },
      },
      oauth_config: {
        scopes: {
          bot: [
            "app_mentions:read",
            "channels:history",
            "channels:read",
            "chat:write",
            "groups:history",
            "groups:read",
            "im:history",
            "im:read",
            "im:write",
            "mpim:history",
            "mpim:read",
            "reactions:read",
            "reactions:write",
            "team:read",
            "users:read",
            "users:read.email",
            "files:read",
            "files:write",
          ],
        },
      },
      settings: {
        event_subscriptions: {
          bot_events: ["app_mention", "message.channels", "message.groups", "message.im", "message.mpim"],
        },
        interactivity: { is_enabled: true },
        org_deploy_enabled: false,
        socket_mode_enabled: true,
        token_rotation_enabled: false,
      },
    },
    null,
    2,
  );
}
