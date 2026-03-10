/**
 * Files page — unified content library across all connected sources.
 *
 * Layout (top to bottom):
 * 1. Header — title + aggregate stats
 * 2. Source pills — thin horizontal chips (filter by click, "+" to connect, "Browse all" for full catalog)
 * 3. Toolbar — search + type/status filter dropdowns inline on one row
 * 4. File table — infinite list with multi-select, enrichment, detail sheet
 *
 * Source pills are pure filters — no management menus on individual pills.
 * Connector management (sync, details, connect new) lives in the "Browse all connectors" dialog.
 */
import {
  ConnectIntegrationDialog,
  FolderPicker,
  IntegrationIcon,
  SharedDrivePicker,
} from "@/components/connect-integration-dialog";
import { ConnectorLogo } from "@/components/connector-logos";
import { EnrichDialog } from "@/components/enrich-dialog";
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import type { ConnectorConfig, ConnectorFile, FileAccess, FileContent, UnifiedFile } from "@/lib/api";
import { api } from "@/lib/api";
import { INTEGRATIONS, type IntegrationDefinition, type IntegrationType, getIntegration } from "@/lib/integrations";
import {
  ArrowSquareOutIcon,
  ArrowsClockwiseIcon,
  CaretDownIcon,
  CheckCircleIcon,
  CheckSquareIcon,
  CircleNotchIcon,
  FileTextIcon,
  FolderSimpleIcon,
  GlobeIcon,
  GridFourIcon,
  LinkIcon,
  LockSimpleIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  SparkleIcon,
  SpinnerGapIcon,
  SquareIcon,
  TableIcon,
  TrashIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { dashboardRoute } from "./dashboard";

export const filesRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: "/files",
  component: FilesPage,
});

const PAGE_SIZE = 50;

function FilesPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilterRaw] = useState<string | null>(null);
  const setSourceFilter = useCallback((value: string | null) => {
    setSourceFilterRaw(value);
    setPageSize(PAGE_SIZE);
  }, []);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [accessFilter, setAccessFilter] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewingFile, setViewingFile] = useState<string | null>(null);
  const [showEnrichDialog, setShowEnrichDialog] = useState(false);
  const [connectingIntegration, setConnectingIntegration] = useState<IntegrationDefinition | null>(null);
  const [showBrowseAll, setShowBrowseAll] = useState(false);
  const [managingConnector, setManagingConnector] = useState<{
    definition: IntegrationDefinition;
    connector: ConnectorConfig;
  } | null>(null);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

  /* ── Data fetching ─────────────────────────────────────── */

  const { data: connectorsData, isLoading: isLoadingConnectors } = useQuery({
    queryKey: ["integrations"],
    queryFn: () => api.integrations.list(),
    refetchInterval: 30000,
  });

  const connectors = connectorsData?.connectors ?? [];

  /** Server-side source filter: connector type or undefined for all. "local" is handled client-side. */
  const serverSource = sourceFilter && sourceFilter !== "local" ? sourceFilter : undefined;

  /** Paginated file listing across all connectors. */
  const {
    data: filesData,
    isLoading: isLoadingFiles,
    isFetching: isFetchingFiles,
  } = useQuery({
    queryKey: ["all-files", pageSize, serverSource],
    queryFn: () => api.integrations.allFiles({ limit: pageSize, offset: 0, source: serverSource }),
    enabled: !!connectorsData,
    refetchInterval: 30000,
  });

  const allFiles: UnifiedFile[] = filesData?.files ?? [];
  const totalFiles = filesData?.total ?? 0;
  const hasMore = filesData?.hasMore ?? false;

  const loadMore = useCallback(() => {
    setPageSize((prev) => prev + PAGE_SIZE);
  }, []);

  /* ── Filter logic ──────────────────────────────────────── */

  const filteredFiles = useMemo(() => {
    let result = allFiles;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (f) =>
          f.fileName.toLowerCase().includes(q) ||
          f.sourcePath?.toLowerCase().includes(q) ||
          f.fileType?.toLowerCase().includes(q),
      );
    }

    // "local" source filter is client-side only (connector source filters are server-side)
    if (sourceFilter === "local") {
      result = result.filter((f) => f.source === "local");
    }
    if (typeFilter) {
      result = result.filter((f) => f.contentCategory === typeFilter);
    }
    if (statusFilter === "enriched") {
      result = result.filter((f) => f.hasSummary);
    } else if (statusFilter === "raw") {
      result = result.filter((f) => !f.hasSummary);
    }
    if (accessFilter) {
      result = result.filter((f) => f.accessScope === accessFilter);
    }

    return result;
  }, [allFiles, search, sourceFilter, typeFilter, statusFilter, accessFilter]);

  /* ── Derived stats ─────────────────────────────────────── */

  const enrichedCount = allFiles.filter((f) => f.hasSummary).length;
  const localFileCount = allFiles.filter((f) => f.source === "local").length;
  const hasAnyFilter = !!(sourceFilter || typeFilter || statusFilter || accessFilter || search.trim());
  /** Client-side-only filters that make "Load more" unreliable (server doesn't know about these). */
  const hasClientOnlyFilter = !!(
    typeFilter ||
    statusFilter ||
    accessFilter ||
    search.trim() ||
    sourceFilter === "local"
  );

  const connectedByType = new Map<string, ConnectorConfig>();
  for (const c of connectors) {
    connectedByType.set(c.connectorType, c);
  }

  /* ── Selection helpers ─────────────────────────────────── */

  const toggleSelect = (fileId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredFiles.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredFiles.map((f) => f.id)));
    }
  };

  const selectedConnectorId = useMemo(() => {
    if (selectedIds.size === 0) return null;
    const firstSelected = allFiles.find((f) => selectedIds.has(f.id));
    return firstSelected?.connectorId ?? null;
  }, [selectedIds, allFiles]);

  const handleConnected = () => {
    queryClient.invalidateQueries({ queryKey: ["integrations"] });
    queryClient.invalidateQueries({ queryKey: ["all-files"] });
  };

  const isLoading = isLoadingConnectors || isLoadingFiles;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Files</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your team's indexed knowledge base</p>
        </div>
        {!isLoadingConnectors && totalFiles > 0 && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              {totalFiles.toLocaleString()} file{totalFiles !== 1 ? "s" : ""}
            </span>
            {enrichedCount > 0 && (
              <>
                <span className="text-border">|</span>
                <span className="flex items-center gap-1">
                  <SparkleIcon size={12} weight="fill" className="text-primary" />
                  {enrichedCount} enriched
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Source pills — thin horizontal chips */}
      <div className="mt-5 flex items-center gap-1.5 flex-wrap">
        {/* "All" pill */}
        <SourceChip
          active={!sourceFilter}
          onClick={() => setSourceFilter(null)}
          label="All"
          count={totalFiles}
          icon={<FileTextIcon size={12} />}
        />

        {/* Local files */}
        <SourceChip
          active={sourceFilter === "local"}
          onClick={() => setSourceFilter(sourceFilter === "local" ? null : "local")}
          onClear={() => setSourceFilter(null)}
          label="Local"
          count={localFileCount}
          icon={<FolderSimpleIcon size={12} />}
        />

        {/* Connected source chips */}
        {INTEGRATIONS.map((def) => {
          const connector = connectedByType.get(def.type);
          if (!connector) return null;
          return (
            <SourceChip
              key={def.type}
              active={sourceFilter === def.type}
              onClick={() => setSourceFilter(sourceFilter === def.type ? null : def.type)}
              onClear={() => setSourceFilter(null)}
              label={def.name}
              count={connector.fileCount ?? 0}
              color={def.color}
              connectorType={def.type}
              status={connector.syncStatus}
            />
          );
        })}

        {/* Unconnected source "+" chips */}
        {INTEGRATIONS.map((def) => {
          if (connectedByType.has(def.type)) return null;
          return (
            <button
              key={def.type}
              type="button"
              onClick={() => setConnectingIntegration(def)}
              className="flex items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-border/80 hover:bg-muted/30 hover:text-foreground"
            >
              <PlusIcon size={10} />
              <ConnectorLogo type={def.type} size={10} />
              {def.name}
            </button>
          );
        })}

        {/* Browse all connectors */}
        <button
          type="button"
          onClick={() => setShowBrowseAll(true)}
          className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
        >
          <GridFourIcon size={12} />
          Browse all
        </button>
      </div>

      {/* Toolbar: search + refinement filters on a single line */}
      <div className="mt-4 flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <MagnifyingGlassIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files..."
            className="pl-9 text-sm"
          />
        </div>

        <FilterDropdown
          label="Type"
          value={typeFilter === "document" ? "Documents" : typeFilter === "structured" ? "Data" : null}
          options={[
            { value: "document", label: "Documents" },
            { value: "structured", label: "Data" },
          ]}
          onChange={setTypeFilter}
        />

        <FilterDropdown
          label="Access"
          value={accessFilter === "restricted" ? "Restricted" : accessFilter === "unrestricted" ? "Open" : null}
          options={[
            { value: "restricted", label: "Restricted" },
            { value: "unrestricted", label: "Open" },
          ]}
          onChange={setAccessFilter}
        />

        <FilterDropdown
          label="Status"
          value={statusFilter === "enriched" ? "Enriched" : statusFilter === "raw" ? "Raw" : null}
          options={[
            { value: "raw", label: "Raw" },
            { value: "enriched", label: "Enriched" },
          ]}
          onChange={setStatusFilter}
        />

        {selectedIds.size > 0 && selectedConnectorId && (
          <Button size="sm" onClick={() => setShowEnrichDialog(true)}>
            <SparkleIcon size={14} weight="fill" />
            Enrich {selectedIds.size} file{selectedIds.size === 1 ? "" : "s"}
          </Button>
        )}
      </div>

      {/* File List */}
      <div className="mt-4">
        {isLoading ? (
          <div className="space-y-2">
            {["fskel-1", "fskel-2", "fskel-3", "fskel-4", "fskel-5"].map((key) => (
              <Skeleton key={key} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
            <FileTextIcon size={32} className="text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">
              {hasAnyFilter ? "No files match your filters" : "No files indexed yet"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {hasAnyFilter ? "Try adjusting your search or filters" : "Connect a source above to start syncing files"}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-border px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <button type="button" onClick={toggleSelectAll} className="shrink-0">
                {selectedIds.size === filteredFiles.length && filteredFiles.length > 0 ? (
                  <CheckSquareIcon size={16} weight="fill" className="text-primary" />
                ) : (
                  <SquareIcon size={16} />
                )}
              </button>
              <span className="flex-1">Name</span>
              <span className="w-24 text-center">Source</span>
              <span className="w-16 text-center">Type</span>
              <span className="w-20 text-center">Access</span>
              <span className="w-20 text-center">Status</span>
              <span className="w-24 text-right">Synced</span>
              <span className="w-5" />
            </div>
            {filteredFiles.map((file) => (
              <UnifiedFileRow
                key={file.id}
                file={file}
                selected={selectedIds.has(file.id)}
                onToggleSelect={() => toggleSelect(file.id)}
                onView={() => setViewingFile(file.id)}
              />
            ))}

            {/* Load more button — hidden when client-only filters are active since server pagination doesn't account for them */}
            {hasMore && !hasClientOnlyFilter && (
              <div className="flex items-center justify-center py-4">
                <Button variant="outline" size="sm" onClick={loadMore} disabled={isFetchingFiles}>
                  {isFetchingFiles ? (
                    <>
                      <SpinnerGapIcon size={14} className="animate-spin" />
                      Loading...
                    </>
                  ) : (
                    `Load more (${allFiles.length} of ${totalFiles})`
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Browse All Connectors Dialog */}
      <BrowseConnectorsDialog
        open={showBrowseAll}
        onOpenChange={setShowBrowseAll}
        connectors={connectors}
        onConnect={(def) => {
          setShowBrowseAll(false);
          setConnectingIntegration(def);
        }}
        onManage={(def, connector) => {
          setShowBrowseAll(false);
          setManagingConnector({ definition: def, connector });
        }}
      />

      {/* Manage Connector Dialog */}
      <ManageConnectorDialog
        definition={managingConnector?.definition ?? null}
        connector={managingConnector?.connector ?? null}
        open={!!managingConnector}
        onOpenChange={(open) => !open && setManagingConnector(null)}
        onDisconnected={handleConnected}
        onReconnect={(def) => {
          setManagingConnector(null);
          setConnectingIntegration(def);
        }}
      />

      {/* Connect Dialog */}
      <ConnectIntegrationDialog
        integration={connectingIntegration}
        open={!!connectingIntegration}
        onOpenChange={(open) => !open && setConnectingIntegration(null)}
        onConnected={handleConnected}
      />

      {/* Enrich Dialog */}
      {selectedConnectorId && (
        <EnrichDialog
          connectorId={selectedConnectorId}
          fileIds={Array.from(selectedIds)}
          fileCount={selectedIds.size}
          integrationName={
            getIntegration(
              allFiles.find((f) => f.connectorId === selectedConnectorId)?.connectorType as IntegrationType,
            )?.name ?? "Source"
          }
          open={showEnrichDialog}
          onOpenChange={setShowEnrichDialog}
          onEnriched={() => {
            setSelectedIds(new Set());
            queryClient.invalidateQueries({ queryKey: ["integrations"] });
            queryClient.invalidateQueries({ queryKey: ["all-files"] });
          }}
        />
      )}

      {/* File Detail Sheet */}
      <FileDetailSheet fileId={viewingFile} onClose={() => setViewingFile(null)} />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * Source chip — thin horizontal pill that filters by source
 * ───────────────────────────────────────────────────────── */

function SourceChip({
  active,
  onClick,
  onClear,
  label,
  count,
  icon,
  color,
  connectorType,
  status,
}: {
  active: boolean;
  onClick: () => void;
  onClear?: () => void;
  label: string;
  count: number;
  icon?: React.ReactNode;
  color?: string;
  connectorType?: string;
  status?: string;
}) {
  const logo = connectorType ? <ConnectorLogo type={connectorType} size={12} style={{ color }} /> : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
        active
          ? "border-primary/40 bg-primary/5 text-foreground ring-1 ring-primary/20"
          : "border-border bg-card text-foreground hover:bg-muted/30"
      }`}
    >
      {icon || logo || <span className="inline-block size-2 rounded-sm" style={{ backgroundColor: color }} />}
      <span className="font-medium">{label}</span>
      <span className="text-muted-foreground">{count.toLocaleString()}</span>
      {status && <SyncStatusDot status={status} />}
      {active && onClear && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        >
          <XIcon size={10} />
        </button>
      )}
    </button>
  );
}

function SyncStatusDot({ status }: { status: string }) {
  switch (status) {
    case "active":
      return <CheckCircleIcon size={10} className="text-success" weight="fill" />;
    case "syncing":
      return <CircleNotchIcon size={10} className="animate-spin text-primary" />;
    case "error":
      return <WarningCircleIcon size={10} className="text-destructive" weight="fill" />;
    default:
      return null;
  }
}

/* ─────────────────────────────────────────────────────────
 * Browse All Connectors Dialog — full catalog for adding/managing sources
 * ───────────────────────────────────────────────────────── */

function BrowseConnectorsDialog({
  open,
  onOpenChange,
  connectors,
  onConnect,
  onManage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectors: ConnectorConfig[];
  onConnect: (def: IntegrationDefinition) => void;
  onManage: (def: IntegrationDefinition, connector: ConnectorConfig) => void;
}) {
  const connectedByType = new Map<string, ConnectorConfig>();
  for (const c of connectors) {
    connectedByType.set(c.connectorType, c);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>All connectors</DialogTitle>
          <DialogDescription>Connect external sources to sync files into your knowledge base.</DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-2">
          {INTEGRATIONS.map((def) => {
            const connector = connectedByType.get(def.type);
            return (
              <ConnectorRow
                key={def.type}
                definition={def}
                connector={connector ?? null}
                onConnect={() => onConnect(def)}
                onManage={() => {
                  if (connector) onManage(def, connector);
                }}
              />
            );
          })}
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">More connectors coming soon</p>
      </DialogContent>
    </Dialog>
  );
}

function ConnectorRow({
  definition,
  connector,
  onConnect,
  onManage,
}: {
  definition: IntegrationDefinition;
  connector: ConnectorConfig | null;
  onConnect: () => void;
  onManage: () => void;
}) {
  const queryClient = useQueryClient();
  const isConnected = !!connector;

  const syncMutation = useMutation({
    mutationFn: () => api.integrations.sync(connector?.id ?? ""),
    onSuccess: () => {
      toast.success("Sync started.");
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border p-3">
      <IntegrationIcon color={definition.color} name={definition.name} type={definition.type} size="sm" />

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{definition.name}</p>
        <p className="text-xs text-muted-foreground">
          {isConnected ? (
            <>
              {connector.fileCount != null && `${connector.fileCount.toLocaleString()} ${definition.itemNoun}`}
              {connector.lastSyncedAt && ` · Synced ${formatRelativeTime(connector.lastSyncedAt)}`}
            </>
          ) : (
            definition.description
          )}
        </p>
      </div>

      {isConnected ? (
        <div className="flex items-center gap-1.5">
          <SyncStatusDot status={connector.syncStatus} />
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => syncMutation.mutate()}
            disabled={connector.syncStatus === "syncing" || syncMutation.isPending}
          >
            <ArrowsClockwiseIcon size={14} className={connector.syncStatus === "syncing" ? "animate-spin" : ""} />
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onManage}>
            Manage
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onConnect}>
          <PlusIcon size={12} />
          Connect
        </Button>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * Manage Connector Dialog — status, sync scope, NL agent, actions
 *
 * Pattern B: status summary + natural language input for scope config.
 * The NL input will eventually be wired to an agent backend that
 * interprets instructions like "sync the Marketing folder" and
 * configures the connector's scope accordingly.
 * ───────────────────────────────────────────────────────── */

function ManageConnectorDialog({
  definition,
  connector,
  open,
  onOpenChange,
  onDisconnected,
  onReconnect,
}: {
  definition: IntegrationDefinition | null;
  connector: ConnectorConfig | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDisconnected: () => void;
  onReconnect: (def: IntegrationDefinition) => void;
}) {
  const queryClient = useQueryClient();
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  const syncMutation = useMutation({
    mutationFn: () => api.integrations.sync(connector?.id ?? ""),
    onSuccess: () => {
      toast.success("Sync started.");
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => api.integrations.disconnect(connector?.id ?? ""),
    onSuccess: () => {
      toast.success(`${definition?.name ?? "Connector"} disconnected.`);
      setShowDisconnectConfirm(false);
      onOpenChange(false);
      onDisconnected();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  /** Disconnect then re-open the connect dialog so the user can enter fresh credentials. */
  const reconnectMutation = useMutation({
    mutationFn: () => api.integrations.disconnect(connector?.id ?? ""),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      if (definition) onReconnect(definition);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!definition || !connector) return null;

  const isError = connector.syncStatus === "error";
  const isGoogleDrive = definition.type === "google_drive";

  /** Extract readable scope info from scopeConfig. */
  const scopeEntries = Object.entries(connector.scopeConfig ?? {}).filter(
    ([, v]) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0),
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5">
              <IntegrationIcon color={definition.color} name={definition.name} type={definition.type} />
              Manage {definition.name}
            </DialogTitle>
            <DialogDescription>{definition.description}</DialogDescription>
          </DialogHeader>

          {/* Status summary */}
          <div className="flex items-center gap-4 rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-xs">
            <div className="flex items-center gap-1.5">
              <SyncStatusDot status={connector.syncStatus} />
              <span className="font-medium capitalize">{connector.syncStatus}</span>
            </div>
            {connector.fileCount != null && (
              <span className="text-muted-foreground">
                {connector.fileCount.toLocaleString()} {definition.itemNoun}
              </span>
            )}
            {connector.lastSyncedAt && (
              <span className="text-muted-foreground">Synced {formatRelativeTime(connector.lastSyncedAt)}</span>
            )}
          </div>

          {/* Error banner with update credentials action */}
          {isError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3">
              {connector.errorMessage && <p className="text-xs text-destructive">{connector.errorMessage}</p>}
              <Button
                variant="outline"
                size="sm"
                className="mt-2 h-7 gap-1.5 text-xs"
                onClick={() => reconnectMutation.mutate()}
                disabled={reconnectMutation.isPending}
              >
                {reconnectMutation.isPending ? (
                  <>
                    <SpinnerGapIcon size={12} className="animate-spin" />
                    Reconnecting...
                  </>
                ) : (
                  <>
                    <ArrowsClockwiseIcon size={12} />
                    Update credentials
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Sync scope — Google Drive gets a drive picker, others get generic display */}
          {isGoogleDrive ? (
            <GoogleDriveScopeEditor connectorId={connector.id} scopeConfig={connector.scopeConfig} />
          ) : (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Sync scope — {definition.scopeLabel}
              </p>
              <div className="mt-1.5">
                {scopeEntries.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {scopeEntries.map(([key, value]) => (
                      <Badge key={key} variant="secondary" className="text-[10px]">
                        {Array.isArray(value) ? value.join(", ") : String(value)}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    All accessible {definition.scopeLabel} are being synced.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between border-t border-border pt-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-destructive hover:text-destructive"
              onClick={() => setShowDisconnectConfirm(true)}
            >
              <TrashIcon size={12} />
              Disconnect
            </Button>
            <div className="flex items-center gap-1.5">
              {!isError && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => reconnectMutation.mutate()}
                  disabled={reconnectMutation.isPending}
                >
                  {reconnectMutation.isPending ? (
                    <>
                      <SpinnerGapIcon size={12} className="animate-spin" />
                      Updating...
                    </>
                  ) : (
                    "Update credentials"
                  )}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => syncMutation.mutate()}
                disabled={connector.syncStatus === "syncing" || syncMutation.isPending}
              >
                <ArrowsClockwiseIcon size={12} className={connector.syncStatus === "syncing" ? "animate-spin" : ""} />
                {connector.syncStatus === "syncing" ? "Syncing..." : "Sync now"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Disconnect confirmation */}
      <AlertDialog open={showDisconnectConfirm} onOpenChange={setShowDisconnectConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {definition.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the connection and all indexed {definition.itemNoun} from {definition.name}. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnectMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ─────────────────────────────────────────────────────────
 * Google Drive Scope Editor — fetches drives and lets admin toggle them
 * ───────────────────────────────────────────────────────── */

function GoogleDriveScopeEditor({
  connectorId,
  scopeConfig,
}: {
  connectorId: string;
  scopeConfig: Record<string, unknown>;
}) {
  const queryClient = useQueryClient();
  const currentDriveIds = (scopeConfig?.sharedDrives as string[] | undefined) ?? [];
  const currentFolderIds = (scopeConfig?.folders as string[] | undefined) ?? [];
  const isSharedDriveMode = currentDriveIds.length > 0;

  /** Fetch available drives/folders from the existing connector's credentials. */
  const { data: browseData, isLoading: isBrowsing } = useQuery({
    queryKey: ["google-drive-browse", connectorId],
    queryFn: () => api.integrations.browseGoogleDriveExisting(connectorId),
  });

  const drives = browseData?.sharedDrives ?? [];
  const folders = browseData?.rootFolders ?? [];

  const [selectedDriveIds, setSelectedDriveIds] = useState<Set<string> | null>(null);
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string> | null>(null);

  const effectiveDriveIds = selectedDriveIds ?? new Set(drives.filter((d) => d.selected).map((d) => d.id));
  const effectiveFolderIds = selectedFolderIds ?? new Set(folders.filter((f) => f.selected).map((f) => f.id));

  const toggleDrive = (driveId: string) => {
    setSelectedDriveIds((prev) => {
      const base = prev ?? new Set(drives.filter((d) => d.selected).map((d) => d.id));
      const next = new Set(base);
      if (next.has(driveId)) next.delete(driveId);
      else next.add(driveId);
      return next;
    });
  };

  const toggleFolder = (folderId: string) => {
    setSelectedFolderIds((prev) => {
      const base = prev ?? new Set(folders.filter((f) => f.selected).map((f) => f.id));
      const next = new Set(base);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  /** Check if selection has changed from current scope. */
  const currentDriveSet = new Set(currentDriveIds);
  const currentFolderSet = new Set(currentFolderIds);

  const hasDriveChanges =
    selectedDriveIds !== null &&
    (effectiveDriveIds.size !== currentDriveSet.size || [...effectiveDriveIds].some((id) => !currentDriveSet.has(id)));

  const hasFolderChanges =
    selectedFolderIds !== null &&
    (effectiveFolderIds.size !== currentFolderSet.size ||
      [...effectiveFolderIds].some((id) => !currentFolderSet.has(id)));

  const hasChanges = isSharedDriveMode ? hasDriveChanges : hasFolderChanges;

  const saveMutation = useMutation({
    mutationFn: () => {
      const newScope = isSharedDriveMode
        ? { sharedDrives: Array.from(effectiveDriveIds) }
        : { folders: Array.from(effectiveFolderIds) };
      return api.integrations.updateScope(connectorId, newScope);
    },
    onSuccess: () => {
      toast.success("Scope updated. Re-sync started.");
      setSelectedDriveIds(null);
      setSelectedFolderIds(null);
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      queryClient.invalidateQueries({ queryKey: ["google-drive-browse", connectorId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const selectionCount = isSharedDriveMode ? effectiveDriveIds.size : effectiveFolderIds.size;
  const itemLabel = isSharedDriveMode ? "drive" : "folder";

  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {isSharedDriveMode ? "Synced shared drives" : "Synced folders"}
      </p>
      <div className="mt-1.5">
        {isBrowsing ? (
          <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
            <SpinnerGapIcon size={14} className="animate-spin" />
            Loading...
          </div>
        ) : isSharedDriveMode ? (
          <>
            <SharedDrivePicker
              drives={drives}
              selectedIds={effectiveDriveIds}
              onToggle={toggleDrive}
              disabled={saveMutation.isPending}
            />
            {hasChanges && (
              <SaveScopeButton
                onClick={() => saveMutation.mutate()}
                isPending={saveMutation.isPending}
                count={selectionCount}
                label={itemLabel}
              />
            )}
          </>
        ) : folders.length > 0 ? (
          <>
            <FolderPicker
              folders={folders}
              selectedIds={effectiveFolderIds}
              onToggle={toggleFolder}
              disabled={saveMutation.isPending}
            />
            {hasChanges && (
              <SaveScopeButton
                onClick={() => saveMutation.mutate()}
                isPending={saveMutation.isPending}
                count={selectionCount}
                label={itemLabel}
              />
            )}
          </>
        ) : (
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-3">
            <p className="text-xs font-medium">
              {currentFolderIds.length > 0
                ? `${currentFolderIds.length} folder${currentFolderIds.length === 1 ? "" : "s"} selected`
                : "All accessible files"}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Syncing files from your Google Drive.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SaveScopeButton({
  onClick,
  isPending,
  count,
  label,
}: { onClick: () => void; isPending: boolean; count: number; label: string }) {
  return (
    <Button size="sm" className="mt-2 h-7 w-full gap-1.5 text-xs" onClick={onClick} disabled={isPending || count === 0}>
      {isPending ? (
        <>
          <SpinnerGapIcon size={12} className="animate-spin" />
          Saving...
        </>
      ) : (
        `Save & re-sync (${count} ${label}${count === 1 ? "" : "s"})`
      )}
    </Button>
  );
}

/* ─────────────────────────────────────────────────────────
 * Filter dropdown component
 * ───────────────────────────────────────────────────────── */

function FilterDropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: { value: string; label: string }[];
  onChange: (value: string | null) => void;
}) {
  if (value) {
    return (
      <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => onChange(null)}>
        {value}
        <XIcon size={10} className="text-muted-foreground" />
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
          {label}
          <CaretDownIcon size={12} className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map((opt) => (
          <DropdownMenuItem key={opt.value} onClick={() => onChange(opt.value)}>
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ─────────────────────────────────────────────────────────
 * Unified file row
 * ───────────────────────────────────────────────────────── */

function UnifiedFileRow({
  file,
  selected,
  onToggleSelect,
  onView,
}: {
  file: UnifiedFile;
  selected: boolean;
  onToggleSelect: () => void;
  onView: () => void;
}) {
  const def = getIntegration(file.connectorType as IntegrationType);
  const Icon = file.contentCategory === "document" ? FileTextIcon : TableIcon;

  return (
    <div
      className={`flex items-center gap-3 border-b border-border px-3 py-2.5 text-sm transition-colors hover:bg-muted/30 ${
        selected ? "bg-primary/5" : ""
      }`}
    >
      <button type="button" onClick={onToggleSelect} className="shrink-0">
        {selected ? (
          <CheckSquareIcon size={16} weight="fill" className="text-primary" />
        ) : (
          <SquareIcon size={16} className="text-muted-foreground" />
        )}
      </button>

      <button type="button" onClick={onView} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <Icon size={16} className="shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{file.fileName}</p>
          {file.sourcePath && <p className="truncate text-[11px] text-muted-foreground">{file.sourcePath}</p>}
        </div>
      </button>

      <span className="w-24 text-center">
        {def ? (
          <Badge variant="outline" className="gap-1 text-[10px]">
            <ConnectorLogo type={def.type} size={10} style={{ color: def.color }} />
            {def.name}
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px]">
            {file.source}
          </Badge>
        )}
      </span>

      <span className="w-16 text-center">
        <Badge variant="secondary" className="text-[10px]">
          {file.contentCategory === "document" ? "Doc" : "Data"}
        </Badge>
      </span>

      <span className="w-20 text-center">
        {file.accessScope === "restricted" ? (
          <Badge variant="outline" className="gap-0.5 text-[10px] text-amber-500 border-amber-500/30">
            <LockSimpleIcon size={10} weight="fill" />
            {file.accessCount ?? 0}
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-0.5 text-[10px] text-muted-foreground">
            <GlobeIcon size={10} />
            Open
          </Badge>
        )}
      </span>

      <span className="w-20 text-center">
        {file.hasSummary ? (
          <Badge variant="outline" className="gap-0.5 text-[10px]">
            <SparkleIcon size={10} weight="fill" className="text-primary" />
            Enriched
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px]">
            Raw
          </Badge>
        )}
      </span>

      <span className="w-24 text-right text-xs text-muted-foreground">{formatRelativeTime(file.syncedAt)}</span>

      {file.providerUrl ? (
        <a
          href={file.providerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-5 shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          <ArrowSquareOutIcon size={14} />
        </a>
      ) : (
        <span className="w-5" />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * File detail sheet
 * ───────────────────────────────────────────────────────── */

function FileDetailSheet({ fileId, onClose }: { fileId: string | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["file-content", fileId],
    queryFn: () => api.integrations.fileContent(fileId as string),
    enabled: !!fileId,
  });

  const file = data?.file;
  const access = data?.access;

  return (
    <Sheet open={!!fileId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">{isLoading ? "Loading..." : (file?.fileName ?? "File")}</SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <div className="space-y-4 px-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-24 rounded-lg" />
            <Skeleton className="h-48 rounded-lg" />
          </div>
        ) : file ? (
          <FileDetailContent file={file} access={access ?? null} />
        ) : (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">File not found.</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function FileDetailContent({ file, access }: { file: FileContent; access: FileAccess | null }) {
  const def = getIntegration(file.source as IntegrationType);

  return (
    <div className="space-y-4 px-4 pb-6">
      <div className="flex flex-wrap gap-2">
        {def && (
          <Badge variant="outline" className="gap-1 text-[10px]">
            <ConnectorLogo type={def.type} size={10} style={{ color: def.color }} />
            {def.name}
          </Badge>
        )}
        {file.fileType && (
          <Badge variant="secondary" className="text-[10px]">
            {file.fileType}
          </Badge>
        )}
        {file.enrichmentStatus === "enriched" && (
          <Badge variant="outline" className="gap-0.5 text-[10px]">
            <SparkleIcon size={10} weight="fill" className="text-primary" />
            Enriched
          </Badge>
        )}
        {access && (
          <Badge
            variant="outline"
            className={`gap-0.5 text-[10px] ${access.scope === "restricted" ? "text-amber-500 border-amber-500/30" : "text-muted-foreground"}`}
          >
            {access.scope === "restricted" ? (
              <>
                <LockSimpleIcon size={10} weight="fill" />
                {access.members.length} users
              </>
            ) : (
              <>
                <GlobeIcon size={10} />
                Open
              </>
            )}
          </Badge>
        )}
      </div>

      {file.sourcePath && (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Path</p>
          <p className="mt-1 text-xs text-muted-foreground">{file.sourcePath}</p>
        </div>
      )}

      {file.providerUrl && (
        <a
          href={file.providerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          Open in source
          <ArrowSquareOutIcon size={12} />
        </a>
      )}

      {file.summary && (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">AI Summary</p>
          <div className="mt-1 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <p className="text-sm leading-relaxed">{file.summary}</p>
          </div>
        </div>
      )}

      {file.contextNote && (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Context Note</p>
          <p className="mt-1 text-sm text-muted-foreground">{file.contextNote}</p>
        </div>
      )}

      {file.tags && (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Tags</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {JSON.parse(file.tags).map((tag: string) => (
              <Badge key={tag} variant="secondary" className="text-[10px]">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {access && access.members.length > 0 && <AccessSection access={access} />}

      {file.content && (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Content Preview</p>
          <pre className="mt-1 max-h-96 overflow-auto rounded-lg border border-border bg-muted/30 p-3 text-xs leading-relaxed whitespace-pre-wrap">
            {file.content.length > 2000 ? `${file.content.slice(0, 2000)}\u2026` : file.content}
          </pre>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * Access section — compact inline display with expand
 * ───────────────────────────────────────────────────────── */

const COLLAPSED_MEMBER_LIMIT = 3;

/** Display name for a member — prefers userName, then email, then numeric ID. */
function memberDisplayName(member: { userName: string | null; providerEmail: string | null; providerUserId: string }) {
  if (member.userName) return member.userName;
  if (member.providerEmail) return member.providerEmail;
  return member.providerUserId;
}

/** First letter for avatar — prefers name, then email, falls back to "#". */
function memberInitial(member: { userName: string | null; providerEmail: string | null }) {
  if (member.userName) return member.userName[0].toUpperCase();
  if (member.providerEmail) return member.providerEmail[0].toUpperCase();
  return "#";
}

function AccessSection({ access }: { access: FileAccess }) {
  const [expanded, setExpanded] = useState(false);
  const members = access.members;
  const mappedCount = members.filter((m) => m.mapped).length;
  const showExpand = members.length > COLLAPSED_MEMBER_LIMIT;
  const visibleMembers = expanded ? members : members.slice(0, COLLAPSED_MEMBER_LIMIT);
  const hiddenCount = members.length - COLLAPSED_MEMBER_LIMIT;

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Access ({members.length})
        </p>
        {mappedCount > 0 && (
          <Badge variant="outline" className="text-[9px] text-green-500 border-green-500/30">
            {mappedCount} mapped
          </Badge>
        )}
      </div>

      {/* Collapsed inline preview */}
      {!expanded && (
        <button
          type="button"
          onClick={() => showExpand && setExpanded(true)}
          className={`mt-1.5 flex items-center gap-1 ${showExpand ? "cursor-pointer" : "cursor-default"}`}
        >
          {/* Stacked avatars */}
          <div className="flex -space-x-1.5">
            {visibleMembers.map((member) => (
              <div
                key={member.providerUserId}
                className={`flex size-6 items-center justify-center rounded-full border-2 border-background text-[9px] font-medium ${
                  member.mapped ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                }`}
                title={memberDisplayName(member)}
              >
                {memberInitial(member)}
              </div>
            ))}
          </div>
          <span className="ml-1 text-xs text-muted-foreground">
            {visibleMembers.map((m) => memberDisplayName(m)).join(", ")}
            {showExpand && <span className="ml-1 font-medium text-foreground">+{hiddenCount} more</span>}
          </span>
        </button>
      )}

      {/* Expanded full list */}
      {expanded && (
        <div className="mt-1.5 space-y-1">
          {members.map((member) => (
            <div
              key={member.providerUserId}
              className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5"
            >
              <div
                className={`flex size-6 items-center justify-center rounded-full text-[10px] font-medium ${
                  member.mapped ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                }`}
              >
                {memberInitial(member)}
              </div>
              <div className="min-w-0 flex-1">
                {member.userName ? (
                  <p className="truncate text-xs font-medium">{member.userName}</p>
                ) : member.providerEmail ? (
                  <p className="truncate text-xs text-muted-foreground">{member.providerEmail}</p>
                ) : (
                  <p className="truncate text-xs text-muted-foreground font-mono">{member.providerUserId}</p>
                )}
              </div>
              {member.mapped ? (
                <Badge variant="outline" className="text-[9px] text-green-500 border-green-500/30">
                  <LinkIcon size={8} className="mr-0.5" />
                  Mapped
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[9px]">
                  Unmapped
                </Badge>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="w-full rounded-md py-1 text-center text-[11px] text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors"
          >
            Show less
          </button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * Utilities
 * ───────────────────────────────────────────────────────── */

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
