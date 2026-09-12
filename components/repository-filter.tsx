"use client";

import * as React from "react";
import { Search, X, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
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
  // Extract distinct configured repo types
  const configuredTypes = React.useMemo(() => {
    const types = new Set<RepoType>();
    for (const r of configuredRepositories) {
      types.add(r.type);
    }
    return Array.from(types);
  }, [configuredRepositories]);

  // Filter repo options based on currently selected repo type
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
    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
      {/* Search Input */}
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search name, username, email, form fields..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-8 h-9 text-xs sm:text-sm bg-background"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange("")}
            className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Dropdown Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Repo Type Filter */}
        <div className="flex items-center">
          <select
            value={selectedType}
            onChange={(e) => {
              onTypeChange(e.target.value);
              // Reset repo filter if current repo is of different type
              if (e.target.value !== "all" && selectedRepoKey !== "all") {
                const currentRepo = configuredRepositories.find(
                  (r) => `${r.type}:${r.repoId}` === selectedRepoKey
                );
                if (currentRepo && currentRepo.type !== e.target.value) {
                  onRepoKeyChange("all");
                }
              }
            }}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-xs sm:text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Filter by repository type"
          >
            <option value="all">All types</option>
            {configuredTypes.map((type) => (
              <option key={type} value={type}>
                {type === "model"
                  ? "Models"
                  : type === "dataset"
                  ? "Datasets"
                  : type === "space"
                  ? "Spaces"
                  : type}
              </option>
            ))}
          </select>
        </div>

        {/* Specific Repository Filter */}
        <div className="flex items-center">
          <select
            value={selectedRepoKey}
            onChange={(e) => onRepoKeyChange(e.target.value)}
            className="h-9 max-w-[260px] truncate rounded-md border border-input bg-background px-3 py-1 text-xs sm:text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
        </div>

        {/* Clear Filters Button */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 transition-colors"
            title="Reset all filters"
          >
            <X className="h-3.5 w-3.5" />
            <span>Clear</span>
          </button>
        )}
      </div>
    </div>
  );
}
