import { afterEach, describe, expect, it, vi } from "vitest";
import { listAccessRequests } from "@/lib/huggingface";

// Synthetic upstream fixtures; these tests never contact Hugging Face.
const repo = { type: "model" as const, repoId: "review/synthetic" };
const endpoint = "https://huggingface.co/api/models/review/synthetic/user-access-request/pending";
const options = { tokenOverride: "synthetic-test-only", timeoutMs: 20 };
const row = { user: { user: "synthetic-user" }, timestamp: "2026-09-12T00:00:00Z" };
afterEach(() => vi.unstubAllGlobals());

describe("upstream credential and response boundaries", () => {
  it.each([
    "https://outside.invalid/collect", "http://huggingface.co/api/models/review/synthetic/user-access-request/pending",
    "https://huggingface.co/api/models/outside/repo/user-access-request/pending",
    "https://huggingface.co/api/models/review/synthetic/user-access-request/accepted",
  ])("rejects pagination outside the original endpoint: %s", async (next) => {
    const fetcher = vi.fn().mockResolvedValue(new Response("[]", { headers: { link: `<${next}>; rel="next"` } }));
    vi.stubGlobal("fetch", fetcher);
    await expect(listAccessRequests(repo, "pending", options)).rejects.toMatchObject({ code: "HF_INVALID_PAGINATION" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not follow redirects with credentials", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://outside.invalid" } }));
    vi.stubGlobal("fetch", fetcher);
    await expect(listAccessRequests(repo, "pending", options)).rejects.toMatchObject({ code: "HF_REDIRECT" });
    expect(fetcher.mock.calls[0][1].redirect).toBe("manual");
  });

  it.each([{}, [{ user: {} }], [null]])("rejects malformed successful JSON", async (data) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(data))));
    await expect(listAccessRequests(repo, "pending", options)).rejects.toMatchObject({ code: "HF_INVALID_RESPONSE" });
  });

  it("rejects pagination cycles", async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify([row]), { headers: { link: `<${endpoint}>; rel="next"` } }));
    vi.stubGlobal("fetch", fetcher);
    await expect(listAccessRequests(repo, "pending", options)).rejects.toMatchObject({ code: "HF_INVALID_PAGINATION" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("deduplicates overlapping pages and excludes unselected upstream attributes", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ ...row, internalAttribute: "synthetic" }]), { headers: { link: `<${endpoint}?cursor=next>; title="page"; rel="next"` } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([row])));
    vi.stubGlobal("fetch", fetcher);
    const result = await listAccessRequests(repo, "pending", options);
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]).not.toHaveProperty("raw");
    expect(JSON.stringify(result)).not.toContain("internalAttribute");
  });

  it("times out a stalled response body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({ start() {} }))));
    await expect(listAccessRequests(repo, "pending", options)).rejects.toMatchObject({ code: "HF_TIMEOUT" });
  });

  it("propagates caller cancellation through body consumption", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
      queueMicrotask(() => controller.abort());
      return new Response(new ReadableStream({ start() {} }));
    }));
    await expect(listAccessRequests(repo, "pending", { ...options, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});
