"use client";

import * as React from "react";
import { Navbar } from "@/components/navbar";
import { RepositoryStatusList } from "@/components/repository-status";
import { RepositoryStatus } from "@/lib/types";

interface RepositoriesClientProps {
  initialStatuses: RepositoryStatus[];
}

export function RepositoriesClient({ initialStatuses }: RepositoriesClientProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-5 sm:px-6">
        <RepositoryStatusList initialStatuses={initialStatuses} />
      </main>

      <footer className="border-t">
        <div className="mx-auto flex h-10 w-full max-w-[1440px] flex-col items-center justify-between gap-1 px-4 font-mono text-[11px] text-label sm:flex-row sm:px-6">
          <span>hf-access-manager · stateless · the Hub stays the source of truth</span>
          <span>{initialStatuses.length} {initialStatuses.length === 1 ? "repository" : "repositories"} configured</span>
        </div>
      </footer>
    </div>
  );
}
