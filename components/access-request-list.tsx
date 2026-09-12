"use client";

import * as React from "react";
import {
  Inbox,
  AlertTriangle,
  Sparkles,
  Loader2,
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
import { AccessRequestDetails } from "./access-request-details";
import { BulkActionsBar } from "./bulk-actions-bar";
import { RepositoryFilter } from "./repository-filter";
import { GrantAccessDialog } from "./grant-access-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Link from "next/link";

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

  // Request details sheet state
  const [selectedRequest, setSelectedRequest] = React.useState<AccessRequest | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = React.useState(false);

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
        setSelectedRequest(previous => previous ? fetchedList.find(item => item.id === previous.id) || previous : null);
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
    setIsDetailsOpen(false);
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

  return (
    <div className="space-y-4">
      {loadError && <div role="alert" className="rounded-lg border border-destructive p-3 text-sm">
        {loadError} <Button variant="outline" size="sm" disabled={busy} onClick={() => fetchTabRequests(currentTab, currentMaxPages)}>Retry</Button>
      </div>}
      {(loadError || repoErrors.length > 0) && <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={busy} onClick={() => fetchTabRequests(currentTab, currentMaxPages)}>Retry repositories</Button>
        {currentMaxPages > 1 && <Button variant="outline" size="sm" disabled={busy} onClick={() => fetchTabRequests(currentTab, Math.max(1, Math.floor(currentMaxPages / 2)))}>Load smaller window</Button>}
      </div>}
      {/* Partial Repository Failure Alert */}
      {repoErrors.length > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              {repoErrors.length === 1
                ? `1 repository could not be loaded (${repoErrors[0].repo.repoId}). Loaded repositories remain available; counts are incomplete.`
                : `${repoErrors.length} repositories could not be loaded. Loaded repositories remain available; counts are incomplete.`}
            </span>
          </div>
          <Link
            href="/repositories"
            className="font-medium underline hover:text-amber-950 dark:hover:text-amber-200"
          >
            View details
          </Link>
        </div>
      )}

      {/* Top Header Controls: Tabs + Grant Access */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full sm:w-auto">
          <TabsList className="grid w-full grid-cols-3 sm:w-auto">
            <TabsTrigger disabled={isMutating} value="pending" className="gap-2 text-xs sm:text-sm">
              <span>Pending</span>
              {tabCounts.pending !== undefined && (
                <Badge
                  variant={tabCounts.pending.count > 0 ? "default" : "secondary"}
                  className="px-1.5 py-0 text-[11px] font-mono h-4 min-w-4 flex items-center justify-center rounded-full"
                >
                  {tabCounts.pending.count}
                  {tabCounts.pending.isTruncated ? "+" : ""}
                </Badge>
              )}
            </TabsTrigger>

            <TabsTrigger disabled={isMutating} value="accepted" className="gap-2 text-xs sm:text-sm">
              <span>Accepted</span>
              {tabCounts.accepted !== undefined && (
                <Badge
                  variant="secondary"
                  className="px-1.5 py-0 text-[11px] font-mono h-4 min-w-4 flex items-center justify-center rounded-full"
                >
                  {tabCounts.accepted.count}
                  {tabCounts.accepted.isTruncated ? "+" : ""}
                </Badge>
              )}
            </TabsTrigger>

            <TabsTrigger disabled={isMutating} value="rejected" className="gap-2 text-xs sm:text-sm">
              <span>Rejected</span>
              {tabCounts.rejected !== undefined && (
                <Badge
                  variant="secondary"
                  className="px-1.5 py-0 text-[11px] font-mono h-4 min-w-4 flex items-center justify-center rounded-full"
                >
                  {tabCounts.rejected.count}
                  {tabCounts.rejected.isTruncated ? "+" : ""}
                </Badge>
              )}
            </TabsTrigger>
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

      {/* Filter Bar */}
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

      {/* Requests Table / List Container */}
      <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="divide-y">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center space-x-4 p-4">
                <Skeleton className="h-4 w-4 rounded" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-1/4" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-8 w-16" />
              </div>
            ))}
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            {loadError || repoErrors.length > 0 || hasMore ? (
              <><Inbox className="h-10 w-10 text-muted-foreground/50 mb-3" /><h3>No requests in the current window</h3><p className="text-xs text-muted-foreground">Results are incomplete. Retry loading or expand the window before concluding the inbox is empty.</p></>
            ) : searchQuery || selectedRepoKey !== "all" || selectedType !== "all" ? (
              <>
                <Inbox className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <h3 className="font-semibold text-base text-foreground">No matching requests</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  No {currentTab} requests matched your current filter criteria.
                </p>
              </>
            ) : currentTab === "pending" ? (
              <>
                <Sparkles className="h-10 w-10 text-emerald-500 mb-3" />
                <h3 className="font-semibold text-base text-foreground">Inbox zero!</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  There are currently no pending access requests waiting for review.
                </p>
              </>
            ) : (
              <>
                <Inbox className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <h3 className="font-semibold text-base text-foreground">No {currentTab} requests</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  There are no {currentTab} requests recorded for the configured repositories.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {filteredRequests.map((req) => (
              <AccessRequestRow
                key={req.id}
                request={req}
                isSelected={selectedIds.has(req.id)}
                onToggleSelect={handleToggleSelect}
                onViewDetails={(r) => {
                  setSelectedRequest(r);
                  setIsDetailsOpen(true);
                }}
                onApprove={handleApprove}
                onReject={handleReject}
                onRevoke={handleRevoke}
                isMutating={actionsDisabled}
              />
            ))}
          </div>
        )}

        {/* Truncation / Load More Indicator */}
        {shouldDisplayPaginationFooter(isLoading, hasMore) && (
          <div className="flex flex-col sm:flex-row items-center justify-between border-t bg-muted/20 px-4 py-3 text-xs text-muted-foreground gap-2">
            {isPaginationAtHardCap(currentMaxPages, ABSOLUTE_MAX_PAGES) ? (
              <div className="flex w-full items-center justify-between gap-2">
                <span>Showing first {requests.length}+ requests.</span>
                <span className="font-medium text-muted-foreground/90">
                  Display limit reached · More requests exist on Hugging Face Hub
                </span>
              </div>
            ) : (
              <>
                <span>
                  Showing first {requests.length}+ requests (more {currentTab} requests are available on Hugging Face Hub).
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLoadMore}
                  disabled={busy}
                  className="h-7 text-xs"
                >
                  {isLoadingMore ? (
                    <>
                      <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    "Load more requests"
                  )}
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Bulk Actions Floating Bar (only in Pending tab) */}
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

      {/* Detailed Sheet Modal */}
      <AccessRequestDetails
        request={selectedRequest}
        open={isDetailsOpen}
        onOpenChange={setIsDetailsOpen}
        onApprove={handleApprove}
        onReject={handleReject}
        onRevoke={handleRevoke}
        isMutating={actionsDisabled || !requests.some(item => item.id === selectedRequest?.id)}
        stale={Boolean(selectedRequest && !requests.some(item => item.id === selectedRequest.id))}
      />
    </div>
  );
}
