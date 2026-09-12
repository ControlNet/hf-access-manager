"use client";

import * as React from "react";
import { CheckCircle2, XCircle, Loader2, CheckSquare, Square } from "lucide-react";
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
    <div className="sticky bottom-4 z-30 flex items-center justify-between rounded-lg border bg-card/95 px-4 py-3 shadow-xl backdrop-blur">
      <div className="flex items-center space-x-3">
        <Button
          variant="outline"
          size="sm"
          onClick={isAllSelected ? onClearSelection : onSelectAll}
          disabled={isProcessing}
          className="h-8 gap-1.5 text-xs"
        >
          {isAllSelected ? (
            <>
              <Square className="h-3.5 w-3.5" />
              <span>Deselect all</span>
            </>
          ) : (
            <>
              <CheckSquare className="h-3.5 w-3.5" />
              <span>Select {totalCount > 100 ? "first 100" : `all (${totalCount})`}</span>
            </>
          )}
        </Button>

        <span className="text-xs font-semibold text-foreground">
          {selectedCount} {selectedCount === 1 ? "request" : "requests"} selected (maximum 100)
        </span>
      </div>

      <div className="flex items-center space-x-2">
        <Button
          variant="destructive"
          size="sm"
          onClick={onBulkReject}
          disabled={isProcessing}
          className="h-8 gap-1.5 text-xs font-medium"
        >
          {isProcessing && actionInProgress === "reject" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Rejecting...</span>
            </>
          ) : (
            <>
              <XCircle className="h-3.5 w-3.5" />
              <span>Reject ({selectedCount})</span>
            </>
          )}
        </Button>

        <Button
          variant="success"
          size="sm"
          onClick={onBulkApprove}
          disabled={isProcessing}
          className="h-8 gap-1.5 text-xs font-medium"
        >
          {isProcessing && actionInProgress === "approve" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Approving...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Approve ({selectedCount})</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
