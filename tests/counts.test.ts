import { describe, it, expect } from "vitest";
import {
  applyBulkActionRepoPendingCounts,
  applySingleActionRepoPendingCount,
  applySingleActionTabCounts,
  applyBulkActionTabCounts,
  formatRepositoryBadge,
  TabCounts,
} from "@/lib/counts";
import { AccessRequest } from "@/lib/types";

describe("lib/counts", () => {
  const reqRepo1Alice: AccessRequest = {
    id: "model:org/repo-1:alice",
    username: "alice",
    repository: { type: "model", repoId: "org/repo-1" },
    status: "pending",
    fields: {},
  };

  const reqRepo1Bob: AccessRequest = {
    id: "model:org/repo-1:bob",
    username: "bob",
    repository: { type: "model", repoId: "org/repo-1" },
    status: "pending",
    fields: {},
  };

  const reqRepo2Alice: AccessRequest = {
    id: "dataset:org/repo-2:alice",
    username: "alice",
    repository: { type: "dataset", repoId: "org/repo-2" },
    status: "pending",
    fields: {},
  };

  describe("applyBulkActionRepoPendingCounts", () => {
    it("decrements per-repo counts for multiple successes in the same repository", () => {
      const initialCounts = {
        "model:org/repo-1": 10,
        "dataset:org/repo-2": 5,
      };

      const selected = [reqRepo1Alice, reqRepo1Bob];
      const failedIds = new Set<string>();

      const updated = applyBulkActionRepoPendingCounts(initialCounts, selected, failedIds);

      expect(updated["model:org/repo-1"]).toBe(8);
      expect(updated["dataset:org/repo-2"]).toBe(5);
    });

    it("isolates errors by composite key when same username exists across repos and one fails", () => {
      const initialCounts = {
        "model:org/repo-1": 10,
        "dataset:org/repo-2": 5,
      };

      // Alice is selected for both repo-1 and repo-2; repo-2 fails
      const selected = [reqRepo1Alice, reqRepo2Alice];
      const failedIds = new Set(["dataset:org/repo-2:alice"]);

      const updated = applyBulkActionRepoPendingCounts(initialCounts, selected, failedIds);

      // repo-1 decrements by 1 (success)
      expect(updated["model:org/repo-1"]).toBe(9);
      // repo-2 is unchanged (failed)
      expect(updated["dataset:org/repo-2"]).toBe(5);
    });

    it("clamps counts at zero", () => {
      const initialCounts = {
        "model:org/repo-1": 1,
      };

      const selected = [reqRepo1Alice, reqRepo1Bob];
      const failedIds = new Set<string>();

      const updated = applyBulkActionRepoPendingCounts(initialCounts, selected, failedIds);

      expect(updated["model:org/repo-1"]).toBe(0);
    });
  });

  describe("applySingleActionRepoPendingCount", () => {
    it("decrements repository count on approve from pending", () => {
      const initial = { "model:org/repo-1": 5 };
      const res = applySingleActionRepoPendingCount(initial, reqRepo1Alice, "approve", "pending");
      expect(res["model:org/repo-1"]).toBe(4);
    });

    it("decrements repository count on reject from pending", () => {
      const initial = { "model:org/repo-1": 5 };
      const res = applySingleActionRepoPendingCount(initial, reqRepo1Alice, "reject", "pending");
      expect(res["model:org/repo-1"]).toBe(4);
    });

    it("does not decrement pending count when approving from rejected tab", () => {
      const initial = { "model:org/repo-1": 5 };
      const res = applySingleActionRepoPendingCount(initial, reqRepo1Alice, "approve", "rejected");
      expect(res["model:org/repo-1"]).toBe(5);
    });

    it("increments repository pending count on revoke from accepted tab if known", () => {
      const initial = { "model:org/repo-1": 5 };
      const res = applySingleActionRepoPendingCount(initial, reqRepo1Alice, "revoke", "accepted");
      expect(res["model:org/repo-1"]).toBe(6);
    });

    it("does not fabricate unknown repo count on revoke", () => {
      const initial: Record<string, number> = {};
      const res = applySingleActionRepoPendingCount(initial, reqRepo1Alice, "revoke", "accepted");
      expect(res["model:org/repo-1"]).toBeUndefined();
    });
  });

  describe("applySingleActionTabCounts", () => {
    it("handles Pending -> Approve with known and unknown counts", () => {
      const withAccepted: TabCounts = {
        pending: { count: 5, isTruncated: false },
        accepted: { count: 10, isTruncated: false },
      };
      const res1 = applySingleActionTabCounts(withAccepted, "pending", "approve");
      expect(res1.pending?.count).toBe(4);
      expect(res1.accepted?.count).toBe(11);
      expect(res1.rejected).toBeUndefined();

      const withoutAccepted: TabCounts = {
        pending: { count: 5, isTruncated: false },
      };
      const res2 = applySingleActionTabCounts(withoutAccepted, "pending", "approve");
      expect(res2.pending?.count).toBe(4);
      expect(res2.accepted).toBeUndefined();
    });

    it("handles Pending -> Reject with known and unknown counts", () => {
      const withRejected: TabCounts = {
        pending: { count: 5, isTruncated: false },
        rejected: { count: 2, isTruncated: false },
      };
      const res = applySingleActionTabCounts(withRejected, "pending", "reject");
      expect(res.pending?.count).toBe(4);
      expect(res.rejected?.count).toBe(3);
      expect(res.accepted).toBeUndefined();
    });

    it("handles Rejected -> Approve without touching Pending", () => {
      const counts: TabCounts = {
        pending: { count: 5, isTruncated: false },
        accepted: { count: 10, isTruncated: false },
        rejected: { count: 3, isTruncated: false },
      };
      const res = applySingleActionTabCounts(counts, "rejected", "approve");
      expect(res.rejected?.count).toBe(2);
      expect(res.accepted?.count).toBe(11);
      // Pending must NOT be modified
      expect(res.pending?.count).toBe(5);
    });

    it("handles Accepted -> Revoke (resets user to pending)", () => {
      const counts: TabCounts = {
        pending: { count: 5, isTruncated: false },
        accepted: { count: 10, isTruncated: false },
      };
      const res = applySingleActionTabCounts(counts, "accepted", "revoke");
      expect(res.accepted?.count).toBe(9);
      expect(res.pending?.count).toBe(6);
      expect(res.rejected).toBeUndefined();
    });

    it("handles Manual Grant (increments accepted only if known)", () => {
      const counts: TabCounts = {
        pending: { count: 5, isTruncated: false },
        accepted: { count: 10, isTruncated: false },
      };
      const res = applySingleActionTabCounts(counts, "accepted", "grant");
      expect(res.accepted?.count).toBe(11);
      expect(res.pending?.count).toBe(5);
      expect(res.rejected).toBeUndefined();
    });
  });

  describe("applyBulkActionTabCounts", () => {
    it("handles Bulk Approve correctly", () => {
      const counts: TabCounts = {
        pending: { count: 10, isTruncated: false },
        accepted: { count: 20, isTruncated: false },
      };
      const res = applyBulkActionTabCounts(counts, "approve", 4);
      expect(res.pending?.count).toBe(6);
      expect(res.accepted?.count).toBe(24);
      expect(res.rejected).toBeUndefined();
    });

    it("handles Bulk Reject correctly", () => {
      const counts: TabCounts = {
        pending: { count: 10, isTruncated: false },
        rejected: { count: 2, isTruncated: false },
      };
      const res = applyBulkActionTabCounts(counts, "reject", 3);
      expect(res.pending?.count).toBe(7);
      expect(res.rejected?.count).toBe(5);
      expect(res.accepted).toBeUndefined();
    });
  });

  describe("formatRepositoryBadge (Pending-only filter badges)", () => {
    it("renders count badge on Pending tab (showCounts=true)", () => {
      expect(formatRepositoryBadge(17, false, true)).toBe(" (17)");
    });

    it("renders count badge with '+' notation when truncated on Pending tab", () => {
      expect(formatRepositoryBadge(2000, true, true)).toBe(" (2000+)");
    });

    it("omits badge on Accepted tab (showCounts=false)", () => {
      expect(formatRepositoryBadge(17, false, false)).toBe("");
      expect(formatRepositoryBadge(2000, true, false)).toBe("");
    });

    it("omits badge on Rejected tab (showCounts=false)", () => {
      expect(formatRepositoryBadge(5, false, false)).toBe("");
    });

    it("omits badge when count is undefined", () => {
      expect(formatRepositoryBadge(undefined, false, true)).toBe("");
      expect(formatRepositoryBadge(undefined, true, true)).toBe("");
    });
  });
});
