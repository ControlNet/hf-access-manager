"use client";

import * as React from "react";
import { UserPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ManagedRepository } from "@/lib/types";
import { toast } from "sonner";

interface GrantAccessDialogProps {
  repositories: ManagedRepository[];
  onGranted: () => void;
}

export function GrantAccessDialog({ repositories, onGranted }: GrantAccessDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [selectedRepoKey, setSelectedRepoKey] = React.useState<string>("");
  const [username, setUsername] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Filter for repositories that support gating (models and datasets)
  const eligibleRepos = React.useMemo(() => {
    return repositories.filter((r) => r.type === "model" || r.type === "dataset");
  }, [repositories]);

  React.useEffect(() => {
    if (eligibleRepos.length > 0 && !selectedRepoKey) {
      setSelectedRepoKey(`${eligibleRepos[0].type}:${eligibleRepos[0].repoId}`);
    }
  }, [eligibleRepos, selectedRepoKey]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedUser = username.trim();
    if (!trimmedUser) {
      setErrorMessage("Please enter a Hugging Face username.");
      return;
    }

    const matchedRepo = eligibleRepos.find(
      (r) => `${r.type}:${r.repoId}` === selectedRepoKey
    );

    if (!matchedRepo) {
      setErrorMessage("Please select a valid repository.");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch("/api/access/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: matchedRepo,
          username: trimmedUser,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to grant access");
      }

      toast.success(`Access granted to @${trimmedUser}`);
      setUsername("");
      setOpen(false);
      onGranted();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error granting access";
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5 font-medium shadow-sm">
          <UserPlus className="h-4 w-4" />
          <span>Grant Access</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Grant Repository Access</DialogTitle>
            <DialogDescription>
              Directly grant gated repository access to a Hugging Face user without requiring a prior request.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {errorMessage && (
              <div className="rounded-md bg-destructive/10 p-3 text-xs text-destructive border border-destructive/20">
                {errorMessage}
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="repository-select" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Repository
              </label>
              <select
                id="repository-select"
                value={selectedRepoKey}
                onChange={(e) => setSelectedRepoKey(e.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {eligibleRepos.map((repo) => (
                  <option
                    key={`${repo.type}:${repo.repoId}`}
                    value={`${repo.type}:${repo.repoId}`}
                  >
                    [{repo.type.toUpperCase()}] {repo.repoId}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="hf-username" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Hugging Face Username
              </label>
              <Input
                id="hf-username"
                placeholder="e.g. alice-ai"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isSubmitting}
                autoFocus
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !username.trim()}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Granting...
                </>
              ) : (
                "Grant"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
