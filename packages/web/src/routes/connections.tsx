/**
 * Connections page — manage MCP servers and per-user integrations.
 *
 * Two integration types:
 * 1. Canvas integrations — per-user OAuth via Canvas API key (appears after Canvas connected)
 * 2. MCP Servers — workspace-level custom server connections, admin only
 *
 * Members connect their personal OAuth via the Sketch bot in Slack/WhatsApp.
 * The admin can also connect directly from this web page.
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
  DialogBackRow,
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
import { useTheme } from "@/hooks/use-theme";
import {
  ArrowSquareOutIcon,
  CheckIcon,
  DotsThreeIcon,
  EyeIcon,
  GearIcon,
  HandPalmIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  PlugIcon,
  PlusIcon,
  SpinnerGapIcon,
  TrashIcon,
  WarningIcon,
  XCircleIcon,
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
// Types
// ---------------------------------------------------------------------------

interface McpServer {
  id: string;
  name: string;
  url: string;
  status: "active" | "inactive" | "error" | "authenticating";
  toolCount: number;
  bearerToken?: string;
  isIntegrationProvider?: boolean;
}

type ToolPermission = "always_allow" | "needs_approval" | "never";

interface IntegrationTool {
  id: string;
  name: string;
  category: "read" | "write";
  permission: ToolPermission;
}

interface IntegrationUser {
  id: string;
  name: string;
  email: string;
  connectedAt: string;
  source: "via Sketch" | "via web";
  revoked?: boolean;
}

interface Integration {
  id: string;
  service: string;
  description: string;
  icon: string;
  color: string;
  connectedUsers: number;
  totalUsers: number;
  tools: IntegrationTool[];
  userDetails: IntegrationUser[];
}

type IntegrationProvider = {
  type: "canvas" | "composio";
  status: "connected" | "not_connected" | "key_expired";
} | null;

/** Navigation state for the provider connection flow */
type ProviderFlow =
  | null
  | { step: "selector" }
  | { step: "canvas"; reconnect?: boolean }
  | { step: "coming-soon"; provider: "composio" | "nango" };

interface CatalogApp {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  color: string;
  defaultTools: IntegrationTool[];
}

// ---------------------------------------------------------------------------
// Catalog — apps available via Canvas
// ---------------------------------------------------------------------------

const CATALOG: CatalogApp[] = [
  {
    id: "cat-clickup",
    name: "ClickUp",
    description: "Project management & tasks",
    category: "Productivity",
    icon: "CU",
    color: "#7B68EE",
    defaultTools: [
      { id: "cu-1", name: "clickup-get-tasks", category: "read", permission: "always_allow" },
      { id: "cu-2", name: "clickup-get-spaces", category: "read", permission: "always_allow" },
      { id: "cu-3", name: "clickup-get-lists", category: "read", permission: "always_allow" },
      { id: "cu-4", name: "clickup-create-task", category: "write", permission: "needs_approval" },
      { id: "cu-5", name: "clickup-update-task", category: "write", permission: "needs_approval" },
      { id: "cu-6", name: "clickup-delete-task", category: "write", permission: "needs_approval" },
      { id: "cu-7", name: "clickup-create-comment", category: "write", permission: "needs_approval" },
    ],
  },
  {
    id: "cat-slack",
    name: "Slack",
    description: "Team messaging & channels",
    category: "Communication",
    icon: "SL",
    color: "#4A154B",
    defaultTools: [
      { id: "sl-1", name: "slack-list-channels", category: "read", permission: "always_allow" },
      { id: "sl-2", name: "slack-read-messages", category: "read", permission: "always_allow" },
      { id: "sl-3", name: "slack-get-users", category: "read", permission: "always_allow" },
      { id: "sl-4", name: "slack-send-message", category: "write", permission: "needs_approval" },
      { id: "sl-5", name: "slack-update-message", category: "write", permission: "needs_approval" },
      { id: "sl-6", name: "slack-delete-message", category: "write", permission: "never" },
    ],
  },
  {
    id: "cat-gcal",
    name: "Google Calendar",
    description: "Calendar & scheduling",
    category: "Productivity",
    icon: "GC",
    color: "#4285F4",
    defaultTools: [
      { id: "gc-1", name: "gcal-list-events", category: "read", permission: "always_allow" },
      { id: "gc-2", name: "gcal-get-event", category: "read", permission: "always_allow" },
      { id: "gc-3", name: "gcal-create-event", category: "write", permission: "needs_approval" },
      { id: "gc-4", name: "gcal-update-event", category: "write", permission: "needs_approval" },
      { id: "gc-5", name: "gcal-delete-event", category: "write", permission: "never" },
    ],
  },
  {
    id: "cat-gmail",
    name: "Gmail",
    description: "Email management",
    category: "Communication",
    icon: "GM",
    color: "#EA4335",
    defaultTools: [
      { id: "gm-1", name: "gmail-search", category: "read", permission: "always_allow" },
      { id: "gm-2", name: "gmail-get-message", category: "read", permission: "always_allow" },
      { id: "gm-3", name: "gmail-get-thread", category: "read", permission: "always_allow" },
      { id: "gm-4", name: "gmail-send-email", category: "write", permission: "needs_approval" },
      { id: "gm-5", name: "gmail-reply", category: "write", permission: "needs_approval" },
      { id: "gm-6", name: "gmail-trash-message", category: "write", permission: "never" },
      { id: "gm-7", name: "gmail-create-draft", category: "write", permission: "needs_approval" },
    ],
  },
  {
    id: "cat-notion",
    name: "Notion",
    description: "Docs, wikis & databases",
    category: "Productivity",
    icon: "NO",
    color: "#1F1F1F",
    defaultTools: [
      { id: "no-1", name: "notion-search", category: "read", permission: "always_allow" },
      { id: "no-2", name: "notion-get-page", category: "read", permission: "always_allow" },
      { id: "no-3", name: "notion-get-database", category: "read", permission: "always_allow" },
      { id: "no-4", name: "notion-create-page", category: "write", permission: "needs_approval" },
      { id: "no-5", name: "notion-update-page", category: "write", permission: "needs_approval" },
      { id: "no-6", name: "notion-delete-page", category: "write", permission: "never" },
    ],
  },
  {
    id: "cat-hubspot",
    name: "HubSpot",
    description: "CRM & marketing automation",
    category: "Sales",
    icon: "HS",
    color: "#FF5C35",
    defaultTools: [
      { id: "hs-1", name: "hubspot-get-contacts", category: "read", permission: "always_allow" },
      { id: "hs-2", name: "hubspot-get-deals", category: "read", permission: "always_allow" },
      { id: "hs-3", name: "hubspot-search", category: "read", permission: "always_allow" },
      { id: "hs-4", name: "hubspot-create-contact", category: "write", permission: "needs_approval" },
      { id: "hs-5", name: "hubspot-update-deal", category: "write", permission: "needs_approval" },
    ],
  },
  {
    id: "cat-jira",
    name: "Jira",
    description: "Issue & project tracking",
    category: "Productivity",
    icon: "JI",
    color: "#0052CC",
    defaultTools: [
      { id: "ji-1", name: "jira-search-issues", category: "read", permission: "always_allow" },
      { id: "ji-2", name: "jira-get-issue", category: "read", permission: "always_allow" },
      { id: "ji-3", name: "jira-get-projects", category: "read", permission: "always_allow" },
      { id: "ji-4", name: "jira-create-issue", category: "write", permission: "needs_approval" },
      { id: "ji-5", name: "jira-update-issue", category: "write", permission: "needs_approval" },
      { id: "ji-6", name: "jira-add-comment", category: "write", permission: "needs_approval" },
    ],
  },
  {
    id: "cat-linear",
    name: "Linear",
    description: "Issue tracking for teams",
    category: "Productivity",
    icon: "LI",
    color: "#5E6AD2",
    defaultTools: [
      { id: "li-1", name: "linear-list-issues", category: "read", permission: "always_allow" },
      { id: "li-2", name: "linear-get-issue", category: "read", permission: "always_allow" },
      { id: "li-3", name: "linear-create-issue", category: "write", permission: "needs_approval" },
      { id: "li-4", name: "linear-update-issue", category: "write", permission: "needs_approval" },
    ],
  },
  {
    id: "cat-github",
    name: "GitHub",
    description: "Code hosting & collaboration",
    category: "Development",
    icon: "GH",
    color: "#24292E",
    defaultTools: [
      { id: "gh-1", name: "github-list-repos", category: "read", permission: "always_allow" },
      { id: "gh-2", name: "github-get-issues", category: "read", permission: "always_allow" },
      { id: "gh-3", name: "github-get-prs", category: "read", permission: "always_allow" },
      { id: "gh-4", name: "github-create-issue", category: "write", permission: "needs_approval" },
      { id: "gh-5", name: "github-create-pr", category: "write", permission: "needs_approval" },
      { id: "gh-6", name: "github-create-comment", category: "write", permission: "needs_approval" },
    ],
  },
  {
    id: "cat-figma",
    name: "Figma",
    description: "Design & prototyping",
    category: "Design",
    icon: "FI",
    color: "#F24E1E",
    defaultTools: [
      { id: "fi-1", name: "figma-get-files", category: "read", permission: "always_allow" },
      { id: "fi-2", name: "figma-get-comments", category: "read", permission: "always_allow" },
      { id: "fi-3", name: "figma-post-comment", category: "write", permission: "needs_approval" },
    ],
  },
  {
    id: "cat-asana",
    name: "Asana",
    description: "Work management & tasks",
    category: "Productivity",
    icon: "AS",
    color: "#F06A6A",
    defaultTools: [
      { id: "as-1", name: "asana-list-tasks", category: "read", permission: "always_allow" },
      { id: "as-2", name: "asana-get-task", category: "read", permission: "always_allow" },
      { id: "as-3", name: "asana-create-task", category: "write", permission: "needs_approval" },
      { id: "as-4", name: "asana-update-task", category: "write", permission: "needs_approval" },
    ],
  },
  {
    id: "cat-intercom",
    name: "Intercom",
    description: "Customer messaging platform",
    category: "Support",
    icon: "IC",
    color: "#1F8DED",
    defaultTools: [
      { id: "ic-1", name: "intercom-list-conversations", category: "read", permission: "always_allow" },
      { id: "ic-2", name: "intercom-get-contacts", category: "read", permission: "always_allow" },
      { id: "ic-3", name: "intercom-reply", category: "write", permission: "needs_approval" },
      { id: "ic-4", name: "intercom-create-note", category: "write", permission: "needs_approval" },
    ],
  },
];

/** Current user ID — hardcoded for demo, will come from auth context */
const CURRENT_USER_ID = "u-2";

/** Lookup color for a service name from the CATALOG. */
function getCatalogMeta(serviceName: string): { icon: string; color: string } {
  const app = CATALOG.find((a) => a.name === serviceName);
  return app ? { icon: app.icon, color: app.color } : { icon: serviceName.slice(0, 2).toUpperCase(), color: "#6B7280" };
}

// ---------------------------------------------------------------------------
// Mock data — will be replaced with API calls
// ---------------------------------------------------------------------------

function useMockData() {
  const [provider, setProvider] = useState<IntegrationProvider>(null);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([
    {
      id: "mcp-1",
      name: "GitHub",
      url: "https://gh-mcp.example.com/sse",
      status: "active",
      toolCount: 12,
    },
    {
      id: "mcp-2",
      name: "Sentry",
      url: "https://sentry-mcp.io/sse",
      status: "active",
      toolCount: 3,
    },
  ]);
  const MOCK_TEAM_USERS: IntegrationUser[] = [
    {
      id: "u-1",
      name: "Harsh Kalra",
      email: "harsh@sketch.dev",
      connectedAt: "2026-02-15T10:30:00Z",
      source: "via Sketch",
    },
    {
      id: "u-2",
      name: "Rohan Nijhara",
      email: "rohan@sketch.dev",
      connectedAt: "2026-02-16T14:00:00Z",
      source: "via web",
    },
    {
      id: "u-3",
      name: "Priya Sharma",
      email: "priya@sketch.dev",
      connectedAt: "2026-02-20T09:15:00Z",
      source: "via Sketch",
    },
    {
      id: "u-4",
      name: "Alex Chen",
      email: "alex@sketch.dev",
      connectedAt: "2026-03-01T11:45:00Z",
      source: "via Sketch",
      revoked: true,
    },
    {
      id: "u-5",
      name: "Maya Patel",
      email: "maya@sketch.dev",
      connectedAt: "2026-03-03T16:20:00Z",
      source: "via web",
    },
  ];

  const [integrations, setIntegrations] = useState<Integration[]>([
    {
      id: "int-1",
      service: "ClickUp",
      description: "Project management",
      icon: "CU",
      color: "#7B68EE",

      connectedUsers: 3,
      totalUsers: 5,
      tools: [
        { id: "cu-1", name: "clickup-get-tasks", category: "read", permission: "always_allow" },
        { id: "cu-2", name: "clickup-get-spaces", category: "read", permission: "always_allow" },
        { id: "cu-3", name: "clickup-get-lists", category: "read", permission: "always_allow" },
        { id: "cu-4", name: "clickup-create-task", category: "write", permission: "needs_approval" },
        { id: "cu-5", name: "clickup-update-task", category: "write", permission: "needs_approval" },
        { id: "cu-6", name: "clickup-delete-task", category: "write", permission: "needs_approval" },
        { id: "cu-7", name: "clickup-create-comment", category: "write", permission: "needs_approval" },
      ],
      userDetails: MOCK_TEAM_USERS.slice(0, 3),
    },
    {
      id: "int-2",
      service: "Slack",
      description: "Team messaging",
      icon: "SL",
      color: "#4A154B",

      connectedUsers: 5,
      totalUsers: 5,
      tools: [
        { id: "sl-1", name: "slack-list-channels", category: "read", permission: "always_allow" },
        { id: "sl-2", name: "slack-read-messages", category: "read", permission: "always_allow" },
        { id: "sl-3", name: "slack-get-users", category: "read", permission: "always_allow" },
        { id: "sl-4", name: "slack-send-message", category: "write", permission: "needs_approval" },
        { id: "sl-5", name: "slack-update-message", category: "write", permission: "needs_approval" },
        { id: "sl-6", name: "slack-delete-message", category: "write", permission: "never" },
      ],
      userDetails: MOCK_TEAM_USERS,
    },
    {
      id: "int-3",
      service: "Google Calendar",
      description: "Calendar & scheduling",
      icon: "GC",
      color: "#4285F4",
      connectedUsers: 3,
      totalUsers: 5,
      tools: [
        { id: "gc-1", name: "gcal-list-events", category: "read", permission: "always_allow" },
        { id: "gc-2", name: "gcal-get-event", category: "read", permission: "always_allow" },
        { id: "gc-3", name: "gcal-create-event", category: "write", permission: "needs_approval" },
        { id: "gc-4", name: "gcal-update-event", category: "write", permission: "needs_approval" },
        { id: "gc-5", name: "gcal-delete-event", category: "write", permission: "never" },
      ],
      userDetails: MOCK_TEAM_USERS.slice(0, 3),
    },
    {
      id: "int-4",
      service: "Gmail",
      description: "Email",
      icon: "GM",
      color: "#EA4335",

      connectedUsers: 2,
      totalUsers: 5,
      tools: [
        { id: "gm-1", name: "gmail-search", category: "read", permission: "always_allow" },
        { id: "gm-2", name: "gmail-get-message", category: "read", permission: "always_allow" },
        { id: "gm-3", name: "gmail-get-thread", category: "read", permission: "always_allow" },
        { id: "gm-4", name: "gmail-send-email", category: "write", permission: "needs_approval" },
        { id: "gm-5", name: "gmail-reply", category: "write", permission: "needs_approval" },
        { id: "gm-6", name: "gmail-trash-message", category: "write", permission: "never" },
        { id: "gm-7", name: "gmail-create-draft", category: "write", permission: "needs_approval" },
      ],
      userDetails: MOCK_TEAM_USERS.slice(0, 2),
    },
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
  const { provider, setProvider, mcpServers, setMcpServers, integrations, setIntegrations, isLoading } = useMockData();

  // TODO: derive from auth.email === adminEmail when backend supports it
  const isAdmin = true;

  const [showAddMcpDialog, setShowAddMcpDialog] = useState(false);
  const [editingMcp, setEditingMcp] = useState<McpServer | null>(null);
  const [removingMcp, setRemovingMcp] = useState<McpServer | null>(null);
  const [viewingMcpTools, setViewingMcpTools] = useState<McpServer | null>(null);
  const [providerFlow, setProviderFlow] = useState<ProviderFlow>(null);
  const [managingIntegration, setManagingIntegration] = useState<Integration | null>(null);
  const [showAddIntegrationDialog, setShowAddIntegrationDialog] = useState(false);
  const alreadyAddedServices = new Set(integrations.map((i) => i.service));

  const handleAddIntegration = (app: CatalogApp) => {
    const meta = getCatalogMeta(app.name);
    const newIntegration: Integration = {
      id: `int-${Date.now()}`,
      service: app.name,
      description: app.description,
      icon: meta.icon,
      color: meta.color,

      connectedUsers: 1,
      totalUsers: 5,
      tools: app.defaultTools.map((t) => ({ ...t, id: `${t.id}-${Date.now()}` })),
      userDetails: [
        {
          id: "u-1",
          name: "Harsh Kalra",
          email: "harsh@sketch.dev",
          connectedAt: new Date().toISOString(),
          source: "via web",
        },
      ],
    };
    setIntegrations((prev) => [...prev, newIntegration]);
    setShowAddIntegrationDialog(false);
    toast.success(`${app.name} connected`);
    // Open the manage modal after connection (defaults to My permissions tab)
    setTimeout(() => setManagingIntegration(newIntegration), 300);
  };

  const handleProviderConnected = (type: "canvas" | "composio") => {
    setProvider({ type, status: "connected" });
    setProviderFlow(null);
    toast.success(`${type === "canvas" ? "Canvas" : "Composio"} connected`);
  };

  const handleReconnect = () => {
    setProviderFlow({ step: "canvas", reconnect: true });
  };

  const handleAddMcp = (server: Omit<McpServer, "id" | "status" | "toolCount" | "isIntegrationProvider">) => {
    const newServer: McpServer = {
      ...server,
      id: `mcp-${Date.now()}`,
      status: "active",
      toolCount: 12,
    };
    setMcpServers((prev) => [...prev, newServer]);
    setShowAddMcpDialog(false);
    toast.success(`${server.name} added — ${newServer.toolCount} tools available`);
  };

  const handleUpdateToolPermission = (integrationId: string, toolId: string, permission: ToolPermission) => {
    setIntegrations((prev) =>
      prev.map((int) =>
        int.id === integrationId
          ? { ...int, tools: int.tools.map((t) => (t.id === toolId ? { ...t, permission } : t)) }
          : int,
      ),
    );
  };

  const handleBulkUpdatePermission = (
    integrationId: string,
    category: "read" | "write",
    permission: ToolPermission,
  ) => {
    setIntegrations((prev) =>
      prev.map((int) =>
        int.id === integrationId
          ? { ...int, tools: int.tools.map((t) => (t.category === category ? { ...t, permission } : t)) }
          : int,
      ),
    );
  };

  const handleUpdateMcp = (id: string, updates: Partial<McpServer>) => {
    setMcpServers((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
    setEditingMcp(null);
    toast.success("MCP server updated");
  };

  const handleRemoveMcp = (id: string) => {
    const removed = mcpServers.find((s) => s.id === id);
    setMcpServers((prev) => prev.filter((s) => s.id !== id));
    setRemovingMcp(null);
    toast(`${removed?.name ?? "Server"} removed`, {
      action: {
        label: "Undo",
        onClick: () => {
          if (removed) setMcpServers((prev) => [...prev, removed]);
        },
      },
      duration: 10000,
    });
  };

  const handleTestMcpConnection = (server: McpServer) => {
    setMcpServers((prev) => prev.map((s) => (s.id === server.id ? { ...s, status: "authenticating" } : s)));
    setTimeout(() => {
      setMcpServers((prev) =>
        prev.map((s) => (s.id === server.id ? { ...s, status: s.url.endsWith("/sse") ? "active" : "error" } : s)),
      );
    }, 1500);
  };

  const handleDisconnectSelf = (integrationId: string) => {
    const integration = integrations.find((i) => i.id === integrationId);
    setIntegrations((prev) =>
      prev.map((i) =>
        i.id === integrationId
          ? {
              ...i,
              connectedUsers: Math.max(0, i.connectedUsers - 1),
              userDetails: i.userDetails.filter((u) => u.id !== CURRENT_USER_ID),
            }
          : i,
      ),
    );
    setManagingIntegration(null);
    toast.success(`Disconnected from ${integration?.service ?? "integration"}`);
  };

  const handleDisconnectAll = (integrationId: string) => {
    const integration = integrations.find((i) => i.id === integrationId);
    setIntegrations((prev) =>
      prev.map((i) => (i.id === integrationId ? { ...i, connectedUsers: 0, userDetails: [] } : i)),
    );
    setManagingIntegration(null);
    toast.success(`All members disconnected from ${integration?.service ?? "integration"}`);
  };

  const isDegraded = provider?.status === "key_expired";

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
              <IntegrationProviderBanner onConnect={() => setProviderFlow({ step: "selector" })} />
            ) : (
              <>
                {isDegraded && <DegradedProviderBanner provider={provider} onReconnect={handleReconnect} />}
                <IntegrationsList
                  integrations={integrations}
                  provider={provider}
                  onManage={setManagingIntegration}
                  onAdd={() => setShowAddIntegrationDialog(true)}
                />
              </>
            )}

            {/* MCP Servers — admin only */}
            {isAdmin && (
              <McpServersList
                servers={mcpServers}
                onAdd={() => setShowAddMcpDialog(true)}
                onEdit={setEditingMcp}
                onRemove={setRemovingMcp}
                onViewTools={setViewingMcpTools}
                onTestConnection={handleTestMcpConnection}
              />
            )}
          </>
        )}
      </div>

      {/* Provider flow modals */}
      <ProviderSelectorModal
        open={providerFlow?.step === "selector"}
        onOpenChange={(open) => !open && setProviderFlow(null)}
        onSelectCanvas={() => setProviderFlow({ step: "canvas" })}
        onSelectComingSoon={(p) => setProviderFlow({ step: "coming-soon", provider: p })}
      />

      <ConnectCanvasModal
        open={providerFlow?.step === "canvas"}
        reconnect={providerFlow?.step === "canvas" ? (providerFlow.reconnect ?? false) : false}
        onOpenChange={(open) => !open && setProviderFlow(null)}
        onBack={() => setProviderFlow({ step: "selector" })}
        onConnected={() => handleProviderConnected("canvas")}
      />

      <ComingSoonModal
        open={providerFlow?.step === "coming-soon"}
        provider={providerFlow?.step === "coming-soon" ? providerFlow.provider : "composio"}
        onOpenChange={(open) => !open && setProviderFlow(null)}
        onBack={() => setProviderFlow({ step: "selector" })}
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

      <ViewMcpToolsDialog server={viewingMcpTools} onOpenChange={(open) => !open && setViewingMcpTools(null)} />

      <ManageIntegrationDialog
        integration={managingIntegration}
        isAdmin={isAdmin}
        onOpenChange={(open) => !open && setManagingIntegration(null)}
        onUpdateToolPermission={handleUpdateToolPermission}
        onBulkUpdatePermission={handleBulkUpdatePermission}
        onDisconnectSelf={handleDisconnectSelf}
        onDisconnectAll={handleDisconnectAll}
      />

      <AddIntegrationDialog
        open={showAddIntegrationDialog}
        onOpenChange={setShowAddIntegrationDialog}
        alreadyAdded={alreadyAddedServices}
        isAdmin={isAdmin}
        onConnect={handleAddIntegration}
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
// Degraded Provider Banner (key_expired state)
// ---------------------------------------------------------------------------

function DegradedProviderBanner({
  provider,
  onReconnect,
}: {
  provider: NonNullable<IntegrationProvider>;
  onReconnect: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/20">
      <WarningIcon size={20} weight="fill" className="shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Canvas connection lost</p>
        <p className="text-xs text-amber-700 dark:text-amber-300">Re-enter your API key to restore integrations.</p>
      </div>
      <Button size="sm" variant="outline" onClick={onReconnect} className="shrink-0">
        Reconnect
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Integrations List
// ---------------------------------------------------------------------------

function IntegrationsList({
  integrations,
  provider,
  onManage,
  onAdd,
}: {
  integrations: Integration[];
  provider: NonNullable<IntegrationProvider>;
  onManage: (integration: Integration) => void;
  onAdd: () => void;
}) {
  const providerLabel = provider.type === "canvas" ? "Canvas" : "Composio";

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-muted-foreground">Integrations</p>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            ✦ via {providerLabel}
          </Badge>
        </div>
        <Button size="sm" className="gap-1.5" onClick={onAdd}>
          <PlusIcon size={14} weight="bold" />
          Add integration
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {integrations.map((integration, i) => (
          <IntegrationRow
            key={integration.id}
            integration={integration}
            isLast={i === integrations.length - 1}
            onManage={() => onManage(integration)}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Integration Row — card with icon, name, category, status, action
// ---------------------------------------------------------------------------

function IntegrationRow({
  integration,
  isLast,
  onManage,
}: {
  integration: Integration;
  isLast: boolean;
  onManage: () => void;
}) {
  return (
    <div className={`flex items-center gap-4 px-4 py-4 ${isLast ? "" : "border-b border-border"}`}>
      {/* Service icon — 36×36 rounded-lg with coloured background */}
      <div
        className="flex shrink-0 items-center justify-center text-[11px] font-bold text-white"
        style={{ width: 36, height: 36, backgroundColor: integration.color, borderRadius: 8 }}
      >
        {integration.icon}
      </div>

      {/* Name + category/users on two lines */}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-semibold">{integration.service}</span>
        <span className="text-xs text-muted-foreground">
          {integration.description}
          {integration.connectedUsers > 0 && (
            <>
              {" · "}
              <span className="font-mono">{integration.connectedUsers} users</span>
            </>
          )}
        </span>
      </div>

      {/* Status */}
      <div className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-success" />
        <span className="text-xs text-muted-foreground">Connected</span>
      </div>

      {/* Action button */}
      <Button variant="ghost" size="sm" className="text-xs" onClick={onManage}>
        Manage
      </Button>
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
  onViewTools,
  onTestConnection,
}: {
  servers: McpServer[];
  onAdd: () => void;
  onEdit: (server: McpServer) => void;
  onRemove: (server: McpServer) => void;
  onViewTools: (server: McpServer) => void;
  onTestConnection: (server: McpServer) => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">MCP Servers</p>
        <Button size="sm" className="gap-1.5" onClick={onAdd}>
          <PlusIcon size={14} weight="bold" />
          New server
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
              onViewTools={() => onViewTools(server)}
              onTestConnection={() => onTestConnection(server)}
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
  onViewTools,
  onTestConnection,
}: {
  server: McpServer;
  isLast: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onViewTools: () => void;
  onTestConnection: () => void;
}) {
  return (
    <div className={`flex items-center gap-4 px-4 py-4 ${isLast ? "" : "border-b border-border"}`}>
      <div className="flex size-9 items-center justify-center rounded-full bg-muted">
        <GearIcon size={16} className="text-muted-foreground" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium">{server.name}</span>
        <span className="truncate text-xs font-mono text-muted-foreground">{server.url}</span>
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
          <DropdownMenuItem onClick={onViewTools}>
            <EyeIcon size={14} className="mr-2" />
            View tools
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onEdit}>
            <PencilSimpleIcon size={14} className="mr-2" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onTestConnection}>
            <PlugIcon size={14} className="mr-2" />
            Test connection
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
  const color =
    status === "active"
      ? "bg-success"
      : status === "inactive"
        ? "bg-muted-foreground/40"
        : status === "error"
          ? "bg-destructive"
          : "bg-warning";
  const label =
    status === "active" ? "Active" : status === "inactive" ? "Inactive" : status === "error" ? "Error" : "Connecting…";

  return (
    <div className="flex items-center gap-1.5">
      <span className={`size-2 rounded-full ${color} ${status === "authenticating" ? "animate-pulse" : ""}`} />
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
      <p className="mt-4 text-sm font-medium">No MCP servers configured</p>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground">
        Connect a custom MCP server to give the agent access to your internal tools.
      </p>
      <Button size="sm" className="mt-4 gap-1.5" onClick={onAdd}>
        <PlusIcon size={14} weight="bold" />
        New server
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Provider logos — inline SVGs for Canvas, Composio, Nango
// ---------------------------------------------------------------------------
// Provider Selector Modal — choose Canvas, Composio, or Nango
// ---------------------------------------------------------------------------

const PROVIDER_CARDS: {
  id: "canvas" | "composio" | "nango";
  name: string;
  description: string;
  logo: { light: string; dark: string };
  available: boolean;
}[] = [
  {
    id: "canvas",
    name: "Canvas",
    description: "Per-user OAuth for 2,700+ services. Each team member connects their own accounts securely.",
    logo: { light: "/logos/canvas-light.png", dark: "/logos/canvas-dark.png" },
    available: true,
  },
  {
    id: "composio",
    name: "Composio",
    description: "AI-native integration toolkit with 250+ tools. Built for agentic workflows.",
    logo: { light: "/logos/composio-light.png", dark: "/logos/composio-dark.png" },
    available: false,
  },
  {
    id: "nango",
    name: "Nango",
    description: "Open-source unified API for 250+ integrations. Self-hostable.",
    logo: { light: "/logos/nango-light.png", dark: "/logos/nango-dark.png" },
    available: false,
  },
];

function ProviderSelectorModal({
  open,
  onOpenChange,
  onSelectCanvas,
  onSelectComingSoon,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectCanvas: () => void;
  onSelectComingSoon: (provider: "composio" | "nango") => void;
}) {
  const { theme } = useTheme();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect a provider</DialogTitle>
          <DialogDescription>
            Choose an integration provider to enable per-user app connections for your workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          {PROVIDER_CARDS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                if (p.available) onSelectCanvas();
                else onSelectComingSoon(p.id as "composio" | "nango");
              }}
              className="group flex w-full items-center gap-4 rounded-lg border border-border p-4 text-left transition-colors hover:bg-[#F7F7FA] hover:border-[#C8C8D2] dark:hover:bg-[#282829] dark:hover:border-[#6A6A6E]"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg">
                <img src={p.logo[theme]} alt={p.name} className="size-10 rounded-lg object-contain" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">{p.name}</p>
                  {p.available ? (
                    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 text-[10px] px-1.5 py-0">
                      Available
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      Coming soon
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{p.description}</p>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Connect Canvas Modal — steps + API key input
// ---------------------------------------------------------------------------

function ConnectCanvasModal({
  open,
  reconnect,
  onOpenChange,
  onBack,
  onConnected,
}: {
  open: boolean;
  reconnect: boolean;
  onOpenChange: (open: boolean) => void;
  onBack: () => void;
  onConnected: () => void;
}) {
  const { theme } = useTheme();
  const [apiKey, setApiKey] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    if (!apiKey.trim()) return;
    setError(null);
    setIsConnecting(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    if (apiKey.trim().length < 6) {
      setError("Invalid API key. Check and try again.");
      setIsConnecting(false);
      return;
    }
    setIsConnecting(false);
    setApiKey("");
    setError(null);
    onConnected();
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setApiKey("");
      setIsConnecting(false);
      setError(null);
    }
    onOpenChange(next);
  };

  const STEPS = [
    {
      num: 1,
      text: (
        <>
          Go to{" "}
          <a
            href="https://usecanvas.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            usecanvas.dev
            <ArrowSquareOutIcon size={12} />
          </a>
        </>
      ),
    },
    { num: 2, text: "Create an account or sign in" },
    { num: 3, text: "Navigate to API Keys" },
    { num: 4, text: "Copy your API key" },
  ];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton={reconnect}>
        {!reconnect && <DialogBackRow label="Choose provider" onBack={onBack} />}

        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <img
              src={theme === "dark" ? "/logos/canvas-dark.png" : "/logos/canvas-light.png"}
              alt="Canvas"
              className="size-8 rounded-lg object-contain"
            />
            {reconnect ? "Reconnect Canvas" : "Connect Canvas"}
          </DialogTitle>
          <DialogDescription>
            {reconnect
              ? "Your Canvas API key has expired. Enter a new key to restore integrations."
              : "Canvas provides per-user OAuth for 2,700+ services."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Steps card */}
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
              How to get your API key
            </p>
            <ol className="space-y-2.5">
              {STEPS.map((s) => (
                <li key={s.num} className="flex items-start gap-3">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                    {s.num}
                  </span>
                  <span className="text-sm text-foreground/80">{s.text}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* API key input */}
          <div className="space-y-1.5">
            <Label htmlFor="canvas-api-key">API Key</Label>
            <Input
              id="canvas-api-key"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                if (error) setError(null);
              }}
              placeholder="cvs_..."
              disabled={isConnecting}
              className={`font-mono text-xs focus-visible:ring-0 ${error ? "border-destructive" : ""}`}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleConnect} disabled={!apiKey.trim() || isConnecting}>
            {isConnecting ? (
              <>
                <SpinnerGapIcon size={14} className="animate-spin" />
                Connecting…
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
// Coming Soon Modal — for Composio and Nango
// ---------------------------------------------------------------------------

const COMING_SOON_INFO: Record<
  "composio" | "nango",
  {
    name: string;
    color: string;
    logo: { light: string; dark: string };
    description: string;
    detail: string;
    url: string;
  }
> = {
  composio: {
    name: "Composio",
    color: "#1F1F1F",
    logo: { light: "/logos/composio-light.png", dark: "/logos/composio-dark.png" },
    description: "AI-native integration toolkit with 250+ tools built for agentic workflows.",
    detail: "Composio support is on our roadmap. We're working on deep integration with their agent-first API.",
    url: "https://github.com/canvasxai/sketch",
  },
  nango: {
    name: "Nango",
    color: "#1F1F1F",
    logo: { light: "/logos/nango-light.png", dark: "/logos/nango-dark.png" },
    description: "Open-source unified API for 250+ integrations. Self-hostable and extensible.",
    detail: "Nango support is on our roadmap. We're exploring their open-source API for self-hosted deployments.",
    url: "https://github.com/canvasxai/sketch",
  },
};

function ComingSoonModal({
  open,
  provider,
  onOpenChange,
  onBack,
}: {
  open: boolean;
  provider: "composio" | "nango";
  onOpenChange: (open: boolean) => void;
  onBack: () => void;
}) {
  const { theme } = useTheme();
  const info = COMING_SOON_INFO[provider];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogBackRow label="Choose provider" onBack={onBack} />

        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <img src={info.logo[theme]} alt={info.name} className="size-8 rounded-lg object-contain" />
            {info.name}
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              Coming soon
            </Badge>
          </DialogTitle>
          <DialogDescription>{info.description}</DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-sm text-foreground/80">{info.detail}</p>
            <p className="mt-3 text-xs text-muted-foreground">Want to help? Contributions are welcome.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" asChild>
            <a href={info.url} target="_blank" rel="noopener noreferrer" className="gap-1.5">
              <ArrowSquareOutIcon size={14} />
              Contribute on GitHub
            </a>
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
  onAdd: (server: Omit<McpServer, "id" | "status" | "toolCount" | "isIntegrationProvider">) => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [bearerToken, setBearerToken] = useState("");
  const [showAuth, setShowAuth] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [testState, setTestState] = useState<"idle" | "testing" | "success" | "fail">("idle");

  const resetAndClose = () => {
    setName("");
    setUrl("");
    setBearerToken("");
    setShowAuth(false);
    setIsAdding(false);
    setTestState("idle");
    onOpenChange(false);
  };

  const handleTestConnection = async () => {
    setTestState("testing");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setTestState(url.trim().endsWith("/sse") ? "success" : "fail");
  };

  const handleAdd = async () => {
    if (!name.trim() || !url.trim()) return;
    setIsAdding(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    setIsAdding(false);
    onAdd({
      name: name.trim(),
      url: url.trim(),
      ...(bearerToken.trim() && { bearerToken: bearerToken.trim() }),
    });
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
          <DialogTitle>Add MCP server</DialogTitle>
          <DialogDescription>Connect an MCP server to give the agent access to its tools.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="mcp-name">Server name</Label>
            <Input
              id="mcp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. GitHub, Sentry, Internal Tools"
              disabled={isAdding}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mcp-url">Server URL</Label>
            <Input
              id="mcp-url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (testState !== "idle") setTestState("idle");
              }}
              placeholder="https://mcp.example.com/sse"
              disabled={isAdding}
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">Must end in /sse</p>
          </div>

          {/* Authentication */}
          <div>
            <button
              type="button"
              onClick={() => setShowAuth(!showAuth)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <CaretIcon direction={showAuth ? "up" : "down"} />
              Authentication (optional)
            </button>

            {showAuth && (
              <div className="mt-3 space-y-1.5">
                <Label htmlFor="mcp-bearer-token">Bearer token</Label>
                <Input
                  id="mcp-bearer-token"
                  type="password"
                  value={bearerToken}
                  onChange={(e) => setBearerToken(e.target.value)}
                  disabled={isAdding}
                  className="font-mono text-xs"
                />
              </div>
            )}
          </div>

          {/* Test connection */}
          <div className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestConnection}
              disabled={!url.trim() || testState === "testing" || isAdding}
            >
              {testState === "testing" ? (
                <>
                  <SpinnerGapIcon size={14} className="animate-spin" />
                  Testing…
                </>
              ) : (
                "Test connection"
              )}
            </Button>

            {testState === "success" && (
              <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                <CheckIcon size={14} weight="bold" />
                Connected — 12 tools available
              </p>
            )}
            {testState === "fail" && (
              <p className="flex items-center gap-1.5 text-xs text-destructive">
                <XCircleIcon size={14} weight="bold" />
                Could not reach server. Check the URL and try again.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleAdd} disabled={!name.trim() || !url.trim() || isAdding}>
            {isAdding ? (
              <>
                <SpinnerGapIcon size={14} className="animate-spin" />
                Adding…
              </>
            ) : (
              "Add server"
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
  const [bearerToken, setBearerToken] = useState("");
  const [showAuth, setShowAuth] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testState, setTestState] = useState<"idle" | "testing" | "success" | "fail">("idle");

  const [lastServerId, setLastServerId] = useState<string | null>(null);
  if (server && server.id !== lastServerId) {
    setName(server.name);
    setUrl(server.url);
    setBearerToken(server.bearerToken ?? "");
    setShowAuth(!!server.bearerToken);
    setTestState("idle");
    setLastServerId(server.id);
  }
  if (!server && lastServerId) {
    setLastServerId(null);
  }

  const handleTestConnection = async () => {
    setTestState("testing");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setTestState(url.trim().endsWith("/sse") ? "success" : "fail");
  };

  const handleSave = async () => {
    if (!server || !name.trim() || !url.trim()) return;
    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    setIsSaving(false);
    onSave(server.id, {
      name: name.trim(),
      url: url.trim(),
      ...(bearerToken.trim() ? { bearerToken: bearerToken.trim() } : { bearerToken: undefined }),
    });
  };

  const isDirty =
    server &&
    (name.trim() !== server.name || url.trim() !== server.url || bearerToken.trim() !== (server.bearerToken ?? ""));

  return (
    <Dialog open={!!server} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit MCP server</DialogTitle>
          <DialogDescription>Update the server connection settings.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-mcp-name">Server name</Label>
            <Input id="edit-mcp-name" value={name} onChange={(e) => setName(e.target.value)} disabled={isSaving} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-mcp-url">Server URL</Label>
            <Input
              id="edit-mcp-url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (testState !== "idle") setTestState("idle");
              }}
              disabled={isSaving}
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">Must end in /sse</p>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowAuth(!showAuth)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <CaretIcon direction={showAuth ? "up" : "down"} />
              Authentication (optional)
            </button>

            {showAuth && (
              <div className="mt-3 space-y-1.5">
                <Label htmlFor="edit-mcp-bearer-token">Bearer token</Label>
                <Input
                  id="edit-mcp-bearer-token"
                  type="password"
                  value={bearerToken}
                  onChange={(e) => setBearerToken(e.target.value)}
                  disabled={isSaving}
                  className="font-mono text-xs"
                />
              </div>
            )}
          </div>

          {/* Test connection */}
          <div className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestConnection}
              disabled={!url.trim() || testState === "testing" || isSaving}
            >
              {testState === "testing" ? (
                <>
                  <SpinnerGapIcon size={14} className="animate-spin" />
                  Testing…
                </>
              ) : (
                "Test connection"
              )}
            </Button>

            {testState === "success" && (
              <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                <CheckIcon size={14} weight="bold" />
                Connected — {server?.toolCount ?? 0} tools available
              </p>
            )}
            {testState === "fail" && (
              <p className="flex items-center gap-1.5 text-xs text-destructive">
                <XCircleIcon size={14} weight="bold" />
                Could not reach server. Check the URL and try again.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSave} disabled={!isDirty || !name.trim() || !url.trim() || isSaving}>
            {isSaving ? (
              <>
                <SpinnerGapIcon size={14} className="animate-spin" />
                Saving…
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
// View MCP Tools Dialog — read-only tool list
// ---------------------------------------------------------------------------

function ViewMcpToolsDialog({
  server,
  onOpenChange,
}: {
  server: McpServer | null;
  onOpenChange: (open: boolean) => void;
}) {
  if (!server) return null;

  // Mock tool names based on server name
  const mockTools = Array.from({ length: server.toolCount }, (_, i) => {
    const prefix = server.name.toLowerCase().replace(/\s+/g, "-");
    const actions = ["list", "get", "create", "update", "delete", "search", "sync", "export", "import", "archive"];
    const nouns = ["items", "users", "projects", "issues", "events", "records"];
    return `${prefix}-${actions[i % actions.length]}-${nouns[i % nouns.length]}`;
  });

  return (
    <Dialog open={!!server} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-full bg-muted">
              <GearIcon size={14} className="text-muted-foreground" />
            </div>
            {server.name} tools
          </DialogTitle>
          <DialogDescription>{server.toolCount} tools available from this server.</DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] overflow-y-auto py-2">
          <div className="rounded-lg border border-border bg-card">
            {mockTools.map((tool, i) => (
              <div
                key={tool}
                className={`px-4 py-2.5 text-xs font-mono text-muted-foreground ${
                  i < mockTools.length - 1 ? "border-b border-border" : ""
                }`}
              >
                {tool}
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Caret icon for collapsible sections
// ---------------------------------------------------------------------------

function CaretIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      className={`transition-transform ${direction === "up" ? "rotate-0" : "rotate-180"}`}
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2.5 7.5L6 4L9.5 7.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Tool permission toggle — 3-state: always_allow / needs_approval / never
// ---------------------------------------------------------------------------

const PERMISSION_OPTIONS: { value: ToolPermission; label: string; icon: React.ReactNode }[] = [
  {
    value: "always_allow",
    label: "Always allow",
    icon: <CheckIcon size={14} weight="bold" />,
  },
  {
    value: "needs_approval",
    label: "Needs approval",
    icon: <HandPalmIcon size={14} weight="bold" />,
  },
  {
    value: "never",
    label: "Never",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.2" />
        <line x1="3.5" y1="3.5" x2="10.5" y2="10.5" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    ),
  },
];

function PermissionToggle({
  value,
  onChange,
}: {
  value: ToolPermission;
  onChange: (p: ToolPermission) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
      {PERMISSION_OPTIONS.map((opt) => {
        const isActive = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            title={opt.label}
            onClick={() => onChange(opt.value)}
            className={`flex size-7 items-center justify-center rounded transition-colors ${
              isActive
                ? opt.value === "always_allow"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                  : opt.value === "needs_approval"
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                    : "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
                : "text-muted-foreground/40 hover:text-muted-foreground"
            }`}
          >
            {opt.icon}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bulk permission dropdown for a tool category
// ---------------------------------------------------------------------------

function BulkPermissionDropdown({
  currentPermission,
  onChange,
}: {
  currentPermission: ToolPermission | "mixed";
  onChange: (p: ToolPermission) => void;
}) {
  const label =
    currentPermission === "always_allow"
      ? "Always allow"
      : currentPermission === "needs_approval"
        ? "Needs approval"
        : currentPermission === "never"
          ? "Never"
          : "Mixed";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {currentPermission === "always_allow" && <CheckIcon size={12} weight="bold" className="text-emerald-600" />}
          {currentPermission === "needs_approval" && (
            <HandPalmIcon size={12} weight="bold" className="text-amber-600" />
          )}
          {label}
          <CaretIcon direction="down" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onChange("always_allow")}>
          <CheckIcon size={14} className="mr-2 text-emerald-600" />
          Always allow
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onChange("needs_approval")}>
          <HandPalmIcon size={14} weight="bold" className="mr-2 text-amber-600" />
          Needs approval
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onChange("never")}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="mr-2 text-red-500" aria-hidden="true">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.2" />
            <line x1="3.5" y1="3.5" x2="10.5" y2="10.5" stroke="currentColor" strokeWidth="1.2" />
          </svg>
          Never
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// Add Integration Dialog — search catalog + OAuth flow
// ---------------------------------------------------------------------------

type AddIntegrationStep =
  | { kind: "search" }
  | { kind: "oauth"; app: CatalogApp }
  | { kind: "oauth_cancelled"; app: CatalogApp }
  | { kind: "popup_blocked"; app: CatalogApp }
  | { kind: "connected"; app: CatalogApp };

function AddIntegrationDialog({
  open,
  onOpenChange,
  alreadyAdded,
  isAdmin,
  onConnect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alreadyAdded: Set<string>;
  isAdmin: boolean;
  onConnect: (app: CatalogApp) => void;
}) {
  const [step, setStep] = useState<AddIntegrationStep>({ kind: "search" });
  const [search, setSearch] = useState("");
  const [useSharedAccount, setUseSharedAccount] = useState(false);

  const resetAndClose = () => {
    setStep({ kind: "search" });
    setSearch("");
    setUseSharedAccount(false);
    onOpenChange(false);
  };

  const filteredCatalog = CATALOG.filter((app) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      app.name.toLowerCase().includes(q) ||
      app.description.toLowerCase().includes(q) ||
      app.category.toLowerCase().includes(q)
    );
  });

  const categories = [...new Set(filteredCatalog.map((a) => a.category))];

  const handleStartOAuth = (app: CatalogApp) => {
    if (alreadyAdded.has(app.name)) return;
    setStep({ kind: "oauth", app });
    setTimeout(() => {
      setStep({ kind: "connected", app });
    }, 2500);
  };

  const handleFinish = () => {
    if (step.kind === "connected") {
      onConnect(step.app);
    }
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
      <DialogContent className="sm:max-w-lg">
        {step.kind === "search" && (
          <>
            <DialogHeader>
              <DialogTitle>Add integration</DialogTitle>
              <DialogDescription>Search from 2,700+ apps available via Canvas.</DialogDescription>
            </DialogHeader>

            <div className="py-2">
              <div className="relative">
                <MagnifyingGlassIcon
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search integrations…"
                  autoFocus
                  className="pl-9"
                />
              </div>
            </div>

            <div className="max-h-[50vh] overflow-y-auto -mx-6 px-6">
              {filteredCatalog.length === 0 ? (
                <div className="flex flex-col items-center py-10 text-center">
                  <p className="text-sm text-muted-foreground">No integrations found for &ldquo;{search}&rdquo;</p>
                  <p className="mt-1 text-xs text-muted-foreground/60">
                    Try a different search term or browse the categories above.
                  </p>
                </div>
              ) : (
                categories.map((category) => (
                  <div key={category} className="mb-4">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
                      {category}
                    </p>
                    <div className="space-y-1">
                      {filteredCatalog
                        .filter((a) => a.category === category)
                        .map((app) => {
                          const isAdded = alreadyAdded.has(app.name);
                          return (
                            <button
                              key={app.id}
                              type="button"
                              onClick={() => handleStartOAuth(app)}
                              disabled={isAdded}
                              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                                isAdded ? "cursor-default opacity-50" : "hover:bg-muted/50"
                              }`}
                            >
                              <div
                                className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white"
                                style={{ backgroundColor: app.color }}
                              >
                                {app.icon}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium">{app.name}</p>
                                <p className="text-xs text-muted-foreground">{app.description}</p>
                              </div>
                              {isAdded ? (
                                <span className="text-xs text-muted-foreground">Already added</span>
                              ) : (
                                <span className="text-xs text-muted-foreground">{app.defaultTools.length} tools</span>
                              )}
                            </button>
                          );
                        })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {step.kind === "oauth" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <div
                  className="flex size-8 items-center justify-center rounded-lg text-[10px] font-bold text-white"
                  style={{ backgroundColor: step.app.color }}
                >
                  {step.app.icon}
                </div>
                Connecting {step.app.name}
              </DialogTitle>
              <DialogDescription>Authorising via OAuth — opens in a popup window.</DialogDescription>
            </DialogHeader>

            <div className="py-6">
              <div className="rounded-lg border border-border bg-muted/30 p-6">
                <div className="flex flex-col items-center text-center">
                  <div
                    className="flex size-14 items-center justify-center rounded-xl text-lg font-bold text-white"
                    style={{ backgroundColor: step.app.color }}
                  >
                    {step.app.icon}
                  </div>
                  <p className="mt-4 text-sm font-medium">Authorize Sketch to access {step.app.name}</p>
                  <div className="mt-5 flex items-center gap-2">
                    <SpinnerGapIcon size={16} className="animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Waiting for authorisation…</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {step.kind === "oauth_cancelled" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-full bg-muted">
                  <XCircleIcon size={16} className="text-muted-foreground" />
                </div>
                Authorisation cancelled
              </DialogTitle>
              <DialogDescription>
                You closed the authorisation window. {step.app.name} was not connected. Try again when ready.
              </DialogDescription>
            </DialogHeader>

            <DialogFooter>
              <Button onClick={() => handleStartOAuth(step.app)}>Try again</Button>
            </DialogFooter>
          </>
        )}

        {step.kind === "popup_blocked" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
                  <WarningIcon size={16} weight="fill" className="text-amber-600" />
                </div>
                Popup blocked
              </DialogTitle>
              <DialogDescription>
                Your browser blocked the authorisation popup. Allow popups for this page and try again.
              </DialogDescription>
            </DialogHeader>

            <DialogFooter>
              <Button onClick={() => handleStartOAuth(step.app)}>Try again</Button>
            </DialogFooter>
          </>
        )}

        {step.kind === "connected" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                  <CheckIcon size={16} weight="bold" className="text-emerald-600" />
                </div>
                {step.app.name} connected
              </DialogTitle>
              <DialogDescription>{step.app.defaultTools.length} tools are now available.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Available tools</p>
                <div className="flex flex-wrap gap-1.5">
                  {step.app.defaultTools.map((tool) => (
                    <span
                      key={tool.id}
                      className="rounded-md bg-muted px-2 py-1 text-xs font-mono text-muted-foreground"
                    >
                      {tool.name}
                    </span>
                  ))}
                </div>
              </div>

              {/* Admin only: use my account for all */}
              {isAdmin && (
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-4">
                  <input
                    type="checkbox"
                    checked={useSharedAccount}
                    onChange={(e) => setUseSharedAccount(e.target.checked)}
                    className="mt-0.5 size-4 rounded border-border accent-primary"
                  />
                  <div>
                    <p className="text-sm font-medium">Use my account for all workspace members</p>
                    <p className="text-xs text-muted-foreground">
                      The agent will use your credentials when acting on behalf of any team member.
                    </p>
                  </div>
                </label>
              )}
            </div>

            <DialogFooter>
              <Button className="w-full" onClick={handleFinish}>
                Configure permissions
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Manage Integration Dialog — tabbed: Members + My permissions
// ---------------------------------------------------------------------------

function ManageIntegrationDialog({
  integration,
  isAdmin,
  onOpenChange,
  onUpdateToolPermission,
  onBulkUpdatePermission,
  onDisconnectSelf,
  onDisconnectAll,
}: {
  integration: Integration | null;
  isAdmin: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdateToolPermission: (integrationId: string, toolId: string, permission: ToolPermission) => void;
  onBulkUpdatePermission: (integrationId: string, category: "read" | "write", permission: ToolPermission) => void;
  onDisconnectSelf: (integrationId: string) => void;
  onDisconnectAll: (integrationId: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<"members" | "permissions">("permissions");
  const [useSharedAccount, setUseSharedAccount] = useState(false);
  const [disconnectConfirm, setDisconnectConfirm] = useState<"self" | "all" | null>(null);

  if (!integration) return null;

  const readTools = integration.tools.filter((t) => t.category === "read");
  const writeTools = integration.tools.filter((t) => t.category === "write");

  const getBulkPermission = (tools: IntegrationTool[]): ToolPermission | "mixed" => {
    if (tools.length === 0) return "always_allow";
    const first = tools[0].permission;
    return tools.every((t) => t.permission === first) ? first : "mixed";
  };

  const revokedCount = integration.userDetails.filter((u) => u.revoked).length;
  const connectedCount = integration.userDetails.filter((u) => !u.revoked).length;

  return (
    <>
      <Dialog open={!!integration} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div
                className="flex size-8 items-center justify-center rounded-lg text-[10px] font-bold text-white"
                style={{ backgroundColor: integration.color }}
              >
                {integration.icon}
              </div>
              {integration.service}
            </DialogTitle>
            <DialogDescription>Choose when the agent is allowed to use these tools.</DialogDescription>
          </DialogHeader>

          {/* Tab bar — admin sees both (My permissions first), member sees permissions only */}
          {isAdmin && (
            <div className="-mx-6 flex border-b border-border px-6">
              <button
                type="button"
                onClick={() => setActiveTab("permissions")}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "permissions"
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                My permissions
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("members")}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "members"
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Members
              </button>
            </div>
          )}

          <div className="max-h-[60vh] overflow-y-auto py-2">
            {/* Members tab */}
            {(isAdmin ? activeTab === "members" : false) && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  {connectedCount} connected{revokedCount > 0 && ` · ${revokedCount} re-auth needed`}
                </p>

                <div className="rounded-lg border border-border bg-card">
                  {integration.userDetails.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                      No team members have connected yet.
                    </div>
                  ) : (
                    integration.userDetails.map((user, i) => {
                      const isCurrentUser = user.id === CURRENT_USER_ID;
                      return (
                        <div
                          key={user.id}
                          className={`flex items-center gap-3 px-4 py-3 ${
                            i < integration.userDetails.length - 1 ? "border-b border-border" : ""
                          } ${user.revoked ? "opacity-60" : ""}`}
                        >
                          <div
                            className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                              user.revoked
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {user.name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .slice(0, 2)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {user.name}
                              {isCurrentUser && <span className="ml-1 font-normal text-muted-foreground">(you)</span>}
                            </p>
                          </div>
                          {user.revoked ? (
                            <div className="flex items-center gap-1.5">
                              <WarningIcon size={14} weight="fill" className="text-amber-600" />
                              <span className="whitespace-nowrap text-xs text-amber-600 dark:text-amber-400">
                                Re-authorize via Sketch
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1.5">
                                <CheckIcon size={12} className="text-success" />
                                <span className="whitespace-nowrap text-xs text-muted-foreground">
                                  {new Date(user.connectedAt).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                  })}
                                </span>
                              </div>
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                {user.source}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Use my account for all — admin only, pinned at bottom of Members tab */}
                {isAdmin && (
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/30 p-4">
                    <input
                      type="checkbox"
                      checked={useSharedAccount}
                      onChange={(e) => setUseSharedAccount(e.target.checked)}
                      className="mt-0.5 size-4 rounded border-border accent-primary"
                    />
                    <div>
                      <p className="text-sm font-medium">Use my account for all workspace members</p>
                      <p className="text-xs text-muted-foreground">
                        The agent will use your credentials when acting on behalf of any team member.
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground/60 italic">
                        (Behaviour for existing connections TBD)
                      </p>
                    </div>
                  </label>
                )}

                {/* Disconnect all members — admin only, in Members tab */}
                {isAdmin && (
                  <div className="border-t border-border pt-4">
                    <Button variant="outline" className="w-full" onClick={() => setDisconnectConfirm("all")}>
                      Disconnect all members from {integration.service}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* My permissions tab */}
            {(isAdmin ? activeTab === "permissions" : true) && (
              <div className="space-y-5">
                {/* Info strip */}
                <div className="rounded-lg bg-muted/50 px-4 py-3">
                  <p className="text-xs text-muted-foreground">
                    These are your personal permissions for this integration. They only affect how the agent acts on
                    your behalf.
                  </p>
                </div>

                {/* Read-only tools */}
                {readTools.length > 0 && (
                  <ToolCategorySection
                    label="Read-only"
                    tools={readTools}
                    bulkPermission={getBulkPermission(readTools)}
                    onBulkChange={(p) => onBulkUpdatePermission(integration.id, "read", p)}
                    onToolChange={(toolId, p) => onUpdateToolPermission(integration.id, toolId, p)}
                  />
                )}

                {/* Write/delete tools */}
                {writeTools.length > 0 && (
                  <ToolCategorySection
                    label="Write / delete"
                    tools={writeTools}
                    bulkPermission={getBulkPermission(writeTools)}
                    onBulkChange={(p) => onBulkUpdatePermission(integration.id, "write", p)}
                    onToolChange={(toolId, p) => onUpdateToolPermission(integration.id, toolId, p)}
                  />
                )}

                {/* Legend */}
                <div className="space-y-1.5 rounded-lg bg-muted/30 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CheckIcon size={12} weight="bold" className="text-emerald-600" />
                    Always allow — agent runs without asking you
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <HandPalmIcon size={12} weight="bold" className="text-amber-600" />
                    Needs approval — agent pauses and asks first
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 14 14"
                      fill="none"
                      className="text-red-500"
                      aria-hidden="true"
                    >
                      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.2" />
                      <line x1="3.5" y1="3.5" x2="10.5" y2="10.5" stroke="currentColor" strokeWidth="1.2" />
                    </svg>
                    Never — tool is disabled for you
                  </div>
                </div>

                {/* Disconnect self — stays in My permissions tab */}
                <div className="border-t border-border pt-4">
                  <Button
                    variant="outline"
                    className="w-full border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/20"
                    onClick={() => setDisconnectConfirm("self")}
                  >
                    Disconnect my {integration.service} account
                  </Button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button className="w-full">Done</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disconnect self confirmation */}
      <AlertDialog open={disconnectConfirm === "self"} onOpenChange={(open) => !open && setDisconnectConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect your {integration.service} account?</AlertDialogTitle>
            <AlertDialogDescription>
              The agent will no longer be able to act as you in {integration.service}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setDisconnectConfirm(null);
                onDisconnectSelf(integration.id);
              }}
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Disconnect all confirmation */}
      <AlertDialog open={disconnectConfirm === "all"} onOpenChange={(open) => !open && setDisconnectConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect all members from {integration.service}?</AlertDialogTitle>
            <AlertDialogDescription>
              Every team member's OAuth connection will be removed. They'll need to reconnect via Sketch.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setDisconnectConfirm(null);
                onDisconnectAll(integration.id);
              }}
            >
              Disconnect all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Tool category section — collapsible group with bulk dropdown
// ---------------------------------------------------------------------------

function ToolCategorySection({
  label,
  tools,
  bulkPermission,
  onBulkChange,
  onToolChange,
}: {
  label: string;
  tools: IntegrationTool[];
  bulkPermission: ToolPermission | "mixed";
  onBulkChange: (p: ToolPermission) => void;
  onToolChange: (toolId: string, p: ToolPermission) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        >
          <CaretIcon direction={collapsed ? "down" : "up"} />
          {label}
          <span className="text-[10px] font-normal normal-case">{tools.length}</span>
        </button>
        <BulkPermissionDropdown currentPermission={bulkPermission} onChange={onBulkChange} />
      </div>

      {!collapsed && (
        <div className="mt-2 rounded-lg border border-border bg-card">
          {tools.map((tool, i) => (
            <div
              key={tool.id}
              className={`flex items-center justify-between px-4 py-3 ${i < tools.length - 1 ? "border-b border-border" : ""}`}
            >
              <span className="text-xs font-mono text-muted-foreground">{tool.name}</span>
              <PermissionToggle value={tool.permission} onChange={(p) => onToolChange(tool.id, p)} />
            </div>
          ))}
        </div>
      )}
    </div>
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
