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
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1 container max-w-7xl px-4 sm:px-8 py-6">
        <RepositoryStatusList initialStatuses={initialStatuses} />
      </main>

      <footer className="border-t py-4 text-center text-xs text-muted-foreground">
        <div className="container max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>hf-access-manager · Diagnostic Repositories View</span>
          <span className="text-[11px]">Hugging Face source of truth</span>
        </div>
      </footer>
    </div>
  );
}
