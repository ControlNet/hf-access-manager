"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, RefreshCw, ShieldCheck, Database, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { toast } from "sonner";

interface NavbarProps {
  onRefresh?: () => void;
  isRefreshing?: boolean;
  lastRefreshedAt?: Date | null;
}

export function Navbar({ onRefresh, isRefreshing = false, lastRefreshedAt }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = React.useState(false);

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      const res = await fetch("/api/auth/logout", {
        method: "POST",
      });
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
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 max-w-7xl items-center justify-between px-4 sm:px-8">
        <div className="flex items-center space-x-6">
          <Link href="/" className="flex items-center space-x-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground font-mono text-xs font-bold">
              HF
            </div>
            <span className="font-semibold tracking-tight text-foreground text-sm sm:text-base">
              HF Access Manager
            </span>
          </Link>

          <nav className="flex items-center space-x-1 sm:space-x-2 text-sm font-medium">
            <Link
              href="/"
              className={`flex items-center space-x-1.5 rounded-md px-2.5 py-1.5 transition-colors ${
                pathname === "/"
                  ? "bg-secondary text-foreground font-semibold"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              }`}
            >
              <Inbox className="h-4 w-4" />
              <span>Requests</span>
            </Link>

            <Link
              href="/repositories"
              className={`flex items-center space-x-1.5 rounded-md px-2.5 py-1.5 transition-colors ${
                pathname === "/repositories"
                  ? "bg-secondary text-foreground font-semibold"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              }`}
            >
              <Database className="h-4 w-4" />
              <span>Repositories</span>
            </Link>
          </nav>
        </div>

        <div className="flex items-center space-x-2">
          {onRefresh && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="h-8 gap-1.5 text-xs"
              title={
                lastRefreshedAt
                  ? `Last refreshed: ${lastRefreshedAt.toLocaleTimeString()}`
                  : "Refresh requests"
              }
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
              />
              <span className="hidden sm:inline">
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </span>
            </Button>
          )}

          <ThemeToggle />

          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            disabled={loggingOut}
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden md:inline">Sign out</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
