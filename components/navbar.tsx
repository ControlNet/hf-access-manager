"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { GitHubLink } from "@/components/github-link";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface NavbarProps {
  onRefresh?: () => void;
  isRefreshing?: boolean;
  lastRefreshedAt?: Date | null;
}

const NAV = [
  { href: "/", label: "Requests" },
  { href: "/repositories", label: "Repositories" },
] as const;

export function Navbar({ onRefresh, isRefreshing = false, lastRefreshedAt }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = React.useState(false);

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) {
        toast.success("Signed out successfully");
        router.push("/login");
        router.refresh();
      } else {
        toast.error("Failed to log out");
      }
    } catch {
      toast.error("Network error during log out");
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-muted/95 backdrop-blur supports-[backdrop-filter]:bg-muted/80">
      <div className="mx-auto flex h-[52px] max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-4 sm:gap-7">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <ShieldCheck className="h-[18px] w-[18px] text-primary" strokeWidth={1.5} />
            <span className="text-[13.5px] font-semibold -tracking-[0.01em] text-foreground">
              Access Manager
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={pathname === item.href ? "page" : undefined}
                className={cn(
                  "flex h-7 items-center rounded-md px-2.5 text-[12.5px] transition-colors",
                  pathname === item.href
                    ? "bg-accent font-semibold text-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden font-mono text-[11px] text-label tabular sm:inline">
            {lastRefreshedAt
              ? `synced ${lastRefreshedAt.toLocaleTimeString(undefined, { hour12: false })}`
              : "not synced yet"}
          </span>

          <div className="flex items-center gap-0.5">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                title={isRefreshing ? "Refreshing requests" : "Refresh requests"}
                aria-label="Refresh"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-input text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} strokeWidth={1.6} />
              </button>
            )}

            <GitHubLink />

            <ThemeToggle />

            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              title="Sign out"
              aria-label="Sign out"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={1.6} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
