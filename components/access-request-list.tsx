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
  const [currentMaxPages, setCurrentMaxPages] = React.useState<number>(10);
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

  // Callbacks refs for external refresh notifications
  const onRefreshChangeRef = React.useRef(onRefreshChange);
  onRefreshChangeRef.current = onRefreshChange;
  const onRefreshedRef = React.useRef(onRefreshed);
  onRefreshedRef.current = onRefreshed;

  // AbortController ref to cancel in-flight fetches on rapid tab switching or unmount
  const activeAbortControllerRef = React.useRef<AbortController | null>(null);

  // Fetch requests for active tab with AbortController race prevention
  const fetchTabRequests = React.useCallback(
    async (statusToFetch: RequestStatus, pagesLimit?: number, isAppending = false) => {
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
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`Failed to load requests (${res.status})`);
        }

        const json = await res.json();
        const data = json.data;

        // Check if aborted before updating state
        if (controller.signal.aborted) {
          return;
        }

        const fetchedList: AccessRequest[] = data.requests || [];
        setRequests(fetchedList);
        setRepoErrors(data.errors || []);
        setHasMore(Boolean(data.hasMore));

        // Update count for current tab with truncation indicator
        setTabCounts((prev) => ({
          ...prev,
          [statusToFetch]: {
            count: fetchedList.length,
            isTruncated: Boolean(data.truncated || data.hasMore),
          },
        }));

        // If fetching pending, calculate per-repo pending counts
        if (statusToFetch === "pending") {
          const counts: Record<string, number> = {};
          for (const req of fetchedList) {
            const key = `${req.repository.type}:${req.repository.repoId}`;
            counts[key] = (counts[key] || 0) + 1;
          }
          setRepoPendingCounts(counts);
        }

        // Clear bulk selection on tab switch or reload
        if (!isAppending) {
          setSelectedIds(new Set());
        }
      } catch (err: unknown) {
        if ((err as { name?: string }).name === "AbortError" || controller.signal.aborted) {
          // Ignore clean user-driven aborts
          return;
        }
        const msg = err instanceof Error ? err.message : "Network error loading requests";
        toast.error(msg);
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
          setIsLoadingMore(false);
          onRefreshChangeRef.current?.(false);
          onRefreshedRef.current?.(new Date());
        }
      }
    },
    []
  );

  // Clean up abort controller on unmount
  React.useEffect(() => {
    return () => {
      if (activeAbortControllerRef.current) {
        activeAbortControllerRef.current.abort();
      }
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
    if (newStatus === currentTab) return;
    setCurrentTab(newStatus);
    setSelectedIds(new Set());
  };

  // Handle Load More (incremental pagination for large histories)
  const handleLoadMore = () => {
    const nextPages = currentMaxPages + 10;
    setCurrentMaxPages(nextPages);
    fetchTabRequests(currentTab, nextPages, true);
  };

  // Filtered requests based on search query, repo, and type
  const filteredRequests = React.useMemo(() => {
    return requests.filter((req) => {
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
  }, [requests, selectedType, selectedRepoKey, searchQuery]);

  // Selection handlers
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    const allVisibleIds = new Set(filteredRequests.map((r) => r.id));
    setSelectedIds(allVisibleIds);
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  // Single Actions
  const handleApprove = async (request: AccessRequest) => {
    try {
      setIsMutating(true);
      const res = await fetch("/api/access/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: request.repository,
          username: request.username,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to approve access request");
      }

      toast.success(`Access approved for @${request.username}`);

      // Update local state immediately
      setRequests((prev) => prev.filter((r) => r.id !== request.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(request.id);
        return next;
      });

      // Update per-repo pending count if on pending tab
      setRepoPendingCounts((prev) =>
        applySingleActionRepoPendingCount(prev, request, "approve", currentTab)
      );

      // Conservative tab count updates:
      setTabCounts((prev) =>
        applySingleActionTabCounts(prev, currentTab, "approve")
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setIsMutating(false);
    }
  };

  const handleReject = async (request: AccessRequest) => {
    try {
      setIsMutating(true);
      const res = await fetch("/api/access/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: request.repository,
          username: request.username,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to reject access request");
      }

      toast.success(`Request rejected for @${request.username}`);

      // Update local state immediately
      setRequests((prev) => prev.filter((r) => r.id !== request.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(request.id);
        return next;
      });

      // Update per-repo pending count if on pending tab
      setRepoPendingCounts((prev) =>
        applySingleActionRepoPendingCount(prev, request, "reject", currentTab)
      );

      // Conservative tab count update:
      setTabCounts((prev) =>
        applySingleActionTabCounts(prev, currentTab, "reject")
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rejection failed");
    } finally {
      setIsMutating(false);
    }
  };

  const handleRevoke = async (request: AccessRequest) => {
    try {
      setIsMutating(true);
      const res = await fetch("/api/access/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: request.repository,
          username: request.username,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to revoke access");
      }

      toast.success(`Access revoked for @${request.username}`);

      // Update local state
      setRequests((prev) => prev.filter((r) => r.id !== request.id));

      // Update per-repo pending count if known (Accepted -> Revoke -> Pending)
      setRepoPendingCounts((prev) =>
        applySingleActionRepoPendingCount(prev, request, "revoke", currentTab)
      );

      // Conservative tab count update (Accepted - 1, Pending + 1 if known):
      setTabCounts((prev) =>
        applySingleActionTabCounts(prev, currentTab, "revoke")
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Revoke failed");
    } finally {
      setIsMutating(false);
    }
  };

  // Bulk Actions
  const handleBulkApprove = async () => {
    const selectedRequests = requests.filter((r) => selectedIds.has(r.id));
    if (selectedRequests.length === 0) return;

    try {
      setIsBulkProcessing(true);
      setBulkActionInProgress("approve");

      const items = selectedRequests.map((r) => ({
        id: r.id,
        repo: r.repository,
        username: r.username,
      }));

      const res = await fetch("/api/access/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || "Bulk approval failed");
      }

      const result = json.data;
      if (result.failed === 0) {
        toast.success(`Successfully approved ${result.succeeded} requests.`);
      } else {
        toast.warning(
          `${result.succeeded} approved, ${result.failed} failed. Retained failed items in selection.`
        );
      }

      // Use exact composite key (id) for partial failure identification
      const failedIds = new Set<string>(result.errors.map((e: { id: string }) => e.id));

      setRequests((prev) =>
        prev.filter((r) => !selectedIds.has(r.id) || failedIds.has(r.id))
      );

      // Retain only failed requests in selection
      setSelectedIds((prev) => {
        const next = new Set<string>();
        for (const id of prev) {
          if (failedIds.has(id)) {
            next.add(id);
          }
        }
        return next;
      });

      // Update per-repo pending counts for successful items
      if (currentTab === "pending") {
        setRepoPendingCounts((prev) =>
          applyBulkActionRepoPendingCounts(prev, selectedRequests, failedIds)
        );
      }

      // Update tab counts conservatively
      setTabCounts((prev) =>
        applyBulkActionTabCounts(prev, "approve", result.succeeded)
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk approval encountered an error");
    } finally {
      setIsBulkProcessing(false);
      setBulkActionInProgress(null);
    }
  };

  const handleBulkReject = async () => {
    const selectedRequests = requests.filter((r) => selectedIds.has(r.id));
    if (selectedRequests.length === 0) return;

    try {
      setIsBulkProcessing(true);
      setBulkActionInProgress("reject");

      const items = selectedRequests.map((r) => ({
        id: r.id,
        repo: r.repository,
        username: r.username,
      }));

      const res = await fetch("/api/access/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || "Bulk rejection failed");
      }

      const result = json.data;
      if (result.failed === 0) {
        toast.success(`Successfully rejected ${result.succeeded} requests.`);
      } else {
        toast.warning(
          `${result.succeeded} rejected, ${result.failed} failed. Retained failed items in selection.`
        );
      }

      // Use exact composite key (id) for partial failure identification
      const failedIds = new Set<string>(result.errors.map((e: { id: string }) => e.id));

      setRequests((prev) =>
        prev.filter((r) => !selectedIds.has(r.id) || failedIds.has(r.id))
      );

      setSelectedIds((prev) => {
        const next = new Set<string>();
        for (const id of prev) {
          if (failedIds.has(id)) {
            next.add(id);
          }
        }
        return next;
      });

      // Update per-repo pending counts for successful items
      if (currentTab === "pending") {
        setRepoPendingCounts((prev) =>
          applyBulkActionRepoPendingCounts(prev, selectedRequests, failedIds)
        );
      }

      // Update tab counts conservatively
      setTabCounts((prev) =>
        applyBulkActionTabCounts(prev, "reject", result.succeeded)
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk rejection encountered an error");
    } finally {
      setIsBulkProcessing(false);
      setBulkActionInProgress(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Partial Repository Failure Alert */}
      {repoErrors.length > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              {repoErrors.length === 1
                ? `1 repository could not be loaded (${repoErrors[0].repo.repoId}). Other repositories remain fully functional.`
                : `${repoErrors.length} repositories could not be loaded. Other repositories remain fully functional.`}
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
            <TabsTrigger value="pending" className="gap-2 text-xs sm:text-sm">
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

            <TabsTrigger value="accepted" className="gap-2 text-xs sm:text-sm">
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

            <TabsTrigger value="rejected" className="gap-2 text-xs sm:text-sm">
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
            onGranted={() => {
              // Refresh active tab
              fetchTabRequests(currentTab, currentMaxPages);
              // Optimistically update accepted count if known
              setTabCounts((prev) =>
                applySingleActionTabCounts(prev, currentTab, "grant")
              );
            }}
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
        repoPendingCounts={repoPendingCounts}
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
            {searchQuery || selectedRepoKey !== "all" || selectedType !== "all" ? (
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
                isMutating={isMutating}
              />
            ))}
          </div>
        )}

        {/* Truncation / Load More Indicator */}
        {hasMore && (
          <div className="flex flex-col sm:flex-row items-center justify-between border-t bg-muted/20 px-4 py-3 text-xs text-muted-foreground gap-2">
            <span>
              Showing first {requests.length} requests (more {currentTab} requests are available on Hugging Face Hub).
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLoadMore}
              disabled={isLoadingMore}
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
          isProcessing={isBulkProcessing}
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
        isMutating={isMutating}
      />
    </div>
  );
}
