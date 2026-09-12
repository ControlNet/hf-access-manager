"use client";

import * as React from "react";
import {
  Inbox,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { AccessRequest, ManagedRepository, RequestStatus } from "@/lib/types";
import { AccessRequestRow } from "./access-request-row";
import { AccessRequestDetails } from "./access-request-details";
import { BulkActionsBar } from "./bulk-actions-bar";
import { RepositoryFilter } from "./repository-filter";
import { GrantAccessDialog } from "./grant-access-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import Link from "next/link";

interface AccessRequestListProps {
  configuredRepositories: ManagedRepository[];
  initialStatus?: RequestStatus;
}

export function AccessRequestList({
  configuredRepositories,
  initialStatus = "pending",
}: AccessRequestListProps) {
  const [currentTab, setCurrentTab] = React.useState<RequestStatus>(initialStatus);
  const [requests, setRequests] = React.useState<AccessRequest[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
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

  // Tab count caches
  const [tabCounts, setTabCounts] = React.useState<{
    pending?: number;
    accepted?: number;
    rejected?: number;
  }>({});

  // Pending counts by repository key for the dropdown badges
  const [repoPendingCounts, setRepoPendingCounts] = React.useState<Record<string, number>>({});

  // Fetch requests for active tab
  const fetchTabRequests = React.useCallback(
    async (statusToFetch: RequestStatus) => {
      try {
        setIsLoading(true);
        const res = await fetch(`/api/access/requests?status=${statusToFetch}`, {
          cache: "no-store",
        });

        if (!res.ok) {
          throw new Error(`Failed to load requests (${res.status})`);
        }

        const json = await res.json();
        const data = json.data;

        const fetchedList: AccessRequest[] = data.requests || [];
        setRequests(fetchedList);
        setRepoErrors(data.errors || []);

        // Update count for current tab
        setTabCounts((prev) => ({
          ...prev,
          [statusToFetch]: fetchedList.length,
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

        // Clear selection on tab switch
        setSelectedIds(new Set());
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Network error loading requests";
        toast.error(msg);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Fetch counts for other tabs in the background
  const fetchBackgroundCounts = React.useCallback(async () => {
    const statuses: RequestStatus[] = ["pending", "accepted", "rejected"];
    for (const status of statuses) {
      try {
        const res = await fetch(`/api/access/requests?status=${status}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const json = await res.json();
          const list: AccessRequest[] = json.data?.requests || [];
          setTabCounts((prev) => ({
            ...prev,
            [status]: list.length,
          }));

          if (status === "pending") {
            const counts: Record<string, number> = {};
            for (const req of list) {
              const key = `${req.repository.type}:${req.repository.repoId}`;
              counts[key] = (counts[key] || 0) + 1;
            }
            setRepoPendingCounts(counts);
          }
        }
      } catch {
        // Ignore background count errors
      }
    }
  }, []);

  React.useEffect(() => {
    fetchTabRequests(currentTab);
    fetchBackgroundCounts();
  }, [currentTab, fetchTabRequests, fetchBackgroundCounts]);

  // Handle Tab Switch
  const handleTabChange = (val: string) => {
    const newStatus = val as RequestStatus;
    setCurrentTab(newStatus);
    setSelectedIds(new Set());
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

        // Also search in custom form fields
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

      // Update counts
      setTabCounts((prev) => ({
        ...prev,
        pending: Math.max(0, (prev.pending || 1) - 1),
        accepted: (prev.accepted || 0) + 1,
      }));
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

      // Update counts
      setTabCounts((prev) => ({
        ...prev,
        pending: Math.max(0, (prev.pending || 1) - 1),
        rejected: (prev.rejected || 0) + 1,
      }));
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
      setTabCounts((prev) => ({
        ...prev,
        accepted: Math.max(0, (prev.accepted || 1) - 1),
      }));
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
          `${result.succeeded} approved, ${result.failed} failed. See failed items retained in list.`
        );
      }

      // Filter out successfully approved items
      const failedUsernames = new Set(
        result.errors.map((e: { item: { username: string } }) => e.item.username)
      );

      setRequests((prev) =>
        prev.filter((r) => !selectedIds.has(r.id) || failedUsernames.has(r.username))
      );

      // Retain only failed in selection
      setSelectedIds((prev) => {
        const next = new Set<string>();
        for (const id of prev) {
          const req = selectedRequests.find((r) => r.id === id);
          if (req && failedUsernames.has(req.username)) {
            next.add(id);
          }
        }
        return next;
      });

      // Refresh counts
      fetchBackgroundCounts();
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
          `${result.succeeded} rejected, ${result.failed} failed. See failed items retained in list.`
        );
      }

      const failedUsernames = new Set(
        result.errors.map((e: { item: { username: string } }) => e.item.username)
      );

      setRequests((prev) =>
        prev.filter((r) => !selectedIds.has(r.id) || failedUsernames.has(r.username))
      );

      setSelectedIds((prev) => {
        const next = new Set<string>();
        for (const id of prev) {
          const req = selectedRequests.find((r) => r.id === id);
          if (req && failedUsernames.has(req.username)) {
            next.add(id);
          }
        }
        return next;
      });

      fetchBackgroundCounts();
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
              {typeof tabCounts.pending === "number" && (
                <Badge
                  variant={tabCounts.pending > 0 ? "default" : "secondary"}
                  className="px-1.5 py-0 text-[11px] font-mono h-4 min-w-4 flex items-center justify-center rounded-full"
                >
                  {tabCounts.pending}
                </Badge>
              )}
            </TabsTrigger>

            <TabsTrigger value="accepted" className="gap-2 text-xs sm:text-sm">
              <span>Accepted</span>
              {typeof tabCounts.accepted === "number" && (
                <Badge
                  variant="secondary"
                  className="px-1.5 py-0 text-[11px] font-mono h-4 min-w-4 flex items-center justify-center rounded-full"
                >
                  {tabCounts.accepted}
                </Badge>
              )}
            </TabsTrigger>

            <TabsTrigger value="rejected" className="gap-2 text-xs sm:text-sm">
              <span>Rejected</span>
              {typeof tabCounts.rejected === "number" && (
                <Badge
                  variant="secondary"
                  className="px-1.5 py-0 text-[11px] font-mono h-4 min-w-4 flex items-center justify-center rounded-full"
                >
                  {tabCounts.rejected}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center justify-end">
          <GrantAccessDialog
            repositories={configuredRepositories}
            onGranted={() => {
              fetchTabRequests(currentTab);
              fetchBackgroundCounts();
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
