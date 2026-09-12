import "server-only";
import { AccessRequest, ManagedRepository, PaginatedAccessRequests, RepoType, RepositoryStatus, RequestStatus } from "./types";
import { getEnv } from "./env";
import { ABSOLUTE_MAX_PAGES } from "./pagination";
import { MAX_PAGE_BYTES, operationSignal, RequestOptions } from "./request-budget";
import { usernameSchema } from "./validations";

const HF_API_BASE = "https://huggingface.co";

/**
 * Custom error class for Hugging Face API errors
 */
export class HfApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "HfApiError";
  }
}

/**
 * Checks if a repository type supports the Hugging Face gated access request workflow.
 * As verified in official Hugging Face Hub documentation, only Models and Datasets support gated requests.
 */
export function isGatingSupported(repoType: RepoType): boolean {
  return repoType === "model" || repoType === "dataset";
}

/**
 * Helper to pluralize repo type for HF API endpoints: model -> models, dataset -> datasets
 */
function getPluralRepoType(type: RepoType): string {
  if (type === "model") return "models";
  if (type === "dataset") return "datasets";
  if (type === "space") return "spaces";
  return `${type}s`;
}

/**
 * Safely builds request headers with HF_TOKEN without leaking token in logs
 */
function buildHfHeaders(tokenOverride?: string): Record<string, string> {
  const token = tokenOverride ?? getEnv().hfToken;
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": "hf-access-manager/1.0",
  };
}

/**
 * Parses the HTTP Link header to extract the next page URL
 */
function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;

  // Example: <https://huggingface.co/api/models/foo/user-access-request/pending?cursor=...>; rel="next"
  const links = linkHeader.split(/,(?=\s*<)/);
  for (const link of links) {
    const match = link.match(/^\s*<([^>]+)>(.*)$/);
    if (!match) throw new HfApiError(502, "HF_INVALID_PAGINATION", "Malformed pagination header from Hugging Face.");
    const relation = match[2].match(/;\s*rel\s*=\s*(?:"([^"]+)"|([^;\s]+))/i);
    if ((relation?.[1] || relation?.[2] || "").split(/\s+/).includes("next")) {
      return match[1];
    }
  }
  return null;
}

/**
 * Maps raw HF HTTP errors to clean, structured HfApiError objects
 */
async function handleHfError(response: Response, repo: ManagedRepository): Promise<never> {
  let errorMessage = `Hugging Face API request failed with status ${response.status}`;
  let errorDetails: unknown = undefined;

  try {
    const data = await response.json();
    errorDetails = data;
    if (typeof data.error === "string") {
      errorMessage = data.error;
    } else if (typeof data.message === "string") {
      errorMessage = data.message;
    }
  } catch {
    // If not json, try text
    try {
      const text = await response.text();
      if (text) errorMessage = text;
    } catch {
      // ignore
    }
  }

  let code = "HF_API_ERROR";
  let userFriendlyMessage = errorMessage;

  switch (response.status) {
    case 400:
      code = "HF_BAD_REQUEST";
      if (errorMessage.toLowerCase().includes("not gated")) {
        userFriendlyMessage = `Repository ${repo.repoId} is not configured as a gated repository.`;
      } else if (errorMessage.toLowerCase().includes("already")) {
        userFriendlyMessage = `User already has access to repository ${repo.repoId}.`;
      }
      break;
    case 401:
      code = "HF_UNAUTHORIZED";
      userFriendlyMessage = "The configured Hugging Face token is invalid or expired.";
      break;
    case 403:
      code = "HF_FORBIDDEN";
      userFriendlyMessage = `Insufficient permissions for repository ${repo.repoId}. The token must have write or admin access to the repository or organization.`;
      break;
    case 404:
      code = "HF_NOT_FOUND";
      userFriendlyMessage = `Repository ${repo.repoId} or requested resource was not found on Hugging Face Hub.`;
      break;
    default:
      if (response.status >= 500) {
        code = "HF_SERVER_ERROR";
        userFriendlyMessage = "Hugging Face Hub service is currently unavailable or returning an error.";
      }
  }

  throw new HfApiError(response.status, code, userFriendlyMessage.slice(0, 500), errorDetails);
}

/**
 * Normalizes a raw request object from Hugging Face API into an AccessRequest
 */
export function normalizeHfAccessRequest(
  item: unknown,
  status: RequestStatus,
  repository: ManagedRepository
): AccessRequest {
  if (!item || typeof item !== "object") {
    throw new HfApiError(502, "HF_INVALID_RESPONSE", "Invalid access request payload from Hugging Face Hub.");
  }

  const record = item as Record<string, unknown>;
  let username = "";
  let fullName: string | undefined = undefined;
  let email: string | undefined = undefined;

  // HF returns: { user: { user: "alice", fullname: "Alice", email: "alice@..." }, status: "...", timestamp: "..." }
  if (record.user && typeof record.user === "object") {
    const userObj = record.user as Record<string, unknown>;
    const name = userObj.user ?? userObj.username;
    if (typeof name !== "string" || (userObj.fullname != null && typeof userObj.fullname !== "string") || (userObj.email != null && typeof userObj.email !== "string")) {
      throw new HfApiError(502, "HF_INVALID_RESPONSE", "Hugging Face returned invalid user metadata.");
    }
    username = name;
    fullName = userObj.fullname as string | undefined;
    email = userObj.email == null ? undefined : userObj.email as string;
  } else if (typeof record.user === "string") {
    username = record.user;
  }

  if (!username && typeof record.username === "string") {
    username = record.username;
  }

  if (!usernameSchema.safeParse(username).success || username !== username.trim()) {
    throw new HfApiError(502, "HF_INVALID_RESPONSE", "Hugging Face returned an invalid request username.");
  }

  if (record.timestamp != null && (typeof record.timestamp !== "string" || !Number.isFinite(Date.parse(record.timestamp)))) {
    throw new HfApiError(502, "HF_INVALID_RESPONSE", "Hugging Face returned an invalid request timestamp.");
  }
  const requestedAt = record.timestamp as string | undefined;

  let fields: Record<string, unknown> = {};
  if (record.fields != null && (typeof record.fields !== "object" || Array.isArray(record.fields))) {
    throw new HfApiError(502, "HF_INVALID_RESPONSE", "Hugging Face returned invalid form fields.");
  }
  if (record.fields && typeof record.fields === "object" && !Array.isArray(record.fields)) {
    fields = record.fields as Record<string, unknown>;
  }

  return {
    id: `${repository.type}:${repository.repoId}:${username}`,
    username,
    fullName,
    email,
    requestedAt,
    status,
    repository,
    fields,
  };
}

/**
 * Fetch wrapper with configurable timeout using AbortController.
 * Ensures all Hugging Face GET and POST operations terminate safely without hanging indefinitely.
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 15000,
  repo?: ManagedRepository,
  options?: RequestOptions
): Promise<Response> {
  const deadline = AbortSignal.timeout(timeoutMs);
  const signal = options?.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let onAbort: (() => void) | undefined;

  try {
    // Race even mocked/non-cooperative transports against the same body deadline.
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    });
    const work = async () => {
      signal.throwIfAborted();
      if (options?.budget && options.budget.remainingBytes <= 0) {
        throw new HfApiError(502, "HF_RESPONSE_LIMIT", "Upstream response budget reached. Load a smaller window or configure fewer repositories.");
      }
      const res = await fetch(url, { ...init, signal, redirect: "manual" });
      if (signal.aborted) {
        void res.body?.cancel().catch(() => {});
        signal.throwIfAborted();
      }
      if (res.status >= 300 && res.status < 400) {
        await res.body?.cancel();
        throw new HfApiError(502, "HF_REDIRECT", "Hugging Face redirected the request. Verify the configured repository identifier.");
      }
      reader = res.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) {
        while (true) {
          signal.throwIfAborted();
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (options?.budget) options.budget.remainingBytes -= value.byteLength;
          if (size > MAX_PAGE_BYTES || (options?.budget && options.budget.remainingBytes < 0)) {
            throw new HfApiError(502, "HF_RESPONSE_LIMIT", "Hugging Face response exceeded the safe data limit. Reduce the history window or configured repositories.");
          }
          chunks.push(value);
        }
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return new Response([204, 205, 304].includes(res.status) ? null : bytes, { status: res.status, headers: res.headers });
    };
    return await Promise.race([work(), aborted]);
  } catch (err: unknown) {
    if (options?.signal?.aborted && options.signal.reason?.name !== "TimeoutError") {
      throw new DOMException("Request cancelled", "AbortError");
    }
    if (err instanceof HfApiError) throw err;
    if ((err as { name?: string }).name === "AbortError" || signal.aborted) {
      const repoLabel = repo ? ` for ${repo.repoId}` : "";
      throw new HfApiError(
        504,
        "HF_TIMEOUT",
        `Request to Hugging Face Hub timed out after ${Math.round(timeoutMs / 1000)}s${repoLabel}.`
      );
    }
    throw new HfApiError(
      500,
      "HF_NETWORK_ERROR",
      "Network error connecting to Hugging Face Hub. Refresh to reconcile any uncertain mutation outcome."
    );
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
    if (reader) void reader.cancel().catch(() => {});
  }
}

export interface ListAccessRequestsOptions extends RequestOptions {
  maxPages?: number;
  tokenOverride?: string;
  timeoutMs?: number;
}

/**
 * Fetches access requests for a given repository and status with pagination support.
 * Refactored to explicitly track truncation and hasMore metadata instead of silently
 * capping results.
 */
export async function listAccessRequests(
  repo: ManagedRepository,
  status: RequestStatus,
  options?: ListAccessRequestsOptions
): Promise<PaginatedAccessRequests> {
  if (!isGatingSupported(repo.type)) {
    throw new HfApiError(
      400,
      "HF_UNSUPPORTED_REPO_TYPE",
      `Gated access request API is not supported for "${repo.type}" repositories.`
    );
  }

  const pluralType = getPluralRepoType(repo.type);
  // Default maxPages: for pending (primary review queue), load up to 50 pages (approx 2,500 requests);
  // for accepted/rejected histories, load 10 pages per increment.
  const defaultMax = status === "pending" ? 50 : 10;
  const maxPages = Math.min(ABSOLUTE_MAX_PAGES, Math.max(1, Math.floor(options?.maxPages || defaultMax)));
  options = { ...options, signal: operationSignal(options?.signal) };
  const timeoutMs = options?.timeoutMs ?? 15000;
  const headers = buildHfHeaders(options?.tokenOverride);

  let currentUrl: string | null = `${HF_API_BASE}/api/${pluralType}/${repo.repoId}/user-access-request/${status}`;
  const endpoint = new URL(currentUrl);
  const visited = new Set<string>();
  const identities = new Set<string>();
  const allRequests: AccessRequest[] = [];
  let pageCount = 0;
  let hasMore = false;
  let truncated = false;
  let nextUrl: string | null = null;

  while (currentUrl) {
    options.signal?.throwIfAborted();
    let next: URL;
    try { next = new URL(currentUrl, endpoint); } catch {
      throw new HfApiError(502, "HF_INVALID_PAGINATION", "Hugging Face returned a malformed pagination URL.");
    }
    if (next.origin !== endpoint.origin || next.pathname !== endpoint.pathname || next.username || next.password || next.hash || visited.has(next.href)) {
      throw new HfApiError(502, "HF_INVALID_PAGINATION", "Hugging Face returned an unsafe or repeated pagination link.");
    }
    currentUrl = next.href;
    if (pageCount >= maxPages) {
      // Stopped because of internal safety limit, but more pages exist
      hasMore = true;
      truncated = true;
      nextUrl = currentUrl;
      break;
    }

    pageCount++;
    visited.add(currentUrl);
    const res = await fetchWithTimeout(
      currentUrl,
      {
        method: "GET",
        headers,
        cache: "no-store",
      },
      timeoutMs,
      repo,
      options
    );

    if (!res.ok) {
      await handleHfError(res, repo);
    }

    let data: unknown;
    try { data = await res.json(); } catch {
      throw new HfApiError(502, "HF_INVALID_RESPONSE", "Hugging Face returned invalid JSON.");
    }
    if (!Array.isArray(data)) {
      throw new HfApiError(502, "HF_INVALID_RESPONSE", "Hugging Face returned an invalid request list.");
    }

    for (const item of data) {
      const normalized = normalizeHfAccessRequest(item, status, repo);
      if (!identities.has(normalized.id)) {
        identities.add(normalized.id);
        allRequests.push(normalized);
      }
    }

    const nextLink = parseNextLink(res.headers.get("link"));
    currentUrl = nextLink;
  }

  return {
    requests: allRequests,
    hasMore,
    truncated,
    totalLoaded: allRequests.length,
    nextUrl,
  };
}

/**
 * Gets pending requests for a repository
 */
export async function getPendingRequests(
  repo: ManagedRepository,
  options?: ListAccessRequestsOptions
): Promise<PaginatedAccessRequests> {
  return listAccessRequests(repo, "pending", options);
}

/**
 * Gets accepted requests for a repository
 */
export async function getAcceptedRequests(
  repo: ManagedRepository,
  options?: ListAccessRequestsOptions
): Promise<PaginatedAccessRequests> {
  return listAccessRequests(repo, "accepted", options);
}

/**
 * Gets rejected requests for a repository
 */
export async function getRejectedRequests(
  repo: ManagedRepository,
  options?: ListAccessRequestsOptions
): Promise<PaginatedAccessRequests> {
  return listAccessRequests(repo, "rejected", options);
}

/**
 * Approves a user's access request for a repository with bounded timeout
 */
export async function approveRequest(
  repo: ManagedRepository,
  username: string,
  options?: RequestOptions
): Promise<void> {
  if (!isGatingSupported(repo.type)) {
    throw new HfApiError(
      400,
      "HF_UNSUPPORTED_REPO_TYPE",
      `Gated access request API is not supported for "${repo.type}" repositories.`
    );
  }

  const pluralType = getPluralRepoType(repo.type);
  const url = `${HF_API_BASE}/api/${pluralType}/${repo.repoId}/user-access-request/handle`;
  const headers = buildHfHeaders(options?.tokenOverride);
  const timeoutMs = options?.timeoutMs ?? 15000;

  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        user: username,
        status: "accepted",
      }),
      cache: "no-store",
    },
    timeoutMs,
    repo,
    options
  );

  if (!res.ok) {
    await handleHfError(res, repo);
  }
}

/**
 * Rejects a user's access request for a repository with bounded timeout
 */
export async function rejectRequest(
  repo: ManagedRepository,
  username: string,
  options?: RequestOptions
): Promise<void> {
  if (!isGatingSupported(repo.type)) {
    throw new HfApiError(
      400,
      "HF_UNSUPPORTED_REPO_TYPE",
      `Gated access request API is not supported for "${repo.type}" repositories.`
    );
  }

  const pluralType = getPluralRepoType(repo.type);
  const url = `${HF_API_BASE}/api/${pluralType}/${repo.repoId}/user-access-request/handle`;
  const headers = buildHfHeaders(options?.tokenOverride);
  const timeoutMs = options?.timeoutMs ?? 15000;

  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        user: username,
        status: "rejected",
      }),
      cache: "no-store",
    },
    timeoutMs,
    repo,
    options
  );

  if (!res.ok) {
    await handleHfError(res, repo);
  }
}

/**
 * Revokes an accepted user's access by resetting their request to pending status with bounded timeout
 */
export async function revokeRequest(
  repo: ManagedRepository,
  username: string,
  options?: RequestOptions
): Promise<void> {
  if (!isGatingSupported(repo.type)) {
    throw new HfApiError(
      400,
      "HF_UNSUPPORTED_REPO_TYPE",
      `Gated access request API is not supported for "${repo.type}" repositories.`
    );
  }

  const pluralType = getPluralRepoType(repo.type);
  const url = `${HF_API_BASE}/api/${pluralType}/${repo.repoId}/user-access-request/handle`;
  const headers = buildHfHeaders(options?.tokenOverride);
  const timeoutMs = options?.timeoutMs ?? 15000;

  // Hugging Face's cancel_access_request sets status to "pending", revoking accepted access
  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        user: username,
        status: "pending",
      }),
      cache: "no-store",
    },
    timeoutMs,
    repo,
    options
  );

  if (!res.ok) {
    await handleHfError(res, repo);
  }
}

/**
 * Manually grants access to a Hugging Face user with bounded timeout
 */
export async function grantAccess(
  repo: ManagedRepository,
  username: string,
  options?: RequestOptions
): Promise<void> {
  if (!isGatingSupported(repo.type)) {
    throw new HfApiError(
      400,
      "HF_UNSUPPORTED_REPO_TYPE",
      `Gated access request API is not supported for "${repo.type}" repositories.`
    );
  }

  const pluralType = getPluralRepoType(repo.type);
  const url = `${HF_API_BASE}/api/${pluralType}/${repo.repoId}/user-access-request/grant`;
  const headers = buildHfHeaders(options?.tokenOverride);
  const timeoutMs = options?.timeoutMs ?? 15000;

  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        user: username,
      }),
      cache: "no-store",
    },
    timeoutMs,
    repo,
    options
  );

  if (!res.ok) {
    await handleHfError(res, repo);
  }
}

/**
 * Checks the operational health and access request counts for a configured repository
 */
export async function checkRepositoryStatus(
  repo: ManagedRepository,
  options?: RequestOptions
): Promise<RepositoryStatus> {
  if (!isGatingSupported(repo.type)) {
    return {
      repository: repo,
      status: "unsupported",
      message: "Gated access request API is not supported for Spaces by Hugging Face Hub.",
    };
  }

  const pluralType = getPluralRepoType(repo.type);
  const headers = buildHfHeaders(options?.tokenOverride);

  try {
    // 1. Fetch metadata info
    const infoUrl = `${HF_API_BASE}/api/${pluralType}/${repo.repoId}`;
    const infoRes = await fetchWithTimeout(
      infoUrl,
      {
        method: "GET",
        headers,
        cache: "no-store",
      },
      15000,
      repo,
      options
    );

    if (!infoRes.ok) {
      await handleHfError(infoRes, repo);
    }

    const infoData = (await infoRes.json()) as Record<string, unknown>;
    const isPrivate = Boolean(infoData.private);
    const gatedVal = infoData.gated;
    let gated: "manual" | "auto" | false = false;
    if (gatedVal === "manual" || gatedVal === "auto") {
      gated = gatedVal;
    } else if (gatedVal === true) {
      gated = "manual";
    }

    // 2. Fetch pending count (bounded to 1 page for speed and lightweight check)
    const pendingResult = await getPendingRequests(repo, { ...options, maxPages: 1 });

    return {
      repository: repo,
      status: "connected",
      pendingCount: pendingResult.totalLoaded,
      pendingHasMore: pendingResult.hasMore || pendingResult.truncated,
      gated,
      isPrivate,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      repository: repo,
      status: "error",
      message,
    };
  }
}
