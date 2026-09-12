// @vitest-environment jsdom
import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Navbar } from "@/components/navbar";
import { GITHUB_URL } from "@/components/github-link";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next-themes", () => ({ useTheme: () => ({ setTheme: vi.fn(), resolvedTheme: "light" }) }));

afterEach(cleanup);

it("links to the project source, opened safely in a new tab", () => {
  render(<Navbar />);
  const link = screen.getByRole("link", { name: "Source on GitHub" }) as HTMLAnchorElement;
  expect(link.getAttribute("href")).toBe("https://github.com/ControlNet/hf-access-manager");
  expect(link.getAttribute("href")).toBe(GITHUB_URL);
  expect(link.getAttribute("target")).toBe("_blank");
  // Without noreferrer the opened tab can reach back through window.opener.
  expect(link.getAttribute("rel")).toContain("noreferrer");
  expect(link.getAttribute("rel")).toContain("noopener");
});

it("marks the active section for assistive tech", () => {
  render(<Navbar />);
  expect(screen.getByRole("link", { name: "Requests" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "Repositories" }).getAttribute("aria-current")).toBeNull();
});
