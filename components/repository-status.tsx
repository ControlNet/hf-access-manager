"use client";

import * as React from "react";
import { CircleAlert, ExternalLink, Globe, Lock, RefreshCw } from "lucide-react";
import { RepositoryStatus as IRepositoryStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface RepositoryStatusListProps {
  initialStatuses?: IRepositoryStatus[];
}

const GRID = "grid grid-cols-[minmax(0,1fr)_100px_112px] gap-4 lg:grid-cols-[minmax(0,1fr)_100px_112px_82px_82px_82px_150px]";

function Tile({ label, value, note, tone }: { label: string; value: string; note: string; tone?: string }) {
  return (
    <div className="rounded-lg border bg-card px-3.5 py-3">
      <div className="field-label">{label}</div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
        <span className={cn("font-mono text-[22px] font-semibold tabular", tone ?? "text-foreground")}>
          {value}
        </span>
        <span className="text-xs text-muted-foreground">{note}</span>
      </div>
    </div>
  );
}

export function RepositoryStatusList({ initialStatuses = [] }: RepositoryStatusListProps) {
  const [statuses, setStatuses] = React.useState<IRepositoryStatus[]>(initialStatuses);
  const [isLoading, setIsLoading] = React.useState(initialStatuses.length === 0);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const activeRead = React.useRef<AbortController | null>(null);

  const fetchStatuses = React.useCallback(async () => {
    activeRead.current?.abort();
    const controller = new AbortController();
    activeRead.current = controller;
    try {
      setIsRefreshing(true);
      setLoadError(null);
      const res = await fetch("/api/access/repositories", {
        cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(35_000)]),
      });
      if (!res.ok) {
        throw new Error(`Failed to check repository statuses (${res.status})`);
      }
      const json = await res.json();
      if (controller.signal.aborted) return;
      if (!Array.isArray(json.data)) throw new Error("Invalid repository health response");
      setStatuses(json.data);
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : "Error fetching repository health";
      setLoadError(message);
      toast.error(message);
    } finally {
      if (activeRead.current === controller) {
        activeRead.current = null;
        setIsRefreshing(false);
        setIsLoading(false);
      }
    }
  }, []);

  React.useEffect(() => {
    if (initialStatuses.length === 0) {
      fetchStatuses();
    }
    return () => { activeRead.current?.abort(); activeRead.current = null; };
  }, [initialStatuses.length, fetchStatuses]);

  const connected = statuses.filter((s) => s.status === "connected");
  const failing = statuses.filter((s) => s.status === "error");
  const unsupported = statuses.filter((s) => s.status === "unsupported");
  const loadedPending = connected.reduce((sum, s) => sum + (s.pendingCount ?? 0), 0);
  const pendingTruncated = connected.some((s) => s.pendingHasMore);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold -tracking-[0.015em] text-foreground">
            Configured repositories
          </h1>
          <p className="mt-1.5 text-[12.5px] leading-[1.5] text-muted-foreground">
            Read straight from{" "}
            <code className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs text-value">
              HF_REPOSITORIES
            </code>
            . This dashboard can only ever touch what is listed here.
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={fetchStatuses} disabled={isRefreshing} className="gap-1.5">
          <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} strokeWidth={1.6} />
          {isRefreshing ? "Checking..." : "Recheck Health"}
        </Button>
      </div>

      {loadError && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/[0.06] p-3 text-[12.5px] leading-[1.45] text-danger"
        >
          <CircleAlert className="mt-px h-4 w-4 shrink-0 text-destructive" strokeWidth={1.6} />
          <span>{loadError}. Recheck Health to retry; previous results may be stale.</span>
        </div>
      )}

      {statuses.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile
            label="Reachable"
            value={String(connected.length)}
            note={`of ${statuses.length} configured`}
            tone="text-success"
          />
          <Tile
            label="Pending loaded"
            value={`${loadedPending}${pendingTruncated ? "+" : ""}`}
            note={failing.length > 0 ? `${failing.length} repo down — incomplete` : "across reachable repositories"}
          />
          <Tile
            label="Failing"
            value={String(failing.length)}
            note={failing.length === 0 ? "none" : "see the rows below"}
            tone={failing.length > 0 ? "text-destructive" : "text-muted-foreground"}
          />
          <Tile
            label="Unsupported"
            value={String(unsupported.length)}
            note="Spaces have no gating API"
            tone="text-muted-foreground"
          />
        </div>
      )}

      {isLoading ? (
        <div className="overflow-hidden rounded-lg border bg-card">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse border-b border-divider bg-muted/60 last:border-b-0" />
          ))}
        </div>
      ) : statuses.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-[12.5px] text-muted-foreground">
          {loadError
            ? "Repository health is currently unavailable."
            : "No repositories configured in HF_REPOSITORIES."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className={cn(GRID, "hidden h-8 items-center bg-muted px-4 lg:grid")}>
            <span className="field-label">Repository</span>
            <span className="field-label">Visibility</span>
            <span className="field-label">Gating</span>
            <span className="field-label text-right">Pending</span>
            <span className="field-label text-right">Accepted</span>
            <span className="field-label text-right">Rejected</span>
            <span className="field-label text-right">State</span>
          </div>

          {statuses.map((item) => {
            const { repository, status, pendingCount, pendingHasMore, acceptedCount, rejectedCount, message, isPrivate, gated } = item;
            const repoUrl =
              repository.type === "dataset"
                ? `https://huggingface.co/datasets/${repository.repoId}`
                : `https://huggingface.co/${repository.repoId}`;
            const dash = <span className="text-xs text-muted-foreground/70">—</span>;

            return (
              <div
                key={`${repository.type}:${repository.repoId}`}
                className={cn(
                  GRID,
                  "items-center border-b border-divider px-4 py-3 last:border-b-0",
                  status === "error" && "bg-destructive/[0.04]",
                  status === "unsupported" && "opacity-75"
                )}
              >
                <div className="col-span-3 min-w-0 lg:col-span-1">
                  <div className="flex items-center gap-2.5">
                    <Badge variant={repository.type}>{repository.type}</Badge>
                    <a
                      href={repoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="group inline-flex min-w-0 items-center gap-1.5 font-mono text-[12.5px] text-foreground hover:text-primary"
                    >
                      <span className="truncate">{repository.repoId}</span>
                      <ExternalLink
                        className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                        strokeWidth={1.6}
                      />
                    </a>
                  </div>
                  {message && (
                    <p
                      className={cn(
                        "mt-1 text-[11.5px] leading-[1.4]",
                        status === "error" ? "text-danger" : "text-muted-foreground"
                      )}
                    >
                      {message}
                    </p>
                  )}
                </div>

                <div className="text-xs text-value">
                  {typeof isPrivate === "boolean" ? (
                    <span className="inline-flex items-center gap-1.5">
                      {isPrivate ? (
                        <Lock className="h-3 w-3 text-muted-foreground" strokeWidth={1.5} />
                      ) : (
                        <Globe className="h-3 w-3 text-muted-foreground" strokeWidth={1.5} />
                      )}
                      {isPrivate ? "Private" : "Public"}
                    </span>
                  ) : (
                    dash
                  )}
                </div>

                <div className="text-xs text-value">{gated ? `Gated (${gated})` : dash}</div>

                <div className="hidden text-right font-mono text-[13px] text-foreground tabular lg:block">
                  {status === "connected" ? `${pendingCount ?? 0}${pendingHasMore ? "+" : ""}` : dash}
                </div>
                <div className="hidden text-right font-mono text-[13px] text-muted-foreground tabular lg:block">
                  {status === "connected" && acceptedCount !== undefined ? acceptedCount : dash}
                </div>
                <div className="hidden text-right font-mono text-[13px] text-muted-foreground tabular lg:block">
                  {status === "connected" && rejectedCount !== undefined ? rejectedCount : dash}
                </div>

                <div className="col-span-3 flex items-center justify-between gap-2 lg:col-span-1 lg:justify-end">
                  <span className="flex items-center gap-2 text-xs lg:hidden">
                    <span className="field-label">Pending</span>
                    <span className="font-mono text-[13px] text-foreground tabular">
                      {status === "connected" ? `${pendingCount ?? 0}${pendingHasMore ? "+" : ""}` : "—"}
                    </span>
                  </span>

                  <span
                    className={cn(
                      "inline-flex items-center gap-2 text-xs",
                      status === "connected" && "text-success",
                      status === "error" && "text-danger",
                      status === "unsupported" && "text-muted-foreground"
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        status === "connected" && "bg-success",
                        status === "error" && "bg-destructive",
                        status === "unsupported" && "bg-muted-foreground"
                      )}
                    />
                    {status === "connected" ? "Connected" : status === "error" ? "Error" : "Unsupported"}
                  </span>

                  {status === "error" && (
                    <Button variant="outline" size="sm" onClick={fetchStatuses} disabled={isRefreshing}>
                      Retry
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11.5px] leading-[1.5] text-muted-foreground">
        Repositories are declared as comma-separated{" "}
        <code className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-value">
          &lt;repo-type&gt;:&lt;owner&gt;/&lt;repo-name&gt;
        </code>{" "}
        entries. Changing the list means changing the environment and restarting the app.
      </p>
    </div>
  );
}
