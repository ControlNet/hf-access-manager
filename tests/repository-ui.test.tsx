// @vitest-environment jsdom
import * as React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RepositoryStatusList } from "@/components/repository-status";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("does not present a failed health fetch as no configured repositories and permits retry", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("Synthetic outage"))
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ repository: { type: "model", repoId: "review/synthetic" }, status: "connected", pendingCount: 0 }] }))));
  render(<RepositoryStatusList />);
  await screen.findByRole("alert");
  expect(screen.queryByText("No repositories configured in HF_REPOSITORIES.")).toBeNull();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Recheck Health" })));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByText("Connected")).toBeTruthy();
});

it("aborts its active health read on unmount", async () => {
  let signal: AbortSignal | undefined;
  vi.stubGlobal("fetch", vi.fn().mockImplementation((_url, init) => {
    signal = init.signal;
    return new Promise((_, reject) => signal!.addEventListener("abort", () => reject(signal!.reason), { once: true }));
  }));
  const view = render(<RepositoryStatusList />);
  await act(async () => view.unmount());
  expect(signal?.aborted).toBe(true);
});
