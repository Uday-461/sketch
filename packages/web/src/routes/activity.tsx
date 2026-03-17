import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { type AgentRunMessage, type AgentRunStats, type AgentRunSummary, api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useDashboardAuth } from "@/routes/dashboard";
import {
  CaretLeftIcon,
  CaretRightIcon,
  ClockIcon,
  CurrencyDollarIcon,
  DiscordLogoIcon,
  LightningIcon,
  SlackLogoIcon,
  SpinnerGapIcon,
  TelegramLogoIcon,
  TimerIcon,
  UsersThreeIcon,
  WarningCircleIcon,
  WhatsappLogoIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createRoute } from "@tanstack/react-router";
import { useState } from "react";
import { dashboardRoute } from "./dashboard";

export const activityRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: "/activity",
  component: ActivityPage,
});

const PAGE_SIZE = 25;
const RUNS_QUERY_KEY = "agent-runs";
const STATS_QUERY_KEY = "agent-runs-stats";

const PLATFORMS = [
  { value: "all", label: "All platforms" },
  { value: "slack", label: "Slack" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "telegram", label: "Telegram" },
  { value: "discord", label: "Discord" },
];

const DATE_PRESETS = [
  { value: "all", label: "All time" },
  { value: "1", label: "Today" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
];

function formatCost(value: number | null) {
  if (value == null || value === 0) return "$0.00";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

function formatTokens(value: number | null) {
  if (value == null) return "-";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function formatDuration(ms: number | null) {
  if (ms == null) return "-";
  if (ms < 1_000) return `${ms}ms`;
  return `${(ms / 1_000).toFixed(1)}s`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function PlatformIcon({ platform }: { platform: string }) {
  if (platform === "slack") return <SlackLogoIcon size={16} className="text-muted-foreground" />;
  if (platform === "whatsapp") return <WhatsappLogoIcon size={16} className="text-muted-foreground" />;
  if (platform === "telegram") return <TelegramLogoIcon size={16} className="text-muted-foreground" />;
  if (platform === "discord") return <DiscordLogoIcon size={16} className="text-muted-foreground" />;
  return <TimerIcon size={16} className="text-muted-foreground" />;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "success") {
    return <Badge className="shrink-0 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">Success</Badge>;
  }
  return (
    <Badge variant="destructive" className="shrink-0">
      Error
    </Badge>
  );
}

function getDateFromPreset(days: string): string | undefined {
  if (days === "all") return undefined;
  return new Date(Date.now() - Number(days) * 86_400_000).toISOString();
}

export function ActivityPage() {
  const auth = useDashboardAuth();
  const isAdmin = auth.role === "admin";
  const [offset, setOffset] = useState(0);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [platformFilter, setPlatformFilter] = useState("all");
  const [datePreset, setDatePreset] = useState("all");
  const [userFilter, setUserFilter] = useState("all");

  const dateFrom = getDateFromPreset(datePreset);

  const runsQuery = useQuery({
    queryKey: [RUNS_QUERY_KEY, offset, platformFilter, datePreset, userFilter],
    queryFn: () =>
      api.agentRuns.list({
        limit: PAGE_SIZE,
        offset,
        platform: platformFilter !== "all" ? platformFilter : undefined,
        dateFrom,
        userId: isAdmin && userFilter !== "all" ? userFilter : undefined,
      }),
  });

  const statsQuery = useQuery({
    queryKey: [STATS_QUERY_KEY],
    queryFn: () => api.agentRuns.stats(30),
    enabled: isAdmin,
  });

  const runs = runsQuery.data?.runs ?? [];
  const total = runsQuery.data?.total ?? 0;
  const hasNext = offset + PAGE_SIZE < total;
  const hasPrev = offset > 0;

  const handleFilterChange = (setter: (v: string) => void) => (value: string) => {
    setter(value);
    setOffset(0);
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div>
        <h1 className="text-xl font-bold">Activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isAdmin ? "Agent run history and usage across the workspace" : "Your agent run history"}
        </p>
      </div>

      {isAdmin ? <ModelTierSelector /> : null}

      {isAdmin && statsQuery.data ? <StatsCards stats={statsQuery.data} /> : null}

      {/* Filter bar */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Select value={platformFilter} onValueChange={handleFilterChange(setPlatformFilter)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PLATFORMS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={datePreset} onValueChange={handleFilterChange(setDatePreset)}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATE_PRESETS.map((d) => (
              <SelectItem key={d.value} value={d.value}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isAdmin && statsQuery.data?.costByUser && statsQuery.data.costByUser.length > 0 ? (
          <Select value={userFilter} onValueChange={handleFilterChange(setUserFilter)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All users" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All users</SelectItem>
              {statsQuery.data.costByUser.map((u) => (
                <SelectItem key={u.userId} value={u.userId}>
                  {u.userName ?? u.userId.slice(0, 8)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      <div className="mt-4">
        {runsQuery.isLoading ? (
          <LoadingSkeleton />
        ) : runsQuery.isError ? (
          <ErrorState />
        ) : runs.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                {isAdmin ? "All runs" : "Your runs"} ({total})
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-7"
                  disabled={!hasPrev}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  <CaretLeftIcon size={14} />
                </Button>
                <span className="px-2 text-xs text-muted-foreground">
                  {offset + 1}-{Math.min(offset + PAGE_SIZE, total)}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-7"
                  disabled={!hasNext}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  <CaretRightIcon size={14} />
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card">
              {runs.map((run, index) => (
                <RunRow
                  key={run.id}
                  run={run}
                  isAdmin={isAdmin}
                  isExpanded={expandedRunId === run.id}
                  isLast={index === runs.length - 1}
                  onToggle={() => setExpandedRunId((cur) => (cur === run.id ? null : run.id))}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const MODEL_TIER_QUERY_KEY = "model-tier";

const MODEL_TIERS = [
  { value: "haiku", label: "Haiku", description: "Fast & cheap" },
  { value: "sonnet", label: "Sonnet", description: "Balanced" },
  { value: "opus", label: "Opus", description: "Most capable" },
];

function ModelTierSelector() {
  const queryClient = useQueryClient();
  const tierQuery = useQuery({
    queryKey: [MODEL_TIER_QUERY_KEY],
    queryFn: () => api.settings.modelTier(),
  });

  const mutation = useMutation({
    mutationFn: (tier: string) => api.settings.setModelTier(tier),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [MODEL_TIER_QUERY_KEY] }),
  });

  const currentTier = tierQuery.data?.tier ?? "sonnet";

  return (
    <div className="mt-6 flex items-center gap-3 rounded-lg border border-border bg-card p-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Main model tier</p>
        <p className="text-xs text-muted-foreground">Controls the primary model used for chat responses</p>
      </div>
      <Select value={currentTier} onValueChange={(v) => mutation.mutate(v)} disabled={mutation.isPending}>
        <SelectTrigger className="w-[180px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MODEL_TIERS.map((t) => (
            <SelectItem key={t.value} value={t.value}>
              {t.label} — {t.description}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function StatsCards({ stats }: { stats: AgentRunStats }) {
  const errorRate = stats.totalRuns > 0 ? ((stats.errorCount / stats.totalRuns) * 100).toFixed(1) : "0";

  return (
    <div className="mt-6 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<CurrencyDollarIcon size={18} />}
          label="Total Cost (30d)"
          value={formatCost(stats.totalCost)}
        />
        <StatCard icon={<LightningIcon size={18} />} label="Total Runs (30d)" value={String(stats.totalRuns)} />
        <StatCard icon={<UsersThreeIcon size={18} />} label="Active Users (30d)" value={String(stats.activeUsers)} />
        <StatCard icon={<WarningCircleIcon size={18} />} label="Error Rate (30d)" value={`${errorRate}%`} />
      </div>

      {stats.costByPlatform && stats.costByPlatform.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {stats.costByPlatform.map((p) => (
            <div
              key={p.platform}
              className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs"
            >
              <PlatformIcon platform={p.platform} />
              <span className="font-medium capitalize">{p.platform}</span>
              <span className="text-muted-foreground">
                {p.runs} runs &middot; {formatCost(p.cost)}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {stats.costByUser && stats.costByUser.length > 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <div className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Top users by cost (30d)
          </div>
          <div className="divide-y divide-border">
            {stats.costByUser.slice(0, 5).map((u) => (
              <div key={u.userId} className="flex items-center justify-between px-3 py-1.5 text-sm">
                <span className="truncate">{u.userName ?? u.userId.slice(0, 12)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {u.runs} runs &middot; {formatCost(u.cost)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function RunRow({
  run,
  isAdmin,
  isExpanded,
  isLast,
  onToggle,
}: {
  run: AgentRunSummary;
  isAdmin: boolean;
  isExpanded: boolean;
  isLast: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={cn(!isLast && "border-b border-border")}>
      <button
        type="button"
        className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/50"
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
          <PlatformIcon platform={run.platform} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">
              {isAdmin && run.userName ? run.userName : run.platform}
            </span>
            {run.model ? <span className="truncate text-xs text-muted-foreground">{run.model}</span> : null}
          </div>
          <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
            <span>{formatCost(run.costUsd)}</span>
            <span>
              {formatTokens(run.inputTokens)}in / {formatTokens(run.outputTokens)}out
            </span>
            <span>{run.numTurns ?? 0} turns</span>
            <span>{formatDuration(run.durationMs)}</span>
          </div>
        </div>

        <StatusBadge status={run.status} />

        <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(run.createdAt)}</span>

        <CaretRightIcon
          size={14}
          className={cn("shrink-0 text-muted-foreground transition-transform", isExpanded && "rotate-90")}
        />
      </button>

      {isExpanded ? <RunDetail runId={run.id} /> : null}
    </div>
  );
}

function RunDetail({ runId }: { runId: string }) {
  const detailQuery = useQuery({
    queryKey: [RUNS_QUERY_KEY, runId],
    queryFn: () => api.agentRuns.get(runId),
  });

  if (detailQuery.isLoading) {
    return (
      <div className="border-t border-border bg-muted/20 px-4 py-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <SpinnerGapIcon size={14} className="animate-spin" />
          Loading transcript...
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="border-t border-border bg-muted/20 px-4 py-4">
        <p className="text-sm text-destructive">Failed to load run details.</p>
      </div>
    );
  }

  const { run, messages } = detailQuery.data;

  const toolsUsed: string[] = run.toolsUsedJson ? JSON.parse(run.toolsUsedJson) : [];
  const permissionDenials: unknown[] = run.permissionDenialsJson ? JSON.parse(run.permissionDenialsJson) : [];
  const errors: unknown[] = run.errorsJson ? JSON.parse(run.errorsJson) : [];
  const modelUsage: Record<string, { input_tokens?: number; output_tokens?: number; cost_usd?: number }> | null =
    run.modelUsageJson ? JSON.parse(run.modelUsageJson) : null;
  const sdkEvents: Array<{ type: string; subtype: string; data: Record<string, unknown>; timestamp: string }> =
    run.sdkEventsJson ? JSON.parse(run.sdkEventsJson) : [];

  return (
    <div className="border-t border-border bg-muted/20 px-4 py-4">
      <dl className="mb-4 grid gap-3 text-sm sm:grid-cols-3">
        <DetailItem label="Session" value={run.sessionId.slice(0, 12)} />
        <DetailItem label="Cache read" value={formatTokens(run.cacheReadTokens)} />
        <DetailItem label="Cache creation" value={formatTokens(run.cacheCreationTokens)} />
        <DetailItem label="API time" value={formatDuration(run.durationApiMs)} />
        {run.errorType ? <DetailItem label="Error type" value={run.errorType} /> : null}
      </dl>

      {run.litellmCostUsd != null ? (
        <div className="mb-3 rounded-md border border-border bg-card p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Cost comparison</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">SDK Estimated</span>
              <p className="font-medium">{formatCost(run.costUsd)}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Actual (LiteLLM)</span>
              <p className="font-medium">{formatCost(run.litellmCostUsd)}</p>
            </div>
          </div>
        </div>
      ) : null}

      {modelUsage ? (
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Model usage</p>
          <div className="overflow-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Model</th>
                  <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">Tokens In</th>
                  <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">Tokens Out</th>
                  <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">Cost (est.)</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(modelUsage).map(([modelName, usage]) => (
                  <tr key={modelName} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-1.5 font-mono">{modelName}</td>
                    <td className="px-3 py-1.5 text-right">{formatTokens(usage.input_tokens ?? null)}</td>
                    <td className="px-3 py-1.5 text-right">{formatTokens(usage.output_tokens ?? null)}</td>
                    <td className="px-3 py-1.5 text-right">{formatCost(usage.cost_usd ?? null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {toolsUsed.length > 0 ? (
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Tools used</p>
          <div className="flex flex-wrap gap-1">
            {toolsUsed.map((tool) => (
              <Badge key={tool} variant="secondary" className="text-xs">
                {tool}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      {sdkEvents.length > 0 ? (
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            SDK events ({sdkEvents.length})
          </p>
          <div className="space-y-1">
            {sdkEvents.map((evt, i) => (
              <div key={`${evt.subtype}-${i}`} className="flex items-center gap-2 text-xs">
                <Badge
                  variant="outline"
                  className={cn(
                    "shrink-0 text-[10px] px-1.5 py-0",
                    evt.subtype === "task_started" &&
                      "border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300",
                    evt.subtype === "task_notification" &&
                      "border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300",
                    evt.subtype === "compact_boundary" &&
                      "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300",
                    (evt.subtype === "hook_started" || evt.subtype === "hook_response") &&
                      "border-purple-300 text-purple-700 dark:border-purple-700 dark:text-purple-300",
                  )}
                >
                  {evt.subtype.replace(/_/g, " ")}
                </Badge>
                <span className="truncate text-muted-foreground">
                  {(evt.data.description as string) ??
                    (evt.data.hook_name as string) ??
                    (evt.data.status as string) ??
                    ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {permissionDenials.length > 0 ? (
        <div className="mb-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Permission denials ({permissionDenials.length})
          </p>
          <pre className="max-h-32 overflow-auto rounded border border-border bg-card p-2 text-xs">
            {JSON.stringify(permissionDenials, null, 2)}
          </pre>
        </div>
      ) : null}

      {errors.length > 0 ? (
        <div className="mb-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Errors</p>
          <pre className="max-h-32 overflow-auto rounded border border-destructive/30 bg-destructive/5 p-2 text-xs">
            {JSON.stringify(errors, null, 2)}
          </pre>
        </div>
      ) : null}

      {messages.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Transcript</p>
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {messages.map((msg) => (
              <TranscriptMessage key={msg.id} message={msg} />
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No transcript messages recorded.</p>
      )}
    </div>
  );
}

function TranscriptMessage({ message }: { message: AgentRunMessage }) {
  const isAssistant = message.role === "assistant";

  let contentPreview: string;
  try {
    const parsed = JSON.parse(message.contentJson);
    if (Array.isArray(parsed)) {
      const textParts = parsed
        .filter((block: { type: string; text?: string }) => block.type === "text" && block.text)
        .map((block: { text: string }) => block.text);
      contentPreview = textParts.join("\n") || "[tool use]";
    } else if (typeof parsed === "string") {
      contentPreview = parsed;
    } else {
      contentPreview = JSON.stringify(parsed).slice(0, 200);
    }
  } catch {
    contentPreview = message.contentJson.slice(0, 200);
  }

  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        isAssistant ? "border-border bg-card" : "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30",
      )}
    >
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase text-muted-foreground">{message.role}</span>
          {message.toolName ? (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {message.toolName}
            </Badge>
          ) : null}
        </div>
        {message.inputTokens != null || message.outputTokens != null ? (
          <span className="text-xs text-muted-foreground">
            {formatTokens(message.inputTokens)}in / {formatTokens(message.outputTokens)}out
          </span>
        ) : null}
      </div>
      <p className="whitespace-pre-wrap break-words text-sm">{contentPreview}</p>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="break-all text-sm text-foreground">{value}</dd>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <ClockIcon size={24} className="text-muted-foreground" />
      </div>
      <p className="mt-4 text-sm font-medium">No agent runs yet</p>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground">
        Agent runs will appear here once users start interacting with the bot.
      </p>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <WarningCircleIcon size={24} className="text-muted-foreground" />
      </div>
      <p className="mt-4 text-sm font-medium text-destructive">Failed to load activity.</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-7 w-24" />
      </div>
      <div className="rounded-lg border border-border bg-card">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={cn("flex items-center gap-4 px-4 py-3", i < 5 && "border-b border-border")}>
            <Skeleton className="size-8 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
