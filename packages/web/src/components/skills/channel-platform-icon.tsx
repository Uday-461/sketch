import { DiscordLogoIcon, SlackLogoIcon, TelegramLogoIcon, WhatsappLogoIcon } from "@phosphor-icons/react";

interface ChannelPlatformIconProps {
  type: string;
}

export function ChannelPlatformIcon({ type }: ChannelPlatformIconProps) {
  if (type === "whatsapp") {
    return <WhatsappLogoIcon size={16} className="text-muted-foreground shrink-0" />;
  }

  if (type === "telegram") {
    return <TelegramLogoIcon size={16} className="text-muted-foreground shrink-0" />;
  }

  if (type === "discord") {
    return <DiscordLogoIcon size={16} className="text-muted-foreground shrink-0" />;
  }

  return <SlackLogoIcon size={16} className="text-muted-foreground shrink-0" />;
}
