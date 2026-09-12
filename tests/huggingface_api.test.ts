import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getPendingRequests,
  approveRequest,
  rejectRequest,
  revokeRequest,
  grantAccess,
  checkRepositoryStatus,
  HfApiError,
} from "@/lib/huggingface";
import { ManagedRepository } from "@/lib/types";
import { resetEnvCache } from "@/lib/env";

describe("lib/huggingface network operations (mocked)", () => {
  const originalEnv = process.env;
  const modelRepo: ManagedRepository = {
    type: "model",
    repoId: "meta-llama/Llama-2-7b",
  };
  const spaceRepo: ManagedRepository = {
    type: "space",
    repoId: "owner/example-space",
  };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      HF_TOKEN: "hf_mock_token_12345",
      HF_REPOSITORIES: "model:meta-llama/Llama-2-7b,space:owner/example-space",
      APP_PASSWORD: "test-password",
      AUTH_SECRET: "1234567890123456789012345678901234567890",
    };
    resetEnvCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetEnvCache();
  });

  it("handles pagination via Link header in listAccessRequests", async () => {
    const page1Data = [
      {
        user: { user: "alice", fullname: "Alice", email: "alice@test.com" },
        status: "pending",
        timestamp: "2026-09-12T10:00:00Z",
      },
    ];
    const page2Data = [
      {
        user: { user: "bob", fullname: "Bob", email: "bob@test.com" },
        status: "pending",
        timestamp: "2026-09-12T09:00:00Z",
      },
    ];

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(page1Data), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            Link: '<https://huggingface.co/api/models/meta-llama/Llama-2-7b/user-access-request/pending?page=2>; rel="next"',
          },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(page2Data), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        })
      );

    vi.stubGlobal("fetch", mockFetch);

    const requests = await getPendingRequests(modelRepo);

    expect(requests).toHaveLength(2);
    expect(requests[0].username).toBe("alice");
    expect(requests[1].username).toBe("bob");
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const firstCallHeaders = mockFetch.mock.calls[0][1].headers;
    expect(firstCallHeaders.Authorization).toBe("Bearer hf_mock_token_12345");
  });

  it("approves access request with status accepted", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", mockFetch);

    await approveRequest(modelRepo, "alice");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://huggingface.co/api/models/meta-llama/Llama-2-7b/user-access-request/handle");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      user: "alice",
      status: "accepted",
    });
  });

  it("rejects access request with status rejected and no reason requirement", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", mockFetch);

    await rejectRequest(modelRepo, "bob");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://huggingface.co/api/models/meta-llama/Llama-2-7b/user-access-request/handle");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      user: "bob",
      status: "rejected",
    });
  });

  it("revokes access by resetting status to pending", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", mockFetch);

    await revokeRequest(modelRepo, "alice");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://huggingface.co/api/models/meta-llama/Llama-2-7b/user-access-request/handle");
    expect(JSON.parse(init.body as string)).toEqual({
      user: "alice",
      status: "pending",
    });
  });

  it("grants access directly via grant endpoint", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", mockFetch);

    await grantAccess(modelRepo, "charlie");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://huggingface.co/api/models/meta-llama/Llama-2-7b/user-access-request/grant");
    expect(JSON.parse(init.body as string)).toEqual({
      user: "charlie",
    });
  });

  it("gracefully marks Space repositories as unsupported", async () => {
    const status = await checkRepositoryStatus(spaceRepo);

    expect(status.status).toBe("unsupported");
    expect(status.message).toContain("not supported for Spaces");
  });

  it("throws mapped HfApiError on 403 Forbidden with clear message", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Unauthorized access" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", mockFetch);

    await expect(approveRequest(modelRepo, "alice")).rejects.toThrow(
      "Insufficient permissions for repository meta-llama/Llama-2-7b"
    );
  });
});
