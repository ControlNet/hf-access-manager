"use client";

import * as React from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { ManagedRepository, RepoType } from "@/lib/types";
import { formatRepositoryBadge } from "@/lib/counts";

interface RepositoryFilterProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedRepoKey: string;
  onRepoKeyChange: (repoKey: string) => void;
  selectedType: string;
  onTypeChange: (type: string) => void;
  configuredRepositories: ManagedRepository[];
  repoPendingCounts?: Record<string, number>;
  repoPendingTruncated?: Record<string, boolean>;
  showPendingCounts?: boolean;
}

const SELECT_CLASS =
  "h-8 appearance-none truncate rounded-md border border-input bg-muted pl-3 pr-8 text-xs text-value focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:text-[12.5px]";

export function RepositoryFilter({
  searchQuery,
  onSearchChange,
  selectedRepoKey,
  onRepoKeyChange,
  selectedType,
  onTypeChange,
  configuredRepositories,
  repoPendingCounts = {},
  repoPendingTruncated = {},
  showPendingCounts = true,
}: RepositoryFilterProps) {
  const configuredTypes = React.useMemo(() => {
    const types = new Set<RepoType>();
    for (const r of configuredRepositories) {
      types.add(r.type);
    }
    return Array.from(types);
  }, [configuredRepositories]);

  const availableRepoOptions = React.useMemo(() => {
    if (selectedType === "all") return configuredRepositories;
    return configuredRepositories.filter((r) => r.type === selectedType);
  }, [configuredRepositories, selectedType]);

  const hasActiveFilters = searchQuery !== "" || selectedRepoKey !== "all" || selectedType !== "all";

  const clearFilters = () => {
    onSearchChange("");
    onRepoKeyChange("all");
    onTypeChange("all");
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative min-w-[200px] flex-1">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          strokeWidth={1.6}
        />
        <input
          type="search"
          placeholder="Search name, username, email, or any form answer"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-8 w-full rounded-md border border-input bg-muted pl-8 pr-8 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:text-[12.5px]"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.8} />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <select
            value={selectedType}
            onChange={(e) => {
              onTypeChange(e.target.value);
              if (e.target.value !== "all" && selectedRepoKey !== "all") {
                const currentRepo = configuredRepositories.find(
                  (r) => `${r.type}:${r.repoId}` === selectedRepoKey
                );
                if (currentRepo && currentRepo.type !== e.target.value) {
                  onRepoKeyChange("all");
                }
              }
            }}
            className={SELECT_CLASS}
            aria-label="Filter by repository type"
          >
            <option value="all">All types</option>
            {configuredTypes.map((type) => (
              <option key={type} value={type}>
                {type === "model" ? "Models" : type === "dataset" ? "Datasets" : type === "space" ? "Spaces" : type}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground"
            strokeWidth={1.8}
          />
        </div>

        <div className="relative">
          <select
            value={selectedRepoKey}
            onChange={(e) => onRepoKeyChange(e.target.value)}
            className={`${SELECT_CLASS} max-w-[260px]`}
            aria-label="Filter by repository"
          >
            <option value="all">All repositories</option>
            {availableRepoOptions.map((repo) => {
              const key = `${repo.type}:${repo.repoId}`;
              const countBadge = formatRepositoryBadge(
                repoPendingCounts[key],
                repoPendingTruncated[key],
                showPendingCounts
              );
              return (
                <option key={key} value={key}>
                  [{repo.type.toUpperCase()}] {repo.repoId}
                  {countBadge}
                </option>
              );
            })}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground"
            strokeWidth={1.8}
          />
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="flex items-center gap-1 px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            title="Reset all filters"
          >
            <X className="h-3 w-3" strokeWidth={1.8} />
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
