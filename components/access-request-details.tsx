"use client";

import * as React from "react";
import {
  ExternalLink,
  Loader2,
  CheckCircle,
  XCircle,
  RotateCcw,
  User,
  Mail,
  Calendar,
  Layers,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AccessRequest } from "@/lib/types";
import { formatDateTime, formatFieldLabel } from "@/lib/utils";

interface AccessRequestDetailsProps {
  request: AccessRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: (request: AccessRequest) => Promise<boolean>;
  onReject: (request: AccessRequest) => Promise<boolean>;
  onRevoke: (request: AccessRequest) => Promise<boolean>;
  isMutating: boolean;
  stale?: boolean;
}

export function AccessRequestDetails({
  request,
  open,
  onOpenChange,
  onApprove,
  onReject,
  onRevoke,
  isMutating,
  stale = false,
}: AccessRequestDetailsProps) {
  if (!request) return null;

  const repoUrl =
    request.repository.type === "dataset"
      ? `https://huggingface.co/datasets/${request.repository.repoId}`
      : `https://huggingface.co/${request.repository.repoId}`;

  const hfProfileUrl = `https://huggingface.co/${request.username}`;

  // Helper to render dynamic form field values cleanly
  const renderFieldValue = (value: unknown): React.ReactNode => {
    if (value === null || value === undefined || value === "") {
      return <span className="text-muted-foreground italic">None provided</span>;
    }
    if (typeof value === "boolean") {
      return value ? "Yes" : "No";
    }
    if (Array.isArray(value)) {
      return (
        <ul className="list-inside list-disc space-y-1">
          {value.map((v, i) => (
            <li key={i}>{renderFieldValue(v)}</li>
          ))}
        </ul>
      );
    }
    if (typeof value === "object") {
      return (
        <pre className="overflow-x-auto rounded bg-muted p-2 font-mono text-xs">
          {JSON.stringify(value, null, 2)}
        </pre>
      );
    }
    return String(value);
  };

  const fieldEntries = Object.entries(request.fields || {});

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col overflow-y-auto sm:max-w-lg">
        <SheetHeader className="border-b pb-4">
          <div className="flex items-start justify-between pr-6">
            <div>
              <SheetTitle className="text-xl font-bold">
                {request.fullName || `@${request.username}`}
              </SheetTitle>
              {request.fullName && (
                <p className="text-sm font-mono text-muted-foreground">
                  @{request.username}
                </p>
              )}
            </div>

            <Badge
              variant={
                request.status === "accepted"
                  ? "success"
                  : request.status === "rejected"
                  ? "destructive"
                  : "outline"
              }
              className="capitalize"
            >
              {request.status}
            </Badge>
          </div>
          <SheetDescription className="sr-only">
            Gated access request details for {request.username}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 py-4">
          {stale && <p role="status" className="rounded border p-3 text-sm text-muted-foreground">
            This request is no longer in the loaded list. Close this panel and refresh before acting.
          </p>}
          {/* Metadata Section */}
          <div className="space-y-4 rounded-lg border bg-card p-4 text-sm shadow-sm">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <User className="h-3.5 w-3.5" />
                  Username
                </span>
                <div className="mt-1 flex items-center gap-1.5 font-medium">
                  <a
                    href={hfProfileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    @{request.username}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>

              <div>
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  Email
                </span>
                <p className="mt-1 font-medium truncate">
                  {request.email || <span className="text-muted-foreground italic">Not provided</span>}
                </p>
              </div>

              <div>
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Layers className="h-3.5 w-3.5" />
                  Repository
                </span>
                <div className="mt-1 flex items-center gap-1.5">
                  <Badge variant={request.repository.type}>
                    {request.repository.type.toUpperCase()}
                  </Badge>
                  <a
                    href={repoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline truncate"
                  >
                    {request.repository.repoId}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                </div>
              </div>

              <div>
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  Requested
                </span>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDateTime(request.requestedAt)}
                </p>
              </div>
            </div>
          </div>

          {/* Dynamic Gated Form Fields Section */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Gated Form Information
            </h4>

            {fieldEntries.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                No custom form questions were configured for this repository.
              </div>
            ) : (
              <div className="space-y-3">
                {fieldEntries.map(([key, value]) => (
                  <div
                    key={key}
                    className="rounded-md border bg-muted/30 p-3 text-sm"
                  >
                    <span className="text-xs font-semibold text-muted-foreground">
                      {formatFieldLabel(key)}
                    </span>
                    <div className="mt-1 text-foreground whitespace-pre-wrap break-words">
                      {renderFieldValue(value)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="border-t pt-4">
          <div className="flex items-center justify-end gap-2">
            {request.status === "pending" && (
              <>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={isMutating}
                  onClick={async () => {
                    if (await onReject(request)) onOpenChange(false);
                  }}
                  className="gap-1.5"
                >
                  {isMutating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  <span>Reject</span>
                </Button>

                <Button
                  variant="success"
                  size="sm"
                  disabled={isMutating}
                  onClick={async () => {
                    if (await onApprove(request)) onOpenChange(false);
                  }}
                  className="gap-1.5"
                >
                  {isMutating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4" />
                  )}
                  <span>Approve</span>
                </Button>
              </>
            )}

            {request.status === "accepted" && (
              <Button
                variant="destructive"
                size="sm"
                disabled={isMutating}
                onClick={async () => {
                  if (await onRevoke(request)) onOpenChange(false);
                }}
                className="gap-1.5"
              >
                {isMutating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                <span>Revoke Access</span>
              </Button>
            )}

            {request.status === "rejected" && (
              <Button
                variant="success"
                size="sm"
                disabled={isMutating}
                onClick={async () => {
                  if (await onApprove(request)) onOpenChange(false);
                }}
                className="gap-1.5"
              >
                {isMutating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                <span>Approve (Restore)</span>
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
