"use client";

import * as React from "react";
import { Check, ChevronDown, ChevronUp, ExternalLink, Loader2, RotateCcw, TriangleAlert, X } from "lucide-react";
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

/** Long enough that the two-line clamp is probably hiding something. */
const CLAMPED_NARRATIVE_LENGTH = 160;

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
  const [expanded, setExpanded] = React.useState(false);

  const summary = React.useMemo(() => summarizeRequestFields(request.fields), [request.fields]);
  const thin = isThinRequest(summary);

  const narrativeMayBeClipped =
    summary.narrative?.value != null && summary.narrative.value.length > CLAMPED_NARRATIVE_LENGTH;
  const canExpand = summary.extra.length > 0 || narrativeMayBeClipped;

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
              <span className="font-mono text-sm font-medium text-foreground">@{request.username}</span>
            )}

            {request.fullName && (
              <span className="font-mono text-xs text-muted-foreground">@{request.username}</span>
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

            {canExpand && (
              <button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                aria-expanded={expanded}
                className="inline-flex h-[17px] items-center gap-1 self-center rounded-sm border border-input px-1.5 text-[10.5px] text-primary transition-colors hover:bg-primary/10"
              >
                {expanded
                  ? "Hide extra answers"
                  : summary.extra.length > 0
                    ? `+${summary.extra.length} more answers`
                    : "Show full answer"}
                {expanded ? (
                  <ChevronUp className="h-2.5 w-2.5" strokeWidth={2} />
                ) : (
                  <ChevronDown className="h-2.5 w-2.5" strokeWidth={2} />
                )}
              </button>
            )}
          </div>

          {/* Collapsed: the four answers that decide most reviews. */}
          {!expanded && summary.primary.length > 0 && (
            <div className="grid grid-cols-2 gap-x-5 gap-y-[3px] sm:grid-cols-4">
              {summary.primary.map((field) => (
                <FieldCell key={field.key} field={field} />
              ))}
            </div>
          )}

          {/* Expanded: every answer the form carries, in place. */}
          {expanded && summary.total > 0 && (
            <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
              {[...summary.primary, ...summary.extra].map((field) => (
                <div key={field.key} className="bg-muted px-[11px] py-2">
                  <FieldCell field={field} />
                </div>
              ))}
            </div>
          )}

          {summary.narrative?.value && (
            <div className={cn("flex gap-2.5", expanded && "border-l-2 border-border pl-3")}>
              {!expanded && <span className="field-label shrink-0 pt-0.5">{summary.narrative.label}</span>}
              <div className="min-w-0">
                {expanded && <div className="field-label mb-0.5">{summary.narrative.label}</div>}
                <p
                  className={cn(
                    "text-[12.5px] leading-[1.45] text-prose [text-wrap:pretty]",
                    !expanded && "line-clamp-2"
                  )}
                >
                  {summary.narrative.value}
                </p>
              </div>
            </div>
          )}

          {expanded && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5">
              <a
                href={profileUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[11.5px] text-primary hover:underline"
              >
                huggingface.co/{request.username}
                <ExternalLink className="h-2.5 w-2.5" strokeWidth={1.6} />
              </a>
              <span className="font-mono text-[11px] text-label">
                requested {formatDateTime(request.requestedAt)} · {summary.total}{" "}
                {summary.total === 1 ? "form answer" : "form answers"}
              </span>
            </div>
          )}
        </div>

        {/* Repository. */}
        <div className="col-start-2 flex min-w-0 flex-col gap-1.5 lg:col-start-auto">
          <div className="flex items-center gap-2">
            <Badge variant={request.repository.type}>{request.repository.type}</Badge>
            <span className="font-mono text-xs text-muted-foreground lg:hidden">
              {formatTimeAgo(request.requestedAt)}
            </span>
          </div>
          <a
            href={repoUrl}
            target="_blank"
            rel="noreferrer"
            title={request.repository.repoId}
            className="truncate font-mono text-xs text-value hover:text-primary hover:underline"
          >
            {request.repository.repoId}
          </a>
        </div>

        {/* Age — its own column once there is room for it. */}
        <div className="hidden pt-0.5 text-xs text-muted-foreground lg:block">
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
