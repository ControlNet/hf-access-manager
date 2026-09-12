"use client";

import * as React from "react";
import { ManagedRepository } from "@/lib/types";
import { Navbar } from "@/components/navbar";
import { AccessRequestList } from "@/components/access-request-list";

interface DashboardClientProps {
  configuredRepositories: ManagedRepository[];
}

export function DashboardClient({ configuredRepositories }: DashboardClientProps) {
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = React.useState<Date | null>(new Date());

  const handleRefresh = React.useCallback(() => {
    setIsRefreshing(true);
    setRefreshKey((k) => k + 1);
    setLastRefreshedAt(new Date());
    setTimeout(() => {
      setIsRefreshing(false);
    }, 600);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        lastRefreshedAt={lastRefreshedAt}
      />

      <main className="flex-1 container max-w-7xl px-4 sm:px-8 py-6">
        <AccessRequestList
          key={refreshKey}
          configuredRepositories={configuredRepositories}
        />
      </main>

      <footer className="border-t py-4 text-center text-xs text-muted-foreground">
        <div className="container max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>hf-access-manager · Delegated Gated Repository Access</span>
          <span className="text-[11px]">
            {configuredRepositories.length} {configuredRepositories.length === 1 ? "repository" : "repositories"} configured
          </span>
        </div>
      </footer>
    </div>
  );
}
