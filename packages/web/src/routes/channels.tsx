/**
 * Channels page — displays Slack, WhatsApp, and Email platform cards with connection status.
 * WhatsApp pairing uses SSE-based QR flow via the shared WhatsAppQR component.
 * Email uses SMTP configuration for magic link delivery.
 */
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { WhatsAppQR } from "@/components/whatsapp-qr";
import type { ChannelStatus } from "@/lib/api";
import { api } from "@/lib/api";
import {
  ArrowSquareOutIcon,
  CheckIcon,
  CopySimpleIcon,
  DotsThreeIcon,
  EnvelopeSimpleIcon,
  SlackLogoIcon,
  SpinnerGapIcon,
  WarningIcon,
  WhatsappLogoIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { dashboardRoute } from "./dashboard";

export const channelsRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: "/channels",
  component: ChannelsPage,
});

export function ChannelsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["channels", "status"],
    queryFn: () => api.channels.status(),
    refetchInterval: 60000,
  });

  const allDisconnected = data?.channels?.every((ch) => ch.connected !== true);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-xl font-bold">Channels</h1>
      <p className="mt-1 text-sm text-muted-foreground">Manage your messaging platform connections</p>

      <div className="mt-6 space-y-4">
        {!isLoading && allDisconnected && (
          <div className="flex items-start gap-3 rounded-lg border border-warning/50 bg-warning/5 p-4">
            <WarningIcon size={16} className="mt-0.5 shrink-0 text-warning" />
            <p className="text-sm text-warning">
              No channels connected — connect at least one channel so your team can message the bot.
            </p>
          </div>
        )}
        {isLoading ? (
          <>
            <Skeleton className="h-32 rounded-lg" />
            <Skeleton className="h-32 rounded-lg" />
            <Skeleton className="h-32 rounded-lg" />
          </>
        ) : (
          data?.channels.map((channel) => <PlatformCard key={channel.platform} channel={channel} />)
        )}
      </div>
    </div>
  );
}

function PlatformCard({ channel }: { channel: ChannelStatus }) {
  if (channel.platform === "slack") {
    return <SlackCard channel={channel} />;
  }
  if (channel.platform === "email") {
    return <EmailCard channel={channel} />;
  }
  return <WhatsAppCard channel={channel} />;
}

function SlackCard({ channel }: { channel: ChannelStatus }) {
  const queryClient = useQueryClient();
  const [showConnectDialog, setShowConnectDialog] = useState(false);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const isConfigured = channel.configured;
  const isConnected = channel.connected === true;

  const handleConnected = () => {
    setShowConnectDialog(false);
    toast.success("Slack connected.");
    queryClient.invalidateQueries({ queryKey: ["channels", "status"] });
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await api.channels.disconnectSlack();
      toast.success("Slack disconnected.");
      queryClient.invalidateQueries({ queryKey: ["channels", "status"] });
    } catch {
      toast.error("Failed to disconnect Slack.");
    } finally {
      setIsDisconnecting(false);
      setShowDisconnectDialog(false);
    }
  };

  return (
    <>
      <div
        className={`rounded-lg border p-4 ${isConfigured ? "border-border bg-card" : "border-dashed border-border bg-card"}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-muted">
              <SlackLogoIcon size={20} />
            </div>
            <span className="text-sm font-medium">Slack</span>
          </div>
          <div className="flex items-center gap-2">
            {!isConfigured && (
              <Button variant="outline" size="sm" onClick={() => setShowConnectDialog(true)}>
                Connect
              </Button>
            )}
            {isConfigured && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-7">
                    <DotsThreeIcon size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem className="text-destructive" onClick={() => setShowDisconnectDialog(true)}>
                    Disconnect
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        <div className="ml-12 mt-2">
          {isConnected ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckIcon size={14} className="text-success" />
              <span>Connected</span>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Not connected</p>
              <p className="mt-1 text-xs text-muted-foreground">Connect a Slack workspace to get started</p>
            </>
          )}
        </div>
      </div>

      <SlackConnectDialog open={showConnectDialog} onOpenChange={setShowConnectDialog} onConnected={handleConnected} />

      <AlertDialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Slack?</AlertDialogTitle>
            <AlertDialogDescription>
              This will disconnect Slack and remove the stored tokens. Users will no longer be able to message the bot
              via Slack.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDisconnecting}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDisconnect} disabled={isDisconnecting}>
              {isDisconnecting ? "Disconnecting..." : "Disconnect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function WhatsAppCard({ channel }: { channel: ChannelStatus }) {
  const queryClient = useQueryClient();
  const [showPairDialog, setShowPairDialog] = useState(false);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const isConnected = channel.connected === true;

  const handlePairConnected = () => {
    setShowPairDialog(false);
    toast.success("WhatsApp connected.");
    queryClient.invalidateQueries({ queryKey: ["channels", "status"] });
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await api.whatsapp.disconnect();
      toast.success("WhatsApp disconnected.");
      queryClient.invalidateQueries({ queryKey: ["channels", "status"] });
    } catch {
      toast.error("Failed to disconnect WhatsApp.");
    } finally {
      setIsDisconnecting(false);
      setShowDisconnectDialog(false);
    }
  };

  return (
    <>
      <div
        className={`rounded-lg border p-4 ${isConnected ? "border-border bg-card" : "border-dashed border-border bg-card"}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-muted">
              <WhatsappLogoIcon size={20} />
            </div>
            <span className="text-sm font-medium">WhatsApp</span>
          </div>
          <div className="flex items-center gap-2">
            {!isConnected && (
              <Button variant="outline" size="sm" onClick={() => setShowPairDialog(true)}>
                Pair
              </Button>
            )}
            {isConnected && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-7">
                    <DotsThreeIcon size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem className="text-destructive" onClick={() => setShowDisconnectDialog(true)}>
                    Disconnect
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        <div className="ml-12 mt-2">
          {isConnected ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckIcon size={14} className="text-success" />
              <span>Connected{channel.phoneNumber ? ` — ${channel.phoneNumber}` : ""}</span>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Not connected</p>
              <p className="mt-1 text-xs text-muted-foreground">Pair a WhatsApp number to get started</p>
            </>
          )}
        </div>
      </div>

      <WhatsAppPairDialog open={showPairDialog} onOpenChange={setShowPairDialog} onConnected={handlePairConnected} />

      <AlertDialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect WhatsApp?</AlertDialogTitle>
            <AlertDialogDescription>
              This will disconnect your WhatsApp number. Users will no longer be able to message the bot via WhatsApp.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDisconnecting}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDisconnect} disabled={isDisconnecting}>
              {isDisconnecting ? "Disconnecting..." : "Disconnect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function WhatsAppPairDialog({
  open,
  onOpenChange,
  onConnected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Connect WhatsApp</DialogTitle>
          <DialogDescription>Scan this QR code with WhatsApp to connect your number.</DialogDescription>
        </DialogHeader>
        {open && <WhatsAppQR onConnected={onConnected} />}
      </DialogContent>
    </Dialog>
  );
}

function EmailCard({ channel }: { channel: ChannelStatus }) {
  const queryClient = useQueryClient();
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const isConfigured = channel.configured;

  const handleConfigured = () => {
    setShowConfigDialog(false);
    toast.success("Email configured.");
    queryClient.invalidateQueries({ queryKey: ["channels", "status"] });
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await api.email.disconnect();
      toast.success("Email disconnected.");
      queryClient.invalidateQueries({ queryKey: ["channels", "status"] });
    } catch {
      toast.error("Failed to disconnect email.");
    } finally {
      setIsDisconnecting(false);
      setShowDisconnectDialog(false);
    }
  };

  return (
    <>
      <div
        className={`rounded-lg border p-4 ${isConfigured ? "border-border bg-card" : "border-dashed border-border bg-card"}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-muted">
              <EnvelopeSimpleIcon size={20} />
            </div>
            <span className="text-sm font-medium">Email</span>
          </div>
          <div className="flex items-center gap-2">
            {!isConfigured && (
              <Button variant="outline" size="sm" onClick={() => setShowConfigDialog(true)}>
                Configure
              </Button>
            )}
            {isConfigured && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-7">
                    <DotsThreeIcon size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setShowConfigDialog(true)}>Reconfigure</DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive" onClick={() => setShowDisconnectDialog(true)}>
                    Disconnect
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        <div className="ml-12 mt-2">
          {isConfigured ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckIcon size={14} className="text-success" />
              <span>Configured{channel.fromAddress ? ` — ${channel.fromAddress}` : ""}</span>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Not configured</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Configure SMTP to send verification codes and magic links
              </p>
            </>
          )}
        </div>
      </div>

      <EmailConfigDialog open={showConfigDialog} onOpenChange={setShowConfigDialog} onConfigured={handleConfigured} />

      <AlertDialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Email?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the SMTP configuration. Verification codes and magic links will no longer be sent via
              email.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDisconnecting}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDisconnect} disabled={isDisconnecting}>
              {isDisconnecting ? "Disconnecting..." : "Disconnect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function EmailConfigDialog({
  open,
  onOpenChange,
  onConfigured,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfigured: () => void;
}) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [from, setFrom] = useState("");
  const [secure, setSecure] = useState(true);

  const configureMutation = useMutation({
    mutationFn: () =>
      api.email.configure({
        host: host.trim(),
        port: Number(port),
        user: user.trim(),
        pass: pass.trim(),
        from: from.trim(),
        secure,
      }),
    onSuccess: () => {
      resetForm();
      onConfigured();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setHost("");
    setPort("587");
    setUser("");
    setPass("");
    setFrom("");
    setSecure(true);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm();
    onOpenChange(next);
  };

  const canSubmit = host.trim() && port && user.trim() && pass.trim() && from.trim();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configure Email (SMTP)</DialogTitle>
          <DialogDescription>Enter your SMTP credentials. Connection will be verified before saving.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="smtp-host" className="text-xs">
                SMTP Host
              </Label>
              <Input
                id="smtp-host"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="smtp.gmail.com"
                disabled={configureMutation.isPending}
                className="text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtp-port" className="text-xs">
                Port
              </Label>
              <Input
                id="smtp-port"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="587"
                disabled={configureMutation.isPending}
                className="text-xs"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="smtp-user" className="text-xs">
              Username
            </Label>
            <Input
              id="smtp-user"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="user@example.com"
              disabled={configureMutation.isPending}
              className="text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="smtp-pass" className="text-xs">
              Password
            </Label>
            <Input
              id="smtp-pass"
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="App password or SMTP password"
              disabled={configureMutation.isPending}
              className="text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="smtp-from" className="text-xs">
              From Address
            </Label>
            <Input
              id="smtp-from"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder="sketch@yourcompany.com"
              disabled={configureMutation.isPending}
              className="text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="smtp-secure"
              checked={secure}
              onChange={(e) => setSecure(e.target.checked)}
              disabled={configureMutation.isPending}
              className="size-3.5 rounded border-border"
            />
            <Label htmlFor="smtp-secure" className="text-xs font-normal text-muted-foreground">
              Use TLS/SSL (recommended)
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => configureMutation.mutate()}
            disabled={!canSubmit || configureMutation.isPending}
          >
            {configureMutation.isPending ? (
              <>
                <SpinnerGapIcon className="size-3.5 animate-spin" />
                Verifying...
              </>
            ) : (
              "Connect"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SlackConnectDialog({
  open,
  onOpenChange,
  onConnected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected: () => void;
}) {
  const [botToken, setBotToken] = useState("");
  const [appToken, setAppToken] = useState("");
  const [manifestCopied, setManifestCopied] = useState(false);

  const connectMutation = useMutation({
    mutationFn: async () => {
      await api.setup.verifySlack(botToken.trim(), appToken.trim());
      await api.setup.slack(botToken.trim(), appToken.trim());
    },
    onSuccess: () => {
      setBotToken("");
      setAppToken("");
      onConnected();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleCopyManifest = useCallback(async () => {
    const manifest = JSON.stringify(
      {
        display_information: { name: "Sketch" },
        features: {
          bot_user: { display_name: "Sketch", always_online: true },
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

    try {
      await navigator.clipboard.writeText(manifest);
      setManifestCopied(true);
      toast.success("Slack manifest copied to clipboard.");
      setTimeout(() => setManifestCopied(false), 2000);
    } catch {
      toast.error("Unable to copy manifest. Please try again.");
    }
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setBotToken("");
      setAppToken("");
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Connect Slack</DialogTitle>
          <DialogDescription>Create a Slack app and paste the tokens to connect.</DialogDescription>
        </DialogHeader>

        <ol className="list-inside list-decimal space-y-1.5 text-xs text-muted-foreground">
          <li>Copy the manifest below</li>
          <li>Go to api.slack.com/apps &rarr; &ldquo;Create New App&rdquo; &rarr; &ldquo;From a Manifest&rdquo;</li>
          <li>Select your workspace and paste the manifest</li>
          <li>Click &ldquo;Install to Workspace&rdquo;</li>
          <li>Copy the Bot Token (OAuth &amp; Permissions page) and App-Level Token</li>
          <li>Paste both tokens below</li>
        </ol>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCopyManifest}>
            {manifestCopied ? (
              <>
                <CheckIcon className="size-3.5 text-success" weight="bold" />
                Copied
              </>
            ) : (
              <>
                <CopySimpleIcon className="size-3.5" />
                Copy Manifest
              </>
            )}
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer">
              Open Slack API
              <ArrowSquareOutIcon className="size-3.5" />
            </a>
          </Button>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="slack-bot-token" className="text-xs">
              Bot Token
            </Label>
            <Input
              id="slack-bot-token"
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder="xoxb-..."
              disabled={connectMutation.isPending}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="slack-app-token" className="text-xs">
              App-Level Token
            </Label>
            <Input
              id="slack-app-token"
              value={appToken}
              onChange={(e) => setAppToken(e.target.value)}
              placeholder="xapp-..."
              disabled={connectMutation.isPending}
              className="font-mono text-xs"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => connectMutation.mutate()}
            disabled={!botToken.trim() || !appToken.trim() || connectMutation.isPending}
          >
            {connectMutation.isPending ? (
              <>
                <SpinnerGapIcon className="size-3.5 animate-spin" />
                Connecting...
              </>
            ) : (
              "Connect"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
