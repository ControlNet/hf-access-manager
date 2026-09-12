"use client";

import * as React from "react";
import { Check, Loader2, Square, SquareCheckBig, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BulkActionsBarProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkApprove: () => Promise<void>;
  onBulkReject: () => Promise<void>;
  isProcessing: boolean;
  actionInProgress?: "approve" | "reject" | null;
}

export function BulkActionsBar({
  selectedCount,
  totalCount,
  onSelectAll,
  onClearSelection,
  onBulkApprove,
  onBulkReject,
  isProcessing,
  actionInProgress,
}: BulkActionsBarProps) {
  if (selectedCount === 0) return null;

  const selectableCount = Math.min(totalCount, 100);
  const isAllSelected = selectedCount === selectableCount && selectableCount > 0;

  return (
    <div className="sticky bottom-4 z-30 flex flex-col gap-3 rounded-lg border bg-card px-3.5 py-3 shadow-[0_8px_28px_hsl(var(--foreground)/0.10)] sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          variant="outline"
          size="sm"
          onClick={isAllSelected ? onClearSelection : onSelectAll}
          disabled={isProcessing}
          className="gap-1.5"
        >
          {isAllSelected ? (
            <>
              <Square className="h-3.5 w-3.5" strokeWidth={1.6} />
              Deselect all
            </>
          ) : (
            <>
              <SquareCheckBig className="h-3.5 w-3.5" strokeWidth={1.6} />
              Select {totalCount > 100 ? "first 100" : `all ${totalCount}`}
            </>
          )}
        </Button>

        <span className="text-[12.5px] font-medium text-foreground">
          {selectedCount} {selectedCount === 1 ? "request" : "requests"} selected
        </span>
        <span className="font-mono text-[11px] text-label">max 100 per batch</span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="reject"
          size="row"
          onClick={onBulkReject}
          disabled={isProcessing}
          className="border-danger/40 bg-danger/10"
        >
          {isProcessing && actionInProgress === "reject" ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Rejecting...
            </>
          ) : (
            <>
              <X className="mr-1.5 h-3 w-3" strokeWidth={2} />
              Reject {selectedCount}
            </>
          )}
        </Button>

        <Button variant="success" size="row" onClick={onBulkApprove} disabled={isProcessing}>
          {isProcessing && actionInProgress === "approve" ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Approving...
            </>
          ) : (
            <>
              <Check className="mr-1.5 h-3 w-3" strokeWidth={2.2} />
              Approve {selectedCount}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
