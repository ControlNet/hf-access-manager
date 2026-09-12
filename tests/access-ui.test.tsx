// @vitest-environment jsdom
import * as React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccessRequestList } from "@/components/access-request-list";
import { RequestStatus } from "@/lib/types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
// Synthetic fixtures only. No upstream requests or real applicant data are used.
const repo = { type: "model" as const, repoId: "review/synthetic" };
const row = (status: RequestStatus = "pending", username = "synthetic-user") => ({
  id: `model:review/synthetic:${username}`, username, status, repository: repo, fields: { Purpose: "Synthetic test" },
});
const response = (status: RequestStatus = "pending", options: { more?: boolean; empty?: boolean; errors?: boolean; many?: number } = {}) => new Response(JSON.stringify({ data: {
  requests: options.empty ? [] : Array.from({ length: options.many || 1 }, (_, i) => row(status, options.many ? `synthetic-user-${i}` : "synthetic-user")),
  errors: options.errors ? [{ repo, error: "Synthetic upstream outage" }] : [],
  totalRepos: 1, successfulRepos: options.errors ? 0 : 1,
  hasMore: !!options.more, truncated: !!options.more,
  repositoryPagination: options.errors ? {} : { "model:review/synthetic": { hasMore: !!options.more, truncated: !!options.more } },
} }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const setup = (status: RequestStatus = "pending", onRefreshed = vi.fn()) => render(<AccessRequestList configuredRepositories={[repo]} initialStatus={status} onRefreshed={onRefreshed} />);
const switchTab = (name: string) => fireEvent.mouseDown(screen.getByRole("tab", { name: new RegExp(`^${name}`) }), { button: 0, ctrlKey: false });

describe("real dashboard integration", () => {
  it.each(["search", "repository", "type"])("drops hidden selections after changing the %s filter", async filter => {
    const other = { type: "dataset" as const, repoId: "review/other" };
    const hidden = row("pending", "synthetic-hidden");
    const visible = { ...row("pending", "synthetic-visible"), id: "dataset:review/other:synthetic-visible", repository: other };
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ data: {
      requests: [hidden, visible], errors: [], hasMore: false, truncated: false,
      repositoryPagination: { "model:review/synthetic": {}, "dataset:review/other": {} },
    } })));
    vi.stubGlobal("fetch", fetcher);
    render(<AccessRequestList configuredRepositories={[repo, other]} />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Select synthetic-hidden" }));

    const control = filter === "search"
      ? screen.getByRole("searchbox")
      : screen.getByRole("combobox", { name: filter === "repository" ? "Filter by repository" : "Filter by repository type" });
    fireEvent.change(control, { target: { value: filter === "search" ? "synthetic-visible" : filter === "repository" ? "dataset:review/other" : "dataset" } });

    expect(screen.queryByText("@synthetic-hidden")).toBeNull();
    expect(screen.getByText("@synthetic-visible")).toBeTruthy();
    expect(screen.queryAllByRole("button", { name: /^(Approve|Reject) \d/ })).toHaveLength(0);
    expect(fetcher.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);

    fireEvent.change(control, { target: { value: filter === "search" ? "" : "all" } });
    expect(screen.getByRole("checkbox", { name: "Select synthetic-hidden" }).getAttribute("data-state")).toBe("unchecked");
  });

  it.each(["Approve", "Reject"])("preserves visible selections and submits only those on bulk %s", async action => {
    const fetcher = vi.fn().mockImplementation(async (_url, init) => init?.method === "POST"
      ? new Response(JSON.stringify({ data: { succeeded: 1, failed: 0, errors: [] } }))
      : response("pending", { many: 2 }));
    vi.stubGlobal("fetch", fetcher);
    setup();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Select synthetic-user-0" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select synthetic-user-1" }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "synthetic-user-1" } });

    expect(screen.getByRole("checkbox", { name: "Select synthetic-user-1" }).getAttribute("data-state")).toBe("checked");
    expect(screen.getByRole("button", { name: "Deselect all" })).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: `${action} 1` })));
    const posts = fetcher.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0][1].body).items).toEqual([{ repo, username: "synthetic-user-1" }]);
  });

  it("leaves no actionable surface for a request reconciliation no longer finds", async () => {
    let posted = false;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_url, init) => {
      if (init?.method === "POST") { posted = true; throw new Error("Synthetic disconnected response"); }
      return response("pending", { empty: posted });
    }));
    setup();
    await screen.findByText("@synthetic-user");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Approve" })));
    // Reconciliation drops the request, so the row and its actions go with it.
    expect(screen.queryByText("@synthetic-user")).toBeNull();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows every answer of an ordinary form on the list, with no second surface", async () => {
    const detailed = {
      ...row(),
      fullName: "Synthetic Reviewer",
      fields: {
        affiliation: "Example University",
        role: "PhD student",
        country: "Australia",
        accepted_license: true,
        intended_use: "Synthetic purpose text that is long enough to be treated as the narrative answer.",
        ethics_approval: "REC-2024-118",
        redistribute: false,
        newsletter: "",
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify({ data: {
      requests: [detailed], errors: [], hasMore: false, truncated: false,
      repositoryPagination: { "model:review/synthetic": {} },
    } }))));
    render(<AccessRequestList configuredRepositories={[repo]} />);

    // Nothing is clicked: every answer the form asked is already on the row.
    await screen.findByText("Example University");
    for (const answer of ["PhD student", "Australia", "REC-2024-118"]) {
      expect(screen.getByText(answer)).toBeTruthy();
    }
    expect(screen.getByText(/Synthetic purpose text/)).toBeTruthy();
    expect(screen.getByText("Newsletter")).toBeTruthy();
    expect(screen.getAllByText("not provided").length).toBeGreaterThan(0);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: /more answers/ })).toBeNull();
  });

  it("puts a twenty-answer form on the row without an expander", async () => {
    const huge = {
      ...row(),
      fields: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`question_${i}`, `answer ${i}`])),
    };
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify({ data: {
      requests: [huge], errors: [], hasMore: false, truncated: false,
      repositoryPagination: { "model:review/synthetic": {} },
    } }))));
    render(<AccessRequestList configuredRepositories={[repo]} />);

    await screen.findByText("answer 0");
    expect(screen.getByText("answer 19")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /more answers|Show full answer/ })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not turn a drained truncated window into inbox zero", async () => {
    let posted = false;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_url, init) => {
      if (init?.method === "POST") { posted = true; return new Response(JSON.stringify({ data: { success: true } })); }
      return response("pending", { more: true, empty: posted });
    }));
    setup();
    await screen.findByText("@synthetic-user");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Approve" })));
    expect(screen.queryByText("Nothing waiting")).toBeNull();
    expect(screen.getByRole("tab", { name: "Pending 0+" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Load more requests" })).toBeTruthy();
  });

  it("preserves pagination and the successful timestamp when Refresh fails", async () => {
    const refreshed = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response("pending", { more: true })).mockRejectedValueOnce(new Error("Synthetic outage")));
    const view = render(<AccessRequestList configuredRepositories={[repo]} refreshTrigger={0} onRefreshed={refreshed} />);
    await screen.findByText("@synthetic-user");
    await act(async () => view.rerender(<AccessRequestList configuredRepositories={[repo]} refreshTrigger={1} onRefreshed={refreshed} />));
    expect(refreshed).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Load more requests" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Approve" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it.each([true, false])("coordinates manual grant and preserves its dialog on failure (success=%s)", async success => {
    let posted = false;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string, init) => {
      if (init?.method === "POST") {
        posted = true;
        return new Response(JSON.stringify(success ? { data: { success: true } } : { error: { message: "Synthetic denial" } }), { status: success ? 200 : 403 });
      }
      return response(url.includes("status=rejected") ? "rejected" : "pending", { empty: posted && success });
    }));
    setup("rejected");
    await screen.findByText("@synthetic-user");
    switchTab("Pending");
    await screen.findByRole("button", { name: "Approve" });
    fireEvent.click(screen.getByRole("button", { name: "Grant Access" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Hugging Face Username"), { target: { value: "synthetic-user" } });
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Grant" })));
    if (success) {
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.getByRole("tab", { name: "Rejected" })).toBeTruthy();
      expect(screen.getByRole("tab", { name: "Accepted" })).toBeTruthy();
      expect(screen.getByRole("tab", { name: "Pending 0" })).toBeTruthy();
    } else {
      expect(within(screen.getByRole("dialog")).getByText(/Grant was not confirmed/)).toBeTruthy();
      expect(screen.getByRole("tab", { name: "Rejected 1", hidden: true })).toBeTruthy();
    }
  });

  it("an aborted read cannot clear the newer read's loading state or replace its rows", async () => {
    let finishA!: (r: Response) => void, finishB!: (r: Response) => void;
    const refreshing = vi.fn();
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { finishA = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { finishB = resolve; })));
    render(<AccessRequestList configuredRepositories={[repo]} onRefreshChange={refreshing} />);
    switchTab("Accepted");
    await act(async () => finishA(response()));
    expect(refreshing.mock.calls.at(-1)?.[0]).toBe(true);
    expect(screen.queryByText("@synthetic-user")).toBeNull();
    await act(async () => finishB(response("accepted")));
    expect(screen.getByRole("button", { name: "Revoke" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(refreshing.mock.calls.at(-1)?.[0]).toBe(false);
  });

  it("preserves search and repository filters across Refresh", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => response()));
    const view = render(<AccessRequestList configuredRepositories={[repo]} refreshTrigger={0} />);
    await screen.findByText("@synthetic-user");
    const search = screen.getByPlaceholderText("Search name, username, email, or any form answer");
    fireEvent.change(search, { target: { value: "synthetic" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by repository" }), { target: { value: "model:review/synthetic" } });
    await act(async () => view.rerender(<AccessRequestList configuredRepositories={[repo]} refreshTrigger={1} />));
    expect((search as HTMLInputElement).value).toBe("synthetic");
    expect((screen.getByRole("combobox", { name: "Filter by repository" }) as HTMLSelectElement).value).toBe("model:review/synthetic");
    expect(screen.getByText("@synthetic-user")).toBeTruthy();
  });

  it("defers external Refresh until mutation completion and counts the transition once", async () => {
    let finish!: (r: Response) => void;
    let posted = false;
    const fetcher = vi.fn().mockImplementation(async (url: string, init) => {
      if (init?.method === "POST") { posted = true; return new Promise(resolve => { finish = resolve; }); }
      return url.includes("status=accepted") ? response("accepted", { empty: true }) : response("pending", { empty: posted });
    });
    vi.stubGlobal("fetch", fetcher);
    const view = render(<AccessRequestList configuredRepositories={[repo]} initialStatus="accepted" refreshTrigger={0} />);
    await screen.findByText("No accepted requests");
    switchTab("Pending");
    await screen.findByText("@synthetic-user");
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    const before = fetcher.mock.calls.length;
    view.rerender(<AccessRequestList configuredRepositories={[repo]} initialStatus="accepted" refreshTrigger={1} />);
    expect(fetcher.mock.calls).toHaveLength(before);
    switchTab("Accepted");
    expect(screen.getByRole("tab", { name: /^Pending/ }).getAttribute("aria-selected")).toBe("true");
    await act(async () => finish(new Response(JSON.stringify({ data: { success: true } }))));
    expect(screen.getByRole("tab", { name: "Accepted 1" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Pending 0" })).toBeTruthy();
    expect(screen.getByText("Nothing waiting")).toBeTruthy();
  });

  it("retains only the failed repository identity for the same username", async () => {
    const other = { type: "dataset" as const, repoId: "review/other" };
    const failed = { ...row(), id: "dataset:review/other:synthetic-user", repository: other };
    let posted = false;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_url, init) => {
      if (init?.method === "POST") {
        posted = true;
        return new Response(JSON.stringify({ data: { succeeded: 1, failed: 1, errors: [{ id: failed.id, error: "Synthetic denial" }] } }));
      }
      return new Response(JSON.stringify({ data: { requests: posted ? [failed] : [row(), failed], errors: [], hasMore: false, truncated: false,
        repositoryPagination: { "model:review/synthetic": {}, "dataset:review/other": {} } } }));
    }));
    render(<AccessRequestList configuredRepositories={[repo, other]} />);
    const boxes = await screen.findAllByRole("checkbox", { name: "Select synthetic-user" });
    boxes.forEach(box => fireEvent.click(box));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Approve 2" })));
    expect(screen.getAllByRole("checkbox", { name: "Select synthetic-user" })).toHaveLength(1);
    expect(screen.getByRole("checkbox", { name: "Select synthetic-user" }).getAttribute("data-state")).toBe("checked");
    expect(screen.getByRole("option", { name: /review\/synthetic \(0\)/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /review\/other \(1\)/ })).toBeTruthy();
  });

  it("does not render previous-tab actions after a failed tab load", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response()).mockRejectedValueOnce(new Error("Synthetic network failure")));
    setup();
    await screen.findByText("@synthetic-user");
    switchTab("Accepted");
    await screen.findByRole("alert");
    expect(screen.queryByText("@synthetic-user")).toBeNull();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("keeps the 100-page attempt retryable until it succeeds", async () => {
    let fail = true;
    const fetcher = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("maxPages=100") && fail) { fail = false; throw new Error("Synthetic load-more failure"); }
      return response("accepted", { more: true });
    });
    vi.stubGlobal("fetch", fetcher);
    setup("accepted");
    await screen.findByText("@synthetic-user");
    for (let i = 0; i < 9; i++) await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Load more requests" })); });
    expect(screen.queryByText(/Display limit reached/)).toBeNull();
    expect(screen.getByRole("button", { name: "Load more requests" })).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Load more requests" })); });
    expect(screen.getByText(/Display limit reached/)).toBeTruthy();
    expect(fetcher.mock.calls.slice(-2).every(([url]) => url.includes("maxPages=100"))).toBe(true);
  });

  it.each([
    ["pending", "Approve"], ["pending", "Reject"], ["accepted", "Revoke"], ["rejected", "Restore"],
  ] as const)("keeps the %s row reviewable in place after %s fails", async (status, action) => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_url, init) => init?.method === "POST"
      ? new Response(JSON.stringify({ error: { message: "Synthetic denial" } }), { status: 403 }) : response(status)));
    setup(status);
    await screen.findByText("@synthetic-user");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: action })); });
    // The request survives the refusal and stays actionable without a second surface.
    expect(screen.getByText("@synthetic-user")).toBeTruthy();
    expect((screen.getByRole("button", { name: action }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not claim inbox zero or refresh success during an upstream outage", async () => {
    const refreshed = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("pending", { empty: true, errors: true })));
    setup("pending", refreshed);
    await screen.findByRole("alert");
    expect(screen.queryByText("Nothing waiting")).toBeNull();
    expect(refreshed).not.toHaveBeenCalled();
  });

  it("records a known zero pending count", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("pending", { empty: true })));
    setup();
    await screen.findByText("Nothing waiting");
    expect(screen.getByRole("option", { name: /review\/synthetic \(0\)/ })).toBeTruthy();
  });

  it("caps Select All at 100 before sending the real bulk payload", async () => {
    let release!: (r: Response) => void;
    const fetcher = vi.fn().mockImplementation(async (_url, init) => init?.method === "POST"
      ? new Promise<Response>(resolve => { release = resolve; }) : response("pending", { many: 101 }));
    vi.stubGlobal("fetch", fetcher);
    setup();
    await screen.findByText("@synthetic-user-0");
    fireEvent.click(screen.getByRole("checkbox", { name: "Select synthetic-user-0" }));
    fireEvent.click(screen.getByRole("button", { name: "Select first 100" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve 100" }));
    const post = fetcher.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(post![1].body).items).toHaveLength(100);
    expect((screen.getAllByRole("button", { name: "Reject" })[0] as HTMLButtonElement).disabled).toBe(true);
    switchTab("Accepted");
    expect(screen.getByRole("tab", { name: /^Pending/ }).getAttribute("aria-selected")).toBe("true");
    await act(async () => release(new Response(JSON.stringify({ data: { succeeded: 100, failed: 0, errors: [] } }))));
    await waitFor(() => expect((screen.getByRole("tab", { name: /^Accepted/ }) as HTMLButtonElement).disabled).toBe(false));
  });
});
