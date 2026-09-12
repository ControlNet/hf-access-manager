import { AccessRequest, RequestStatus } from "./types";

export interface TabCountState {
  count: number;
  isTruncated: boolean;
}

export type TabCounts = {
  [K in RequestStatus]?: TabCountState;
};

/**
 * Decrements per-repository pending counts for successfully mutated requests in a bulk action.
 * Isolates partial failures using canonical request IDs (type:repoId:username).
 * Clamps all counts at 0.
 */
export function applyBulkActionRepoPendingCounts(
  currentCounts: Record<string, number>,
  selectedRequests: AccessRequest[],
  failedIds: Set<string>
): Record<string, number> {
  const successfulRequests = selectedRequests.filter((r) => !failedIds.has(r.id));
  if (successfulRequests.length === 0) {
    return currentCounts;
  }

  const decrements: Record<string, number> = {};
  for (const r of successfulRequests) {
    const key = `${r.repository.type}:${r.repository.repoId}`;
    decrements[key] = (decrements[key] || 0) + 1;
  }

  const next = { ...currentCounts };
  for (const [key, dec] of Object.entries(decrements)) {
    if (next[key] !== undefined) {
      next[key] = Math.max(0, next[key] - dec);
    }
  }
  return next;
}

/**
 * Updates per-repository pending count for a single action.
 * - 'approve' or 'reject' from pending: decrements by 1 (clamped at 0)
 * - 'revoke' from accepted: increments by 1 (if known)
 */
export function applySingleActionRepoPendingCount(
  currentCounts: Record<string, number>,
  request: AccessRequest,
  action: "approve" | "reject" | "revoke",
  currentTab: RequestStatus
): Record<string, number> {
  const key = `${request.repository.type}:${request.repository.repoId}`;

  if (currentTab === "pending" && (action === "approve" || action === "reject")) {
    return {
      ...currentCounts,
      [key]: Math.max(0, (currentCounts[key] || 1) - 1),
    };
  }

  if (action === "revoke") {
    if (currentCounts[key] !== undefined) {
      return {
        ...currentCounts,
        [key]: currentCounts[key] + 1,
      };
    }
  }

  return currentCounts;
}

/**
 * Optimistically updates tab counts for a single action:
 * - Pending → Approve: Pending -1, Accepted +1 (if known)
 * - Pending → Reject: Pending -1, Rejected +1 (if known)
 * - Rejected → Approve: Rejected -1, Accepted +1 (if known)
 * - Accepted → Revoke: Accepted -1, Pending +1 (if known)
 * - Manual Grant: Accepted +1 (if known)
 * Never fabricates counts for unvisited (undefined) tabs.
 */
export function applySingleActionTabCounts(
  prev: TabCounts,
  currentTab: RequestStatus,
  action: "approve" | "reject" | "revoke" | "grant"
): TabCounts {
  const next = { ...prev };

  if (action === "grant") {
    if (prev.accepted !== undefined) {
      next.accepted = {
        ...prev.accepted,
        count: prev.accepted.count + 1,
      };
    }
    return next;
  }

  if (action === "approve") {
    if (currentTab === "pending" && prev.pending !== undefined) {
      next.pending = {
        ...prev.pending,
        count: Math.max(0, prev.pending.count - 1),
      };
    } else if (currentTab === "rejected" && prev.rejected !== undefined) {
      next.rejected = {
        ...prev.rejected,
        count: Math.max(0, prev.rejected.count - 1),
      };
    }
    if (prev.accepted !== undefined) {
      next.accepted = {
        ...prev.accepted,
        count: prev.accepted.count + 1,
      };
    }
    return next;
  }

  if (action === "reject") {
    if (currentTab === "pending" && prev.pending !== undefined) {
      next.pending = {
        ...prev.pending,
        count: Math.max(0, prev.pending.count - 1),
      };
    }
    if (prev.rejected !== undefined) {
      next.rejected = {
        ...prev.rejected,
        count: prev.rejected.count + 1,
      };
    }
    return next;
  }

  if (action === "revoke") {
    if (prev.accepted !== undefined) {
      next.accepted = {
        ...prev.accepted,
        count: Math.max(0, prev.accepted.count - 1),
      };
    }
    if (prev.pending !== undefined) {
      next.pending = {
        ...prev.pending,
        count: prev.pending.count + 1,
      };
    }
    return next;
  }

  return next;
}

/**
 * Optimistically updates tab counts for bulk approve or reject actions.
 * Never fabricates counts for unvisited (undefined) tabs.
 */
export function applyBulkActionTabCounts(
  prev: TabCounts,
  action: "approve" | "reject",
  succeededCount: number
): TabCounts {
  const next = { ...prev };

  if (prev.pending !== undefined) {
    next.pending = {
      ...prev.pending,
      count: Math.max(0, prev.pending.count - succeededCount),
    };
  }

  if (action === "approve" && prev.accepted !== undefined) {
    next.accepted = {
      ...prev.accepted,
      count: prev.accepted.count + succeededCount,
    };
  }

  if (action === "reject" && prev.rejected !== undefined) {
    next.rejected = {
      ...prev.rejected,
      count: prev.rejected.count + succeededCount,
    };
  }

  return next;
}
