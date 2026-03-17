import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { type AgentRunMessage, type AgentRunSummary, api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useDashboardAuth } from "@/routes/dashboard";
import {
  CaretLeftIcon,
  CaretRightIcon,
  ClockIcon,
  CurrencyDollarIcon,
  LightningIcon,
  SlackLogoIcon,
  SpinnerGapIcon,
  TimerIcon,
  UsersThreeIcon,
  WarningCircleIcon,
  WhatsappLogoIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
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

export function ActivityPage() {
  const auth = useDashboardAuth();
  const isAdmin = auth.role === "admin";
  const [offset, setOffset] = useState(0);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  const runsQuery = useQuery({
    queryKey: [RUNS_QUERY_KEY, offset],
    queryFn: () => api.agentRuns.list({ limit: PAGE_SIZE, offset }),
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

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div>
        <h1 className="text-xl font-bold">Activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isAdmin ? "Agent run history and usage across the workspace" : "Your agent run history"}
        </p>
      </div>

      {isAdmin && statsQuery.data ? <StatsCards stats={statsQuery.data} /> : null}

      <div className="mt-6">
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

function StatsCards({
  stats,
}: {
  stats: { totalCost: number; totalRuns: number; errorCount: number; activeUsers: number };
}) {
  const errorRate = stats.totalRuns > 0 ? ((stats.errorCount / stats.totalRuns) * 100).toFixed(1) : "0";

  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard icon={<CurrencyDollarIcon size={18} />} label="Total Cost (30d)" value={formatCost(stats.totalCost)} />
      <StatCard icon={<LightningIcon size={18} />} label="Total Runs (30d)" value={String(stats.totalRuns)} />
      <StatCard icon={<UsersThreeIcon size={18} />} label="Active Users (30d)" value={String(stats.activeUsers)} />
      <StatCard icon={<WarningCircleIcon size={18} />} label="Error Rate (30d)" value={`${errorRate}%`} />
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

  return (
    <div className="border-t border-border bg-muted/20 px-4 py-4">
      <dl className="mb-4 grid gap-3 text-sm sm:grid-cols-3">
        <DetailItem label="Session" value={run.sessionId.slice(0, 12)} />
        <DetailItem label="Cache read" value={formatTokens(run.cacheReadTokens)} />
        <DetailItem label="API time" value={formatDuration(run.durationApiMs)} />
        {run.errorType ? <DetailItem label="Error type" value={run.errorType} /> : null}
      </dl>

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
        <span className="text-xs font-medium uppercase text-muted-foreground">{message.role}</span>
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
