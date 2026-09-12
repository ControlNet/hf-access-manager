"use client";

import * as React from "react";
import {
  CircleAlert,
  Filter,
  Inbox,
  Loader2,
  PackageCheck,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { AccessRequest, ManagedRepository, RequestStatus } from "@/lib/types";
import {
  TabCountState,
  applyBulkActionRepoPendingCounts,
  applySingleActionRepoPendingCount,
  applySingleActionTabCounts,
  applyBulkActionTabCounts,
} from "@/lib/counts";
import {
  ABSOLUTE_MAX_PAGES,
  PAGE_INCREMENT,
  getNextPageLimit,
  isPaginationAtHardCap,
  shouldDisplayPaginationFooter,
} from "@/lib/pagination";
import { shouldUpdateRefreshTimestamp } from "@/lib/refresh";
import { AccessRequestRow } from "./access-request-row";
import { BulkActionsBar } from "./bulk-actions-bar";
import { RepositoryFilter } from "./repository-filter";
import { GrantAccessDialog } from "./grant-access-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";

const TAB_LABEL: Record<RequestStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
};

interface AccessRequestListProps {
  configuredRepositories: ManagedRepository[];
  initialStatus?: RequestStatus;
  refreshTrigger?: number;
  onRefreshChange?: (isRefreshing: boolean) => void;
  onRefreshed?: (timestamp: Date) => void;
}

export function AccessRequestList({
  configuredRepositories,
  initialStatus = "pending",
  refreshTrigger,
  onRefreshChange,
  onRefreshed,
}: AccessRequestListProps) {
  const [currentTab, setCurrentTab] = React.useState<RequestStatus>(initialStatus);
  const [requests, setRequests] = React.useState<AccessRequest[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(false);
  const [currentMaxPages, setCurrentMaxPages] = React.useState(initialStatus === "pending" ? 50 : 10);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const mutationLock = React.useRef(false);
  const readingRef = React.useRef(true);
  const mountedRef = React.useRef(true);
  const currentTabRef = React.useRef(currentTab);
  currentTabRef.current = currentTab;
  const pagesRef = React.useRef(currentMaxPages);
  pagesRef.current = currentMaxPages;
  const [repoErrors, setRepoErrors] = React.useState<
    Array<{ repo: ManagedRepository; error: string; code?: string }>
  >([]);

  // Selected request IDs for bulk actions
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  // Mutation loading states
  const [isMutating, setIsMutating] = React.useState(false);
  const [isBulkProcessing, setIsBulkProcessing] = React.useState(false);
  const [bulkActionInProgress, setBulkActionInProgress] = React.useState<"approve" | "reject" | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedRepoKey, setSelectedRepoKey] = React.useState("all");
  const [selectedType, setSelectedType] = React.useState("all");

  // Tab counts cache: only populated after a tab has actually been loaded
  const [tabCounts, setTabCounts] = React.useState<{
    pending?: TabCountState;
    accepted?: TabCountState;
    rejected?: TabCountState;
  }>({});

  // Pending counts by repository key for the dropdown badges
  const [repoPendingCounts, setRepoPendingCounts] = React.useState<Record<string, number>>({});
  const [repoPendingTruncated, setRepoPendingTruncated] = React.useState<Record<string, boolean>>({});

  // Callbacks refs for external refresh notifications
  const onRefreshChangeRef = React.useRef(onRefreshChange);
  onRefreshChangeRef.current = onRefreshChange;
  const onRefreshedRef = React.useRef(onRefreshed);
  onRefreshedRef.current = onRefreshed;

  // AbortController ref to cancel in-flight fetches on rapid tab switching or unmount
  const activeAbortControllerRef = React.useRef<AbortController | null>(null);

  // Fetch requests for active tab with AbortController race prevention
  const fetchTabRequests = React.useCallback(
    async (statusToFetch: RequestStatus, pagesLimit?: number, isAppending = false, reconcile = false) => {
      if (!mountedRef.current || (mutationLock.current && !reconcile)) return false;
      if (statusToFetch !== currentTabRef.current) return false;
      readingRef.current = true;
      setLoadError(null);
      // Abort any pending active fetch
      if (activeAbortControllerRef.current) {
        activeAbortControllerRef.current.abort();
      }
      const controller = new AbortController();
      activeAbortControllerRef.current = controller;

      try {
        onRefreshChangeRef.current?.(true);
        if (isAppending) {
          setIsLoadingMore(true);
        } else {
          setIsLoading(true);
        }

        const queryParams = new URLSearchParams({ status: statusToFetch });
        if (pagesLimit) {
          queryParams.set("maxPages", String(pagesLimit));
        }

        const res = await fetch(`/api/access/requests?${queryParams.toString()}`, {
          cache: "no-store",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(35_000)]),
        });

        if (!res.ok) {
          throw new Error(`Failed to load requests (${res.status})`);
        }

        const json = await res.json();
        const data = json.data;

        // Check if aborted before updating state
        if (controller.signal.aborted || statusToFetch !== currentTabRef.current || !mountedRef.current) {
          return false;
        }

        if (!data || !Array.isArray(data.requests) || !Array.isArray(data.errors)) throw new Error("Invalid dashboard response");
        setRepoErrors(data.errors);
        if (data.errors.length && data.requests.length === 0) {
          setTabCounts(prev => { const next = { ...prev }; delete next[statusToFetch]; return next; });
          throw new Error("Repositories could not be loaded. Refresh to retry; retained records may be stale.");
        }
        if (!data.errors.length && pagesLimit) setCurrentMaxPages(pagesLimit);
        const fetchedList: AccessRequest[] = data.requests;
        setRequests(fetchedList);
        setRepoErrors(data.errors || []);
        setHasMore(Boolean(data.hasMore));

        // Update count for current tab with truncation indicator
        setTabCounts((prev) => ({
          ...prev,
          [statusToFetch]: {
            count: fetchedList.length,
            isTruncated: Boolean(data.truncated || data.hasMore || data.errors.length),
          },
        }));

        // If fetching pending, calculate per-repo pending counts
        if (statusToFetch === "pending") {
          const counts: Record<string, number> = {};
          for (const key of Object.keys(data.repositoryPagination || {})) {
            if (!key.startsWith("space:")) counts[key] = 0;
          }
          for (const req of fetchedList) {
            const key = `${req.repository.type}:${req.repository.repoId}`;
            counts[key] = (counts[key] || 0) + 1;
          }
          setRepoPendingCounts(counts);

          if (data.repositoryPagination) {
            const truncatedMap: Record<string, boolean> = {};
            for (const [key, meta] of Object.entries(
              data.repositoryPagination as Record<string, { hasMore?: boolean; truncated?: boolean }>
            )) {
              if (meta?.hasMore || meta?.truncated) {
                truncatedMap[key] = true;
              }
            }
            setRepoPendingTruncated(truncatedMap);
          }
        }

        // Clear bulk selection on tab switch or reload
        const present = new Set(fetchedList.map(r => r.id));
        setSelectedIds(prev => isAppending ? new Set([...prev].filter(id => present.has(id))) : new Set());

        // Update refresh timestamp ONLY on verified successful fetch & state update
        if (shouldUpdateRefreshTimestamp({ success: data.errors.length === 0, aborted: controller.signal.aborted })) {
          onRefreshedRef.current?.(new Date());
        }
        return data.errors.length === 0;
      } catch (err: unknown) {
        if ((err as { name?: string }).name === "AbortError" || controller.signal.aborted) {
          // Ignore clean user-driven aborts
          return;
        }
        const msg = err instanceof Error ? err.message : "Network error loading requests";
        setLoadError(msg);
        toast.error(msg);
        return false;
      } finally {
        if (activeAbortControllerRef.current === controller && mountedRef.current) {
          activeAbortControllerRef.current = null;
          readingRef.current = false;
          setIsLoading(false);
          setIsLoadingMore(false);
          onRefreshChangeRef.current?.(mutationLock.current);
        }
      }
    },
    []
  );

  // Clean up abort controller on unmount
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (activeAbortControllerRef.current) {
        activeAbortControllerRef.current.abort();
        activeAbortControllerRef.current = null;
      }
      onRefreshChangeRef.current?.(false);
    };
  }, []);

  // Fetch only the active tab on mount or tab change (no eager background count loading!)
  React.useEffect(() => {
    const defaultPages = currentTab === "pending" ? 50 : 10;
    setCurrentMaxPages(defaultPages);
    fetchTabRequests(currentTab, defaultPages);
  }, [currentTab, fetchTabRequests]);

  // Handle external refresh trigger from Navbar without unmounting or resetting UI state
  const prevRefreshTriggerRef = React.useRef(refreshTrigger);
  React.useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger !== prevRefreshTriggerRef.current) {
      prevRefreshTriggerRef.current = refreshTrigger;
      fetchTabRequests(currentTab, currentMaxPages);
    }
  }, [refreshTrigger, currentTab, currentMaxPages, fetchTabRequests]);

  // Handle Tab Switch
  const handleTabChange = (val: string) => {
    const newStatus = val as RequestStatus;
    if (newStatus === currentTab || mutationLock.current) return;
    currentTabRef.current = newStatus;
    readingRef.current = true;
    activeAbortControllerRef.current?.abort();
    setIsLoading(true);
    setRequests([]);
    setRepoErrors([]);
    setLoadError(null);
    setCurrentTab(newStatus);
    setSelectedIds(new Set());
    setHasMore(false);
  };

  // Handle Load More (incremental pagination bounded by ABSOLUTE_MAX_PAGES)
  const handleLoadMore = () => {
    if (mutationLock.current || readingRef.current || isPaginationAtHardCap(currentMaxPages, ABSOLUTE_MAX_PAGES)) {
      return;
    }
    const nextPages = getNextPageLimit(currentMaxPages, PAGE_INCREMENT, ABSOLUTE_MAX_PAGES);
    if (nextPages === currentMaxPages) {
      return;
    }
    fetchTabRequests(currentTab, nextPages, true);
  };

  // Filtered requests based on search query, repo, and type
  const filteredRequests = React.useMemo(() => {
    return requests.filter((req) => {
      if (req.status !== currentTab) return false;
      // 1. Repo Type Filter
      if (selectedType !== "all" && req.repository.type !== selectedType) {
        return false;
      }

      // 2. Specific Repo Filter
      if (
        selectedRepoKey !== "all" &&
        `${req.repository.type}:${req.repository.repoId}` !== selectedRepoKey
      ) {
        return false;
      }

      // 3. Text Search Query
      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase().trim();
        const matchUsername = req.username.toLowerCase().includes(q);
        const matchName = req.fullName ? req.fullName.toLowerCase().includes(q) : false;
        const matchEmail = req.email ? req.email.toLowerCase().includes(q) : false;
        const matchRepo = req.repository.repoId.toLowerCase().includes(q);

        let matchFields = false;
        if (req.fields) {
          for (const val of Object.values(req.fields)) {
            if (typeof val === "string" && val.toLowerCase().includes(q)) {
              matchFields = true;
              break;
            }
          }
        }

        if (!matchUsername && !matchName && !matchEmail && !matchRepo && !matchFields) {
          return false;
        }
      }

      return true;
    });
  }, [requests, selectedType, selectedRepoKey, searchQuery, currentTab]);

  // Selection handlers
  const handleToggleSelect = (id: string) => {
    if (mutationLock.current || readingRef.current) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 100) {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (mutationLock.current || readingRef.current) return;
    const allVisibleIds = new Set(filteredRequests.slice(0, 100).map((r) => r.id));
    setSelectedIds(allVisibleIds);
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  // One synchronous lock covers all mutation entry points and snapshot commits.
  const beginMutation = () => {
    if (mutationLock.current || readingRef.current || loadError) return false;
    mutationLock.current = true;
    setIsMutating(true);
    onRefreshChangeRef.current?.(true);
    return true;
  };

  const reconcileMutation = async () => {
    try {
      if (mountedRef.current) await fetchTabRequests(currentTabRef.current, pagesRef.current, true, true);
    } finally {
      mutationLock.current = false;
      if (mountedRef.current) {
        setIsMutating(false);
        setIsBulkProcessing(false);
        setBulkActionInProgress(null);
        onRefreshChangeRef.current?.(false);
      }
    }
  };

  const postMutation = async (action: string, body: unknown) => {
    const response = await fetch(`/api/access/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(35_000),
    });
    const json = await response.json();
    if (!response.ok) throw Object.assign(new Error(json.error?.message || `Action failed (${response.status})`), { uncertain: response.status >= 500 });
    return json.data;
  };

  // A disconnected response does not prove the upstream mutation failed.
  const invalidateCounts = () => {
    setTabCounts({});
    setRepoPendingCounts({});
    setRepoPendingTruncated({});
  };

  const handleSingle = async (request: AccessRequest, action: "approve" | "reject" | "revoke"): Promise<boolean> => {
    if (!beginMutation()) return false;
    let success = false;
    try {
      await postMutation(action, { repo: request.repository, username: request.username });
      if (!mountedRef.current) return false;
      success = true;
      toast.success(`${action === "approve" ? "Access approved" : action === "reject" ? "Request rejected" : "Access revoked"} for @${request.username}`);
      setRequests(prev => prev.filter(r => r.id !== request.id));
      setSelectedIds(prev => new Set([...prev].filter(id => id !== request.id)));
      setRepoPendingCounts(prev => applySingleActionRepoPendingCount(prev, request, action, request.status));
      setTabCounts(prev => applySingleActionTabCounts(prev, request.status, action));
    } catch (err) {
      if (mountedRef.current) {
        if ((err as { uncertain?: boolean }).uncertain !== false) invalidateCounts();
        toast.error(`${err instanceof Error ? err.message : "Action could not be confirmed"}. Refreshing to verify the current state.`);
      }
    } finally {
      await reconcileMutation();
    }
    return success;
  };
  const handleApprove = (request: AccessRequest) => handleSingle(request, "approve");
  const handleReject = (request: AccessRequest) => handleSingle(request, "reject");
  const handleRevoke = (request: AccessRequest) => handleSingle(request, "revoke");

  const handleGrant = async (repo: ManagedRepository, username: string): Promise<boolean> => {
    if (!beginMutation()) return false;
    let success = false;
    try {
      await postMutation("grant", { repo, username });
      if (!mountedRef.current) return false;
      success = true;
      // Grant can move an existing pending/rejected user; the API does not return the source status.
      invalidateCounts();
    } catch (err) {
      if (mountedRef.current) {
        if ((err as { uncertain?: boolean }).uncertain !== false) invalidateCounts();
        toast.error(err instanceof Error ? err.message : "Grant could not be confirmed");
      }
    } finally {
      await reconcileMutation();
    }
    return success;
  };

  const handleBulk = async (action: "approve" | "reject") => {
    const selectedRequests = requests.filter(r => selectedIds.has(r.id) && r.status === "pending");
    if (!selectedRequests.length || selectedRequests.length > 100 || !beginMutation()) return;
    setIsBulkProcessing(true);
    setBulkActionInProgress(action);
    try {
      const result = await postMutation(action, {
        items: selectedRequests.map(r => ({ repo: r.repository, username: r.username })),
      });
      if (!mountedRef.current) return;
      const failedIds = new Set<string>(result.errors.map((e: { id: string }) => e.id));
      const succeededIds = new Set(selectedRequests.filter(r => !failedIds.has(r.id)).map(r => r.id));
      setRequests(prev => prev.filter(r => !succeededIds.has(r.id)));
      setSelectedIds(failedIds);
      setRepoPendingCounts(prev => applyBulkActionRepoPendingCounts(prev, selectedRequests, failedIds));
      setTabCounts(prev => applyBulkActionTabCounts(prev, action, result.succeeded));
      if (result.failed) {
        // A timeout can have committed upstream; reconciliation below determines visible state.
        invalidateCounts();
        toast.warning(`${result.succeeded} succeeded, ${result.failed} could not be confirmed. Refreshing; unresolved pending items remain selected.`);
      } else toast.success(`Successfully ${action === "approve" ? "approved" : "rejected"} ${result.succeeded} requests.`);
    } catch (err) {
      if (mountedRef.current) {
        if ((err as { uncertain?: boolean }).uncertain !== false) invalidateCounts();
        toast.error(err instanceof Error ? err.message : "Bulk action could not be confirmed");
      }
    } finally {
      await reconcileMutation();
    }
  };
  const handleBulkApprove = () => handleBulk("approve");
  const handleBulkReject = () => handleBulk("reject");
  const busy = isMutating || isBulkProcessing || isLoading || isLoadingMore;
  const actionsDisabled = busy || !!loadError;

  const hasActiveFilters = searchQuery !== "" || selectedRepoKey !== "all" || selectedType !== "all";
  const windowIsIncomplete = Boolean(loadError) || repoErrors.length > 0 || hasMore;
  // With no rows the empty state carries the action; a footer here would duplicate it.
  const showFooter = !isLoading && requests.length > 0;

  return (
    <div className="space-y-3">
      {/* A failed read is never allowed to read as an empty queue. */}
      {loadError && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/[0.06] p-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-2.5">
            <CircleAlert className="mt-px h-4 w-4 shrink-0 text-destructive" strokeWidth={1.6} />
            <span className="text-[12.5px] leading-[1.45] text-danger">
              {loadError} Anything still on screen is from the last successful sync and may be stale.
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => fetchTabRequests(currentTab, currentMaxPages)}
            >
              Retry
            </Button>
            {currentMaxPages > 1 && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => fetchTabRequests(currentTab, Math.max(1, Math.floor(currentMaxPages / 2)))}
              >
                Load a smaller window
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Partial repository failure: what still works, and what is missing. */}
      {repoErrors.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/[0.07] p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <TriangleAlert className="mt-px h-4 w-4 shrink-0 text-warning" strokeWidth={1.6} />
            <span className="text-[12.5px] leading-[1.45] text-warning-soft">
              {repoErrors.length === 1 ? (
                <>
                  1 repository could not be loaded (
                  <span className="font-mono text-xs">{repoErrors[0].repo.repoId}</span>). The rest are live
                  below — counts on this screen are incomplete.
                </>
              ) : (
                <>
                  {repoErrors.length} repositories could not be loaded. The rest are live below — counts on
                  this screen are incomplete.
                </>
              )}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => fetchTabRequests(currentTab, currentMaxPages)}
            >
              Retry repositories
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/repositories">See diagnostics</Link>
            </Button>
          </div>
        </div>
      )}

      {/* Tabs + direct grant. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full sm:w-auto">
          <TabsList className="grid h-auto w-full grid-cols-3 gap-0.5 rounded-lg border bg-muted p-[3px] sm:w-auto">
            {(["pending", "accepted", "rejected"] as const).map((status) => {
              const counts = tabCounts[status];
              return (
                <TabsTrigger
                  key={status}
                  disabled={isMutating}
                  value={status}
                  className="h-7 gap-2 rounded-md px-3 text-xs text-muted-foreground data-[state=active]:bg-secondary data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none sm:text-[12.5px]"
                >
                  <span>{TAB_LABEL[status]}</span>
                  {counts !== undefined && (
                    <span
                      className={cn(
                        "flex h-4 min-w-4 items-center justify-center rounded-full px-1.5 font-mono text-[10.5px] tabular",
                        status === "pending" && counts.count > 0
                          ? "bg-primary text-primary-foreground"
                          : "bg-accent text-muted-foreground"
                      )}
                    >
                      {counts.count}
                      {counts.isTruncated ? "+" : ""}
                    </span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        <div className="flex items-center justify-end">
          <GrantAccessDialog
            repositories={configuredRepositories}
            onGrant={handleGrant}
            disabled={actionsDisabled}
          />
        </div>
      </div>

      <RepositoryFilter
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedRepoKey={selectedRepoKey}
        onRepoKeyChange={setSelectedRepoKey}
        selectedType={selectedType}
        onTypeChange={setSelectedType}
        configuredRepositories={configuredRepositories}
        repoPendingCounts={currentTab === "pending" ? repoPendingCounts : {}}
        repoPendingTruncated={currentTab === "pending" ? repoPendingTruncated : {}}
        showPendingCounts={currentTab === "pending"}
      />

      <div className="overflow-hidden rounded-lg border bg-card">
        {/* Column captions for the row grid below. */}
        <div className="hidden h-8 grid-cols-[26px_minmax(0,1fr)_226px_92px_172px] items-center gap-4 border-b bg-muted px-4 lg:grid">
          <span />
          <span className="field-label">Requester &amp; form answers</span>
          <span className="field-label">Repository</span>
          <span className="field-label">Requested</span>
          <span className="field-label text-right">Review</span>
        </div>

        {isLoading ? (
          <div aria-busy="true" aria-label="Loading requests">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-[26px_minmax(0,1fr)_172px] items-start gap-4 border-b border-divider p-4 last:border-b-0"
                style={{ opacity: 1 - i * 0.15 }}
              >
                <Skeleton className="mt-0.5 h-3.5 w-3.5 rounded-sm" />
                <div className="space-y-2">
                  <Skeleton className="h-3.5 w-1/3" />
                  <div className="flex gap-5">
                    <Skeleton className="h-5 w-1/5" />
                    <Skeleton className="h-5 w-1/5" />
                    <Skeleton className="h-5 w-1/5" />
                    <Skeleton className="h-5 w-1/5" />
                  </div>
                  <Skeleton className="h-3 w-4/5" />
                </div>
                <div className="flex justify-end gap-2">
                  <Skeleton className="h-[30px] w-[72px] rounded-md" />
                  <Skeleton className="h-[30px] w-[82px] rounded-md" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
            {windowIsIncomplete ? (
              <>
                <RefreshCw className="h-8 w-8 text-warning" strokeWidth={1.2} />
                <div>
                  <h3 className="text-[15px] font-semibold text-foreground">
                    Nothing in the window we loaded
                  </h3>
                  <p className="mx-auto mt-1.5 max-w-sm text-[12.5px] leading-[1.5] text-muted-foreground">
                    Results are incomplete — the Hub reports more than we fetched, or a repository failed.
                    Widen the window before treating this queue as cleared.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {hasMore &&
                    (isPaginationAtHardCap(currentMaxPages, ABSOLUTE_MAX_PAGES) ? (
                      <span className="font-mono text-[11px] text-label">
                        Display limit reached · more requests exist on the Hub
                      </span>
                    ) : (
                      <Button size="sm" disabled={busy} onClick={handleLoadMore}>
                        Load more requests
                      </Button>
                    ))}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => fetchTabRequests(currentTab, currentMaxPages)}
                  >
                    Check again
                  </Button>
                </div>
              </>
            ) : hasActiveFilters ? (
              <>
                <Filter className="h-8 w-8 text-muted-foreground/50" strokeWidth={1.2} />
                <div>
                  <h3 className="text-[15px] font-semibold text-foreground">
                    No request matches these filters
                  </h3>
                  <p className="mx-auto mt-1.5 max-w-sm text-[12.5px] leading-[1.5] text-muted-foreground">
                    {requests.length} {currentTab} {requests.length === 1 ? "request is" : "requests are"}{" "}
                    loaded; none of them matches the current filters.
                  </p>
                </div>
              </>
            ) : currentTab === "pending" ? (
              <>
                <PackageCheck className="h-8 w-8 text-success" strokeWidth={1.2} />
                <div>
                  <h3 className="text-[15px] font-semibold text-foreground">Nothing waiting</h3>
                  <p className="mx-auto mt-1.5 max-w-sm text-[12.5px] leading-[1.5] text-muted-foreground">
                    Every configured repository answered and none of them has a pending request.
                  </p>
                </div>
              </>
            ) : (
              <>
                <Inbox className="h-8 w-8 text-muted-foreground/50" strokeWidth={1.2} />
                <div>
                  <h3 className="text-[15px] font-semibold text-foreground">No {currentTab} requests</h3>
                  <p className="mx-auto mt-1.5 max-w-sm text-[12.5px] leading-[1.5] text-muted-foreground">
                    There are no {currentTab} requests recorded for the configured repositories.
                  </p>
                </div>
              </>
            )}
          </div>
        ) : (
          <div>
            {filteredRequests.map((req) => (
              <AccessRequestRow
                key={req.id}
                request={req}
                isSelected={selectedIds.has(req.id)}
                onToggleSelect={handleToggleSelect}
                onApprove={handleApprove}
                onReject={handleReject}
                onRevoke={handleRevoke}
                isMutating={actionsDisabled}
              />
            ))}
          </div>
        )}

        {showFooter && (
          <div className="flex flex-col items-center justify-between gap-2 border-t bg-muted px-4 py-2.5 text-[11.5px] text-muted-foreground sm:flex-row">
            <span>
              Showing {filteredRequests.length}
              {hasMore ? "+" : ""} of {requests.length}
              {hasMore ? "+" : ""} loaded {currentTab} {requests.length === 1 ? "request" : "requests"}.
            </span>

            {shouldDisplayPaginationFooter(isLoading, hasMore) &&
              (isPaginationAtHardCap(currentMaxPages, ABSOLUTE_MAX_PAGES) ? (
                <span className="font-mono text-[11px] text-label">
                  Display limit reached · more requests exist on the Hub
                </span>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[11px] text-label">
                    page window {currentMaxPages} · hub has more
                  </span>
                  <Button variant="outline" size="sm" onClick={handleLoadMore} disabled={busy}>
                    {isLoadingMore ? (
                      <>
                        <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      "Load more requests"
                    )}
                  </Button>
                </div>
              ))}
          </div>
        )}
      </div>

      {currentTab === "pending" && (
        <BulkActionsBar
          selectedCount={selectedIds.size}
          totalCount={filteredRequests.length}
          onSelectAll={handleSelectAll}
          onClearSelection={handleClearSelection}
          onBulkApprove={handleBulkApprove}
          onBulkReject={handleBulkReject}
          isProcessing={actionsDisabled}
          actionInProgress={bulkActionInProgress}
        />
      )}
    </div>
  );
}
