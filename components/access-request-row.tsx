"use client";

import * as React from "react";
import { Check, X, RotateCcw, Loader2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { AccessRequest } from "@/lib/types";
import { formatTimeAgo } from "@/lib/utils";

interface AccessRequestRowProps {
  request: AccessRequest;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onViewDetails: (request: AccessRequest) => void;
  onApprove: (request: AccessRequest) => Promise<void>;
  onReject: (request: AccessRequest) => Promise<void>;
  onRevoke: (request: AccessRequest) => Promise<void>;
  isMutating?: boolean;
}

export function AccessRequestRow({
  request,
  isSelected = false,
  onToggleSelect,
  onViewDetails,
  onApprove,
  onReject,
  onRevoke,
  isMutating = false,
}: AccessRequestRowProps) {
  // Find a prominent display field (e.g. affiliation, institution, organization, university) if present
  const secondaryInfo = React.useMemo(() => {
    if (!request.fields) return null;
    const lowerKeys = Object.keys(request.fields);
    const affiliationKey = lowerKeys.find((k) =>
      /affiliation|organization|institution|company|university/i.test(k)
    );
    if (affiliationKey && request.fields[affiliationKey]) {
      return String(request.fields[affiliationKey]);
    }
    // Otherwise pick the first non-empty string field
    for (const key of lowerKeys) {
      const val = request.fields[key];
      if (typeof val === "string" && val.trim().length > 0 && val.length < 50) {
        return val;
      }
    }
    return null;
  }, [request.fields]);

  const handleRowClick = (e: React.MouseEvent) => {
    // If click was on checkbox, button, or link, don't trigger view details
    const target = e.target as HTMLElement;
    if (
      target.closest("button") ||
      target.closest("input") ||
      target.closest("a") ||
      target.closest('[role="checkbox"]')
    ) {
      return;
    }
    onViewDetails(request);
  };

  return (
    <div
      onClick={handleRowClick}
      className={`group relative flex flex-col sm:flex-row sm:items-center justify-between border-b p-3 sm:p-4 transition-colors hover:bg-muted/40 cursor-pointer ${
        isSelected ? "bg-muted/60" : "bg-card"
      }`}
    >
      {/* Left section: Checkbox + User info */}
      <div className="flex items-start sm:items-center space-x-3 flex-1 min-w-0 pr-2">
        {request.status === "pending" && onToggleSelect && (
          <div className="pt-0.5 sm:pt-0" onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onToggleSelect(request.id)}
              disabled={isMutating}
              aria-label={`Select ${request.username}`}
            />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-sm text-foreground truncate">
              {request.fullName || `@${request.username}`}
            </span>
            {request.fullName && (
              <span className="text-xs font-mono text-muted-foreground truncate">
                @{request.username}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
            {request.email && <span className="truncate">{request.email}</span>}
            {request.email && secondaryInfo && <span>•</span>}
            {secondaryInfo && <span className="font-medium text-foreground/80 truncate">{secondaryInfo}</span>}
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-1 sm:hidden">
            <Badge variant={request.repository.type} className="text-[10px] px-1.5 py-0">
              {request.repository.type.toUpperCase()} · {request.repository.repoId}
            </Badge>
            <span className="text-[11px] text-muted-foreground">
              {formatTimeAgo(request.requestedAt)}
            </span>
          </div>
        </div>
      </div>

      {/* Center section: Repo & Time (Desktop only) */}
      <div className="hidden sm:flex flex-col items-start px-4 min-w-[220px] max-w-[320px]">
        <div className="flex items-center gap-1.5">
          <Badge variant={request.repository.type} className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0">
            {request.repository.type}
          </Badge>
          <span className="font-mono text-xs font-medium truncate text-foreground" title={request.repository.repoId}>
            {request.repository.repoId}
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground mt-0.5">
          {formatTimeAgo(request.requestedAt)}
        </span>
      </div>

      {/* Right section: Action buttons */}
      <div
        className="flex items-center justify-end space-x-2 mt-3 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40"
        onClick={(e) => e.stopPropagation()}
      >
        {request.status === "pending" && (
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={isMutating}
              onClick={() => onReject(request)}
              className="h-8 px-2.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-input"
              title="Reject request directly"
            >
              {isMutating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <X className="h-3.5 w-3.5 mr-1" />
              )}
              <span>Reject</span>
            </Button>

            <Button
              variant="success"
              size="sm"
              disabled={isMutating}
              onClick={() => onApprove(request)}
              className="h-8 px-2.5 text-xs shadow-none"
              title="Approve request directly"
            >
              {isMutating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5 mr-1" />
              )}
              <span>Approve</span>
            </Button>
          </>
        )}

        {request.status === "accepted" && (
          <Button
            variant="outline"
            size="sm"
            disabled={isMutating}
            onClick={() => onRevoke(request)}
            className="h-8 px-2.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
            title="Revoke accepted access"
          >
            {isMutating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <X className="h-3.5 w-3.5 mr-1" />
            )}
            <span>Revoke</span>
          </Button>
        )}

        {request.status === "rejected" && (
          <Button
            variant="outline"
            size="sm"
            disabled={isMutating}
            onClick={() => onApprove(request)}
            className="h-8 px-2.5 text-xs text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
            title="Restore and approve access"
          >
            {isMutating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
            )}
            <span>Approve</span>
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => onViewDetails(request)}
          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
          title="View full request details"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
