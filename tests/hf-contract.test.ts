import { afterEach, describe, expect, it, vi } from "vitest";
import { approveRequest, rejectRequest, revokeRequest, grantAccess, listAccessRequests } from "@/lib/huggingface";

// Synthetic transport fixtures validate the client's wire format, not live Hub permissions.
afterEach(() => vi.unstubAllGlobals());
describe.each(["model", "dataset"] as const)("%s access contract", type => {
  const repo = { type, repoId: "review/synthetic" };
  it.each([
    [approveRequest, "handle", "accepted"],
    [rejectRequest, "handle", "rejected"],
    [revokeRequest, "handle", "pending"],
    [grantAccess, "grant", undefined],
  ] as const)("sends the expected %s mutation body", async (action, endpoint, status) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    await action(repo, "synthetic-user", { tokenOverride: "synthetic-only" });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`https://huggingface.co/api/${type}s/review/synthetic/user-access-request/${endpoint}`);
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("manual");
    expect(JSON.parse(init.body)).toEqual(status ? { user: "synthetic-user", status } : { user: "synthetic-user" });
  });

  it.each([400, 401, 403, 404, 429, 500, 503])("does not normalize HTTP %s into a successful empty list", async status => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Synthetic upstream error" }), { status })));
    await expect(listAccessRequests(repo, "pending", { tokenOverride: "synthetic-only" })).rejects.toMatchObject({ statusCode: status });
  });
});

it("does not send gated operations for Spaces", async () => {
  vi.stubGlobal("fetch", vi.fn());
  const repo = { type: "space" as const, repoId: "review/synthetic" };
  for (const action of [approveRequest, rejectRequest, revokeRequest, grantAccess]) {
    await expect(action(repo, "synthetic-user", { tokenOverride: "synthetic-only" })).rejects.toMatchObject({ code: "HF_UNSUPPORTED_REPO_TYPE" });
  }
  expect(fetch).not.toHaveBeenCalled();
});
