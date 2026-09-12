export type RepoType = "model" | "dataset" | "space";

export interface ManagedRepository {
  type: RepoType;
  repoId: string;
}

export type RequestStatus = "pending" | "accepted" | "rejected";

export interface AccessRequest {
  id: string; // Unique ID: `${repo.type}:${repo.repoId}:${username}`
  username: string;
  fullName?: string;
  email?: string;
  requestedAt?: string;
  status: RequestStatus;
  repository: ManagedRepository;
  fields: Record<string, unknown>;
  raw?: unknown;
}

export interface RepositoryStatus {
  repository: ManagedRepository;
  status: "connected" | "unsupported" | "error";
  pendingCount?: number;
  pendingHasMore?: boolean;
  acceptedCount?: number;
  rejectedCount?: number;
  message?: string;
  gated?: "manual" | "auto" | false;
  isPrivate?: boolean;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiResponse<T> {
  data?: T;
  error?: ApiError;
}

export interface PaginatedAccessRequests {
  requests: AccessRequest[];
  hasMore: boolean;
  truncated: boolean;
  totalLoaded: number;
  nextUrl?: string | null;
}

export interface BulkActionItem {
  id?: string;
  repo: ManagedRepository;
  username: string;
}

export interface BulkActionResult {
  total: number;
  succeeded: number;
  failed: number;
  errors: Array<{
    id: string;
    item: BulkActionItem;
    error: string;
  }>;
}
