"use client";

import * as React from "react";
import { ManagedRepository } from "@/lib/types";
import { Navbar } from "@/components/navbar";
import { AccessRequestList } from "@/components/access-request-list";

interface DashboardClientProps {
  configuredRepositories: ManagedRepository[];
}

export function DashboardClient({ configuredRepositories }: DashboardClientProps) {
  const [refreshTrigger, setRefreshTrigger] = React.useState(0);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = React.useState<Date | null>(null);

  const handleRefresh = React.useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        lastRefreshedAt={lastRefreshedAt}
      />

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-5 sm:px-6">
        <AccessRequestList
          configuredRepositories={configuredRepositories}
          refreshTrigger={refreshTrigger}
          onRefreshChange={setIsRefreshing}
          onRefreshed={setLastRefreshedAt}
        />
      </main>

      <footer className="border-t">
        <div className="mx-auto flex h-10 w-full max-w-[1440px] flex-col items-center justify-between gap-1 px-4 font-mono text-[11px] text-label sm:h-10 sm:flex-row sm:px-6">
          <span>hf-access-manager · stateless · the Hub stays the source of truth</span>
          <span>
            {configuredRepositories.length}{" "}
            {configuredRepositories.length === 1 ? "repository" : "repositories"} configured
          </span>
        </div>
      </footer>
    </div>
  );
}
