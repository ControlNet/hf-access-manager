"use client";

import * as React from "react";
import {
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ExternalLink,
  Shield,
  Lock,
  Globe,
  RefreshCw,
} from "lucide-react";
import { RepositoryStatus as IRepositoryStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface RepositoryStatusListProps {
  initialStatuses?: IRepositoryStatus[];
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Configured Repositories
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Operational health diagnostics for repositories defined in{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
              HF_REPOSITORIES
            </code>
            .
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchStatuses}
          disabled={isRefreshing}
          className="h-8 gap-1.5 text-xs"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          <span>{isRefreshing ? "Checking..." : "Recheck Health"}</span>
        </Button>
      </div>

      {loadError && <p role="alert" className="rounded border border-destructive/30 p-3 text-sm text-destructive">
        {loadError}. Recheck Health to retry; previous results may be stale.
      </p>}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-44 rounded-lg border bg-card p-5 animate-pulse" />
          ))}
        </div>
      ) : statuses.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {loadError ? "Repository health is currently unavailable." : "No repositories configured in HF_REPOSITORIES."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {statuses.map((item) => {
            const { repository, status, pendingCount, pendingHasMore, message, isPrivate, gated } = item;
            const repoUrl =
              repository.type === "dataset"
                ? `https://huggingface.co/datasets/${repository.repoId}`
                : `https://huggingface.co/${repository.repoId}`;

            return (
              <div
                key={`${repository.type}:${repository.repoId}`}
                className="flex flex-col justify-between rounded-lg border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant={repository.type} className="uppercase font-mono text-[10px]">
                      {repository.type}
                    </Badge>

                    {status === "connected" && (
                      <Badge variant="success" className="gap-1 text-[11px]">
                        <CheckCircle2 className="h-3 w-3" />
                        Connected
                      </Badge>
                    )}

                    {status === "unsupported" && (
                      <Badge variant="warning" className="gap-1 text-[11px]">
                        <HelpCircle className="h-3 w-3" />
                        Unsupported
                      </Badge>
                    )}

                    {status === "error" && (
                      <Badge variant="destructive" className="gap-1 text-[11px]">
                        <AlertCircle className="h-3 w-3" />
                        Error
                      </Badge>
                    )}
                  </div>

                  <div className="mt-3">
                    <a
                      href={repoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="group inline-flex items-center gap-1 font-mono text-sm font-semibold text-foreground hover:text-primary transition-colors truncate max-w-full"
                    >
                      <span className="truncate">{repository.repoId}</span>
                      <ExternalLink className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </a>
                  </div>

                  {/* Metadata tags */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    {typeof isPrivate === "boolean" && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted/60 rounded px-1.5 py-0.5">
                        {isPrivate ? <Lock className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                        {isPrivate ? "Private" : "Public"}
                      </span>
                    )}

                    {gated && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted/60 rounded px-1.5 py-0.5">
                        <Shield className="h-3 w-3" />
                        Gated ({gated})
                      </span>
                    )}
                  </div>

                  {message && (
                    <div className="mt-3 rounded bg-muted/50 p-2 text-xs text-muted-foreground border border-border/50">
                      {message}
                    </div>
                  )}
                </div>

                {status === "connected" && (
                  <div className="mt-4 pt-3 border-t flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Pending Requests:</span>
                    <span className="font-bold text-foreground font-mono text-sm">
                      {pendingCount ?? 0}
                      {pendingHasMore ? "+" : ""}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Informational callout */}
      <div className="rounded-lg border bg-muted/20 p-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground mb-1">
          How to configure managed repositories:
        </p>
        <p>
          Repositories are configured via the{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
            HF_REPOSITORIES
          </code>{" "}
          environment variable as comma-separated entries in format{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
            &lt;repo-type&gt;:&lt;owner&gt;/&lt;repo-name&gt;
          </code>
          . To add or modify repositories, update your environment configuration and restart the application.
        </p>
      </div>
    </div>
  );
}
