import { afterEach, describe, expect, it, vi } from "vitest";
import { aggregateRequests, executeBulkApprove } from "@/lib/access";
import { listAccessRequests } from "@/lib/huggingface";
import * as hf from "@/lib/huggingface";
import { MAX_PAGE_BYTES, MAX_RESPONSE_BYTES, REPOSITORY_CONCURRENCY } from "@/lib/request-budget";

// All repositories, credentials and form fields below are synthetic fixtures.
const repos = Array.from({ length: 8 }, (_, i) => ({ type: "model" as const, repoId: `review/synthetic-${i}` }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("bounded upstream work", () => {
  it("terminates stalled repository streams at the shared deadline and skips queued work", async () => {
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    vi.spyOn(AbortSignal, "timeout").mockImplementation(ms => timeout(ms === 25_000 ? 10 : ms));
    const fetcher = vi.fn().mockImplementation(async () => new Response(new ReadableStream({ start() {} })));
    vi.stubGlobal("fetch", fetcher);
    const result = await aggregateRequests(repos, "pending", { tokenOverride: "synthetic-only" });
    expect(result.successfulRepos).toBe(0);
    expect(result.errors).toHaveLength(repos.length);
    expect(fetcher).toHaveBeenCalledTimes(REPOSITORY_CONCURRENCY);
  });
  it("limits repository concurrency and isolates failures", async () => {
    let active = 0, peak = 0;
    vi.spyOn(hf, "getPendingRequests").mockImplementation(async repo => {
      active++; peak = Math.max(active, peak);
      await new Promise(resolve => setTimeout(resolve, 2));
      active--;
      if (repo === repos[3]) throw new Error("Synthetic failure");
      return { requests: [], hasMore: false, truncated: false, totalLoaded: 0 };
    });
    const result = await aggregateRequests(repos, "pending");
    expect(peak).toBe(REPOSITORY_CONCURRENCY);
    expect(result.successfulRepos).toBe(7);
    expect(result.errors).toHaveLength(1);
  });
  it("does not start queued repositories after client cancellation", async () => {
    const caller = new AbortController();
    const spy = vi.spyOn(hf, "getPendingRequests").mockImplementation(async (_repo, options) => {
      await new Promise((_, reject) => options?.signal?.addEventListener("abort", () => reject(options.signal!.reason), { once: true }));
      throw new Error("Unreachable");
    });
    const pending = aggregateRequests(repos, "pending", { signal: caller.signal });
    caller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(spy).toHaveBeenCalledTimes(REPOSITORY_CONCURRENCY);
  });
  it("rejects overlarge pages while consuming the body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x".repeat(MAX_PAGE_BYTES + 1))));
    await expect(listAccessRequests(repos[0], "pending", { tokenOverride: "synthetic-only" })).rejects.toMatchObject({ code: "HF_RESPONSE_LIMIT" });
  });
  it("enforces a shared upstream-byte budget", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("[]")));
    await expect(listAccessRequests(repos[0], "pending", { tokenOverride: "synthetic-only", budget: { remainingBytes: 1 } })).rejects.toMatchObject({ code: "HF_RESPONSE_LIMIT" });
  });
  it("does not serialize oversized normalized results as successful repositories", async () => {
    vi.spyOn(hf, "getPendingRequests").mockResolvedValue({ requests: [{ id: "synthetic", username: "synthetic-user", status: "pending", repository: repos[0], fields: { answer: "x".repeat(MAX_RESPONSE_BYTES) } }], totalLoaded: 1, hasMore: false, truncated: false });
    const result = await aggregateRequests([repos[0]], "pending");
    expect(result.requests).toEqual([]);
    expect(result.successfulRepos).toBe(0);
    expect(result.errors[0].code).toBe("HF_RESPONSE_LIMIT");
  });
  it("bounds 100-item bulk work and accounts for every failure", async () => {
    let active = 0, peak = 0;
    vi.spyOn(hf, "approveRequest").mockImplementation(async (_repo, user) => {
      active++; peak = Math.max(active, peak);
      await new Promise(resolve => setTimeout(resolve, 1));
      active--;
      if (user.endsWith("7")) throw new Error("Synthetic denial");
    });
    const result = await executeBulkApprove(Array.from({ length: 100 }, (_, i) => ({ repo: repos[0], username: `synthetic-${i}` })));
    expect(peak).toBe(5);
    expect(result).toMatchObject({ total: 100, succeeded: 90, failed: 10 });
    expect(result.errors).toHaveLength(10);
  });
  it("stops queued bulk work on cancellation and returns every unresolved item", async () => {
    const caller = new AbortController();
    const spy = vi.spyOn(hf, "approveRequest").mockImplementation(async (_repo, _user, options) => {
      await new Promise((_, reject) => options!.signal!.addEventListener("abort", () => reject(options!.signal!.reason), { once: true }));
    });
    const result = executeBulkApprove(Array.from({ length: 100 }, (_, i) => ({ repo: repos[0], username: `synthetic-${i}` })), 5, { signal: caller.signal });
    caller.abort();
    expect(await result).toMatchObject({ succeeded: 0, failed: 100 });
    expect(spy).toHaveBeenCalledTimes(5);
  });
});
