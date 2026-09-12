"use client";

import * as React from "react";
import { Check, ExternalLink, Loader2, RotateCcw, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { AccessRequest } from "@/lib/types";
import { formatDateTime, formatTimeAgo } from "@/lib/utils";
import { isThinRequest, summarizeRequestFields, type RequestField } from "@/lib/request-fields";
import { cn } from "@/lib/utils";

interface AccessRequestRowProps {
  request: AccessRequest;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onApprove: (request: AccessRequest) => Promise<boolean>;
  onReject: (request: AccessRequest) => Promise<boolean>;
  onRevoke: (request: AccessRequest) => Promise<boolean>;
  isMutating?: boolean;
}

const COLUMNS =
  "grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-3 lg:grid-cols-[26px_minmax(0,1fr)_226px_92px_172px] lg:gap-4";

function FieldCell({ field }: { field: RequestField }) {
  return (
    <div className="min-w-0">
      <div className="field-label truncate" title={field.label}>
        {field.label}
      </div>
      {field.value === null ? (
        <div className="text-[12.5px] italic leading-[1.35] text-muted-foreground/70">not provided</div>
      ) : (
        <div className="break-words text-[12.5px] leading-[1.35] text-value">{field.value}</div>
      )}
    </div>
  );
}

export function AccessRequestRow({
  request,
  isSelected = false,
  onToggleSelect,
  onApprove,
  onReject,
  onRevoke,
  isMutating = false,
}: AccessRequestRowProps) {
  const summary = React.useMemo(() => summarizeRequestFields(request.fields), [request.fields]);
  const thin = isThinRequest(summary);

  const repoUrl =
    request.repository.type === "dataset"
      ? `https://huggingface.co/datasets/${request.repository.repoId}`
      : `https://huggingface.co/${request.repository.repoId}`;
  const profileUrl = `https://huggingface.co/${request.username}`;

  const missingIdentity = !request.fullName
    ? request.email
      ? "no display name"
      : "no display name, no email"
    : null;

  return (
    <div
      className={cn(
        "relative border-b border-divider p-3 transition-colors last:border-b-0 sm:p-4",
        isSelected
          ? "bg-selected shadow-[inset_2px_0_0_hsl(var(--primary))]"
          : "bg-card hover:bg-accent/40"
      )}
    >
      <div className={COLUMNS}>
        {/* Selection — pending requests only; the other tabs are history. */}
        <div className="pt-0.5">
          {request.status === "pending" && onToggleSelect ? (
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onToggleSelect(request.id)}
              disabled={isMutating}
              aria-label={`Select ${request.username}`}
            />
          ) : (
            <span
              aria-hidden
              className={cn(
                "mt-1.5 block h-1.5 w-1.5 rounded-full",
                request.status === "accepted" ? "bg-success" : "bg-danger"
              )}
            />
          )}
        </div>

        {/* Identity, every answer, and the in-place expander. */}
        <div className="min-w-0 space-y-[7px]">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            {request.fullName ? (
              <span className="text-[14.5px] font-semibold -tracking-[0.01em] text-foreground">
                {request.fullName}
              </span>
            ) : (
              <a
                href={profileUrl}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-sm font-medium text-foreground hover:text-primary hover:underline"
              >
                @{request.username}
              </a>
            )}

            {request.fullName && (
              <a
                href={profileUrl}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs text-muted-foreground hover:text-primary hover:underline"
              >
                @{request.username}
              </a>
            )}

            {request.email && (
              <>
                <span aria-hidden className="h-[3px] w-[3px] self-center rounded-full bg-input" />
                <span className="font-mono text-xs text-muted-foreground">{request.email}</span>
              </>
            )}

            {missingIdentity && (
              <span className="text-[11.5px] italic text-muted-foreground/70">{missingIdentity}</span>
            )}

            {request.status !== "pending" && (
              <Badge variant={request.status === "accepted" ? "success" : "rejected"}>
                {request.status}
              </Badge>
            )}

            {thin && (
              <Badge variant="warning" className="gap-1.5">
                <TriangleAlert className="h-2.5 w-2.5" strokeWidth={1.8} />
                {summary.emptyCount} of {summary.total} answers empty
              </Badge>
            )}

          </div>

          {/* Every answer the form asked, deciding ones first, none withheld. */}
          {summary.fields.length > 0 && (
            <div className="grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-4">
              {summary.fields.map((field) => (
                <FieldCell key={field.key} field={field} />
              ))}
            </div>
          )}

          {/* The long answer, in full — reading it should never cost a click. */}
          {summary.narrative?.value && (
            <div className="flex gap-2.5">
              <span className="field-label shrink-0 pt-0.5">{summary.narrative.label}</span>
              <p className="min-w-0 text-[12.5px] leading-[1.45] text-prose [text-wrap:pretty]">
                {summary.narrative.value}
              </p>
            </div>
          )}
        </div>

        {/* Repository. */}
        <div className="col-start-2 flex min-w-0 flex-col gap-1.5 lg:col-start-auto">
          <div className="flex items-center gap-2">
            <Badge variant={request.repository.type}>{request.repository.type}</Badge>
            <span
              className="font-mono text-xs text-muted-foreground lg:hidden"
              title={formatDateTime(request.requestedAt)}
            >
              {formatTimeAgo(request.requestedAt)}
            </span>
          </div>
          <a
            href={repoUrl}
            target="_blank"
            rel="noreferrer"
            title={request.repository.repoId}
            className="group inline-flex min-w-0 items-center gap-1.5 font-mono text-xs text-value hover:text-primary"
          >
            <span className="truncate">{request.repository.repoId}</span>
            <ExternalLink
              className="h-2.5 w-2.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
              strokeWidth={1.6}
            />
          </a>
        </div>

        {/* Age — its own column once there is room for it. */}
        <div
          className="hidden pt-0.5 text-xs text-muted-foreground lg:block"
          title={formatDateTime(request.requestedAt)}
        >
          {formatTimeAgo(request.requestedAt)}
        </div>

        {/* Decision. */}
        <div className="col-start-2 flex items-start justify-end gap-2 lg:col-start-auto">
          {request.status === "pending" && (
            <>
              <Button
                variant="reject"
                size="row"
                disabled={isMutating}
                onClick={() => onReject(request)}
                title="Reject this request"
              >
                {isMutating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <X className="mr-1.5 h-3 w-3" strokeWidth={2} />
                )}
                Reject
              </Button>
              <Button
                variant="success"
                size="row"
                disabled={isMutating}
                onClick={() => onApprove(request)}
                title="Approve this request"
              >
                {isMutating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="mr-1.5 h-3 w-3" strokeWidth={2.2} />
                )}
                Approve
              </Button>
            </>
          )}

          {request.status === "accepted" && (
            <Button
              variant="reject"
              size="row"
              disabled={isMutating}
              onClick={() => onRevoke(request)}
              title="Revoke accepted access"
            >
              {isMutating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <X className="mr-1.5 h-3 w-3" strokeWidth={2} />
              )}
              Revoke
            </Button>
          )}

          {request.status === "rejected" && (
            <Button
              variant="restore"
              size="row"
              disabled={isMutating}
              onClick={() => onApprove(request)}
              title="Restore and approve access"
            >
              {isMutating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="mr-1.5 h-3 w-3" strokeWidth={1.8} />
              )}
              Restore
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
