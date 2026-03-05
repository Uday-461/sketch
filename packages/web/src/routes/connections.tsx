/**
 * Connections page — manage MCP servers and per-user integrations.
 *
 * Two sections:
 * 1. Integrations — per-user OAuth via Canvas or Composio (appears after provider connected)
 * 2. MCP Servers — admin-configured MCP server connections
 *
 * The integration provider MCP (Canvas/Composio) is hidden from the MCP list;
 * it's surfaced only as "via Canvas" in the Integrations section header.
 */
import { ConnectionsBanner } from "@/components/connections-banner";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckIcon,
  CircleDashedIcon,
  DotsThreeIcon,
  GearIcon,
  LinkSimpleIcon,
  PencilSimpleIcon,
  PlugIcon,
  PlusIcon,
  SpinnerGapIcon,
  TrashIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { createRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { dashboardRoute } from "./dashboard";

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const connectionsRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: "/connections",
  component: ConnectionsPage,
});

// ---------------------------------------------------------------------------
// Mock data — will be replaced with API calls
// ---------------------------------------------------------------------------

interface McpServer {
  id: string;
  name: string;
  url: string;
  transport: "sse" | "stdio" | "streamable-http";
  status: "active" | "error" | "connecting";
  toolCount: number;
  isIntegrationProvider?: boolean;
}

interface Integration {
  id: string;
  service: string;
  description: string;
  myStatus: "connected" | "not_connected";
  connectedUsers: number;
  totalUsers: number;
}

type IntegrationProvider = {
  type: "canvas" | "composio";
  status: "connected" | "not_connected";
} | null;

function useMockData() {
  const [provider, setProvider] = useState<IntegrationProvider>(null);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([
    {
      id: "mcp-1",
      name: "GitHub",
      url: "https://gh-mcp.example.com/sse",
      transport: "sse",
      status: "active",
      toolCount: 12,
    },
    {
      id: "mcp-2",
      name: "Sentry",
      url: "https://sentry-mcp.io/sse",
      transport: "sse",
      status: "active",
      toolCount: 3,
    },
  ]);
  const [integrations, setIntegrations] = useState<Integration[]>([
    {
      id: "int-1",
      service: "ClickUp",
      description: "Project management",
      myStatus: "connected",
      connectedUsers: 3,
      totalUsers: 5,
    },
    {
      id: "int-2",
      service: "Slack",
      description: "Team messaging",
      myStatus: "connected",
      connectedUsers: 5,
      totalUsers: 5,
    },
    {
      id: "int-3",
      service: "Google Calendar",
      description: "Calendar & scheduling",
      myStatus: "not_connected",
      connectedUsers: 0,
      totalUsers: 5,
    },
    { id: "int-4", service: "Gmail", description: "Email", myStatus: "connected", connectedUsers: 2, totalUsers: 5 },
  ]);

  return {
    provider,
    setProvider,
    mcpServers,
    setMcpServers,
    integrations,
    setIntegrations,
    isLoading: false,
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ConnectionsPage() {
  const { provider, setProvider, mcpServers, setMcpServers, integrations, isLoading } = useMockData();

  const [showAddMcpDialog, setShowAddMcpDialog] = useState(false);
  const [editingMcp, setEditingMcp] = useState<McpServer | null>(null);
  const [removingMcp, setRemovingMcp] = useState<McpServer | null>(null);
  const [showConnectProviderDialog, setShowConnectProviderDialog] = useState<"canvas" | "composio" | null>(null);

  const handleProviderConnected = (type: "canvas" | "composio") => {
    setProvider({ type, status: "connected" });
    setShowConnectProviderDialog(null);
    toast.success(`${type === "canvas" ? "Canvas" : "Composio"} connected`);
  };

  const handleAddMcp = (server: Omit<McpServer, "id" | "status" | "toolCount">) => {
    const newServer: McpServer = {
      ...server,
      id: `mcp-${Date.now()}`,
      status: "active",
      toolCount: 0,
    };
    setMcpServers((prev) => [...prev, newServer]);
    setShowAddMcpDialog(false);
    toast.success(`${server.name} added`);
  };

  const handleUpdateMcp = (id: string, updates: Partial<McpServer>) => {
    setMcpServers((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
    setEditingMcp(null);
    toast.success("MCP server updated");
  };

  const handleRemoveMcp = (id: string) => {
    setMcpServers((prev) => prev.filter((s) => s.id !== id));
    setRemovingMcp(null);
    toast.success("MCP server removed");
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-xl font-bold">Connections</h1>
      <p className="mt-1 text-sm text-muted-foreground">Manage MCP servers and per-user integrations</p>

      <div className="mt-6 space-y-8">
        {isLoading ? (
          <LoadingSkeleton />
        ) : (
          <>
            {/* Integration provider CTA or integrations list */}
            {!provider ? (
              <IntegrationProviderBanner onConnect={() => setShowConnectProviderDialog("canvas")} />
            ) : (
              <IntegrationsList integrations={integrations} provider={provider} />
            )}

            {/* MCP Servers */}
            <McpServersList
              servers={mcpServers}
              onAdd={() => setShowAddMcpDialog(true)}
              onEdit={setEditingMcp}
              onRemove={setRemovingMcp}
            />
          </>
        )}
      </div>

      {/* Dialogs */}
      <ConnectProviderDialog
        type={showConnectProviderDialog}
        onOpenChange={(open) => !open && setShowConnectProviderDialog(null)}
        onConnected={handleProviderConnected}
      />

      <AddMcpDialog open={showAddMcpDialog} onOpenChange={setShowAddMcpDialog} onAdd={handleAddMcp} />

      <EditMcpDialog
        server={editingMcp}
        onOpenChange={(open) => !open && setEditingMcp(null)}
        onSave={handleUpdateMcp}
      />

      <RemoveMcpDialog
        server={removingMcp}
        onOpenChange={(open) => !open && setRemovingMcp(null)}
        onRemove={handleRemoveMcp}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Integration Provider Banner (empty state) — delegates to ConnectionsBanner
// ---------------------------------------------------------------------------

function IntegrationProviderBanner({ onConnect }: { onConnect: () => void }) {
  return <ConnectionsBanner onConnect={onConnect} />;
}

// ---------------------------------------------------------------------------
// Integrations List
// ---------------------------------------------------------------------------

function IntegrationsList({
  integrations,
  provider,
}: {
  integrations: Integration[];
  provider: NonNullable<IntegrationProvider>;
}) {
  const providerLabel = provider.type === "canvas" ? "Canvas" : "Composio";

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-muted-foreground">Integrations</p>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            via {providerLabel}
          </Badge>
        </div>
        <Button size="sm" variant="outline">
          <PlusIcon size={14} weight="bold" />
          Add integration
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card">
        {integrations.map((integration, i) => (
          <IntegrationRow key={integration.id} integration={integration} isLast={i === integrations.length - 1} />
        ))}
      </div>
    </div>
  );
}

function IntegrationRow({
  integration,
  isLast,
}: {
  integration: Integration;
  isLast: boolean;
}) {
  const isConnected = integration.myStatus === "connected";

  return (
    <div className={`flex items-center gap-4 px-4 py-4 ${isLast ? "" : "border-b border-border"}`}>
      {/* Service icon placeholder + name */}
      <div className="flex size-9 items-center justify-center rounded-full bg-muted">
        <LinkSimpleIcon size={16} className="text-muted-foreground" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium">{integration.service}</span>
        <span className="text-xs text-muted-foreground">{integration.description}</span>
      </div>

      {/* Personal status */}
      {isConnected ? (
        <div className="flex items-center gap-1.5">
          <CheckIcon size={14} className="text-success" />
          <span className="text-xs text-muted-foreground">Connected</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <CircleDashedIcon size={14} className="text-muted-foreground/50" />
          <span className="text-xs text-muted-foreground">Not connected</span>
        </div>
      )}

      {/* Team adoption (admin only — will be conditionally rendered later) */}
      <span className="w-16 text-right text-xs text-muted-foreground">
        {integration.connectedUsers}/{integration.totalUsers} users
      </span>

      {/* Action */}
      {isConnected ? (
        <Button variant="ghost" size="sm" className="text-xs">
          Manage
        </Button>
      ) : (
        <Button variant="outline" size="sm" className="text-xs">
          Connect
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MCP Servers List
// ---------------------------------------------------------------------------

function McpServersList({
  servers,
  onAdd,
  onEdit,
  onRemove,
}: {
  servers: McpServer[];
  onAdd: () => void;
  onEdit: (server: McpServer) => void;
  onRemove: (server: McpServer) => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">MCP Servers</p>
        <Button size="sm" onClick={onAdd}>
          <PlusIcon size={14} weight="bold" />
          Add MCP
        </Button>
      </div>

      {servers.length === 0 ? (
        <McpEmptyState onAdd={onAdd} />
      ) : (
        <div className="rounded-lg border border-border bg-card">
          {servers.map((server, i) => (
            <McpServerRow
              key={server.id}
              server={server}
              isLast={i === servers.length - 1}
              onEdit={() => onEdit(server)}
              onRemove={() => onRemove(server)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function McpServerRow({
  server,
  isLast,
  onEdit,
  onRemove,
}: {
  server: McpServer;
  isLast: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div className={`flex items-center gap-4 px-4 py-4 ${isLast ? "" : "border-b border-border"}`}>
      <div className="flex size-9 items-center justify-center rounded-full bg-muted">
        <GearIcon size={16} className="text-muted-foreground" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium">{server.name}</span>
        <span className="truncate text-xs text-muted-foreground font-mono">{server.url}</span>
      </div>

      <span className="text-xs text-muted-foreground">{server.toolCount} tools</span>

      <StatusDot status={server.status} />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7">
            <DotsThreeIcon size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>
            <PencilSimpleIcon size={14} className="mr-2" />
            Configure
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onClick={onRemove}>
            <TrashIcon size={14} className="mr-2" />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function StatusDot({ status }: { status: McpServer["status"] }) {
  const color = status === "active" ? "bg-success" : status === "error" ? "bg-destructive" : "bg-warning";
  const label = status === "active" ? "Active" : status === "error" ? "Error" : "Connecting";

  return (
    <div className="flex items-center gap-1.5">
      <span className={`size-2 rounded-full ${color}`} />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function McpEmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <GearIcon size={24} className="text-muted-foreground" />
      </div>
      <p className="mt-4 text-sm font-medium">No MCP servers</p>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground">
        Add an MCP server to give the agent access to external tools.
      </p>
      <Button size="sm" className="mt-4" onClick={onAdd}>
        <PlusIcon size={14} weight="bold" />
        Add MCP
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connect Provider Dialog (Canvas / Composio)
// ---------------------------------------------------------------------------

function ConnectProviderDialog({
  type,
  onOpenChange,
  onConnected,
}: {
  type: "canvas" | "composio" | null;
  onOpenChange: (open: boolean) => void;
  onConnected: (type: "canvas" | "composio") => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);

  const label = type === "canvas" ? "Canvas" : "Composio";

  const handleConnect = async () => {
    if (!type || !apiKey.trim()) return;
    setIsConnecting(true);
    // Simulate API call — will be replaced with real backend
    await new Promise((resolve) => setTimeout(resolve, 800));
    setIsConnecting(false);
    setApiKey("");
    onConnected(type);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setApiKey("");
      setIsConnecting(false);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={type !== null} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect {label}</DialogTitle>
          <DialogDescription>
            {label} provides per-user OAuth for 2,700+ services. Each team member connects their own accounts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="provider-api-key">API Key</Label>
            <Input
              id="provider-api-key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={type === "canvas" ? "cvs_..." : "cmp_..."}
              disabled={isConnecting}
              className="font-mono text-xs"
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isConnecting}>
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={handleConnect} disabled={!apiKey.trim() || isConnecting}>
            {isConnecting ? (
              <>
                <SpinnerGapIcon size={14} className="animate-spin" />
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

// ---------------------------------------------------------------------------
// Add MCP Dialog
// ---------------------------------------------------------------------------

function AddMcpDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (server: Omit<McpServer, "id" | "status" | "toolCount">) => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [transport, setTransport] = useState<McpServer["transport"]>("sse");
  const [headers, setHeaders] = useState("");
  const [isTesting, setIsTesting] = useState(false);

  const resetAndClose = () => {
    setName("");
    setUrl("");
    setTransport("sse");
    setHeaders("");
    setIsTesting(false);
    onOpenChange(false);
  };

  const handleSave = async () => {
    if (!name.trim() || !url.trim()) return;
    setIsTesting(true);
    // Simulate connectivity test — will be replaced with real backend
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsTesting(false);
    onAdd({ name: name.trim(), url: url.trim(), transport });
    resetAndClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetAndClose();
        else onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add MCP Server</DialogTitle>
          <DialogDescription>Connect an MCP server to give the agent access to its tools.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="mcp-name">Name</Label>
            <Input
              id="mcp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. GitHub, Internal Tools"
              disabled={isTesting}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Transport</Label>
            <div className="flex items-center gap-4">
              {(["sse", "streamable-http", "stdio"] as const).map((t) => (
                <label key={t} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    name="transport"
                    value={t}
                    checked={transport === t}
                    onChange={() => setTransport(t)}
                    disabled={isTesting}
                    className="accent-primary"
                  />
                  {t === "sse" ? "SSE" : t === "streamable-http" ? "Streamable HTTP" : "Stdio"}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mcp-url">{transport === "stdio" ? "Command" : "Server URL"}</Label>
            <Input
              id="mcp-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={transport === "stdio" ? "npx -y @example/mcp-server" : "https://mcp.example.com/sse"}
              disabled={isTesting}
              className="font-mono text-xs"
            />
          </div>

          {transport !== "stdio" && (
            <div className="space-y-1.5">
              <Label htmlFor="mcp-headers">Headers (optional)</Label>
              <Input
                id="mcp-headers"
                value={headers}
                onChange={(e) => setHeaders(e.target.value)}
                placeholder="Authorization: Bearer sk-..."
                disabled={isTesting}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">One header per line. Sent with every request.</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isTesting}>
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={handleSave} disabled={!name.trim() || !url.trim() || isTesting}>
            {isTesting ? (
              <>
                <SpinnerGapIcon size={14} className="animate-spin" />
                Testing...
              </>
            ) : (
              "Test & Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Edit MCP Dialog
// ---------------------------------------------------------------------------

function EditMcpDialog({
  server,
  onOpenChange,
  onSave,
}: {
  server: McpServer | null;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, updates: Partial<McpServer>) => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [transport, setTransport] = useState<McpServer["transport"]>("sse");
  const [isTesting, setIsTesting] = useState(false);

  // Sync state when server changes
  const [lastServerId, setLastServerId] = useState<string | null>(null);
  if (server && server.id !== lastServerId) {
    setName(server.name);
    setUrl(server.url);
    setTransport(server.transport);
    setLastServerId(server.id);
  }
  if (!server && lastServerId) {
    setLastServerId(null);
  }

  const handleSave = async () => {
    if (!server || !name.trim() || !url.trim()) return;
    setIsTesting(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    setIsTesting(false);
    onSave(server.id, { name: name.trim(), url: url.trim(), transport });
  };

  const isDirty =
    server && (name.trim() !== server.name || url.trim() !== server.url || transport !== server.transport);

  return (
    <Dialog open={!!server} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configure MCP Server</DialogTitle>
          <DialogDescription>Update the server connection settings.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-mcp-name">Name</Label>
            <Input id="edit-mcp-name" value={name} onChange={(e) => setName(e.target.value)} disabled={isTesting} />
          </div>

          <div className="space-y-1.5">
            <Label>Transport</Label>
            <div className="flex items-center gap-4">
              {(["sse", "streamable-http", "stdio"] as const).map((t) => (
                <label key={t} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    name="edit-transport"
                    value={t}
                    checked={transport === t}
                    onChange={() => setTransport(t)}
                    disabled={isTesting}
                    className="accent-primary"
                  />
                  {t === "sse" ? "SSE" : t === "streamable-http" ? "Streamable HTTP" : "Stdio"}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-mcp-url">{transport === "stdio" ? "Command" : "Server URL"}</Label>
            <Input
              id="edit-mcp-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isTesting}
              className="font-mono text-xs"
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isTesting}>
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={handleSave} disabled={!isDirty || !name.trim() || !url.trim() || isTesting}>
            {isTesting ? (
              <>
                <SpinnerGapIcon size={14} className="animate-spin" />
                Testing...
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Remove MCP Dialog
// ---------------------------------------------------------------------------

function RemoveMcpDialog({
  server,
  onOpenChange,
  onRemove,
}: {
  server: McpServer | null;
  onOpenChange: (open: boolean) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <AlertDialog open={!!server} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {server?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will disconnect the MCP server. The agent will lose access to its {server?.toolCount} tools.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => server && onRemove(server.id)}>
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// Loading Skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-32 rounded-lg" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <div className="rounded-lg border border-border bg-card">
          {[1, 2].map((i) => (
            <div key={i} className={`flex items-center gap-4 px-4 py-4 ${i < 2 ? "border-b border-border" : ""}`}>
              <Skeleton className="size-9 rounded-full" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
