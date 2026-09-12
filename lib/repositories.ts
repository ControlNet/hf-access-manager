import { ManagedRepository, RepoType } from "./types";

export const VALID_REPO_TYPES: readonly RepoType[] = ["model", "dataset", "space"] as const;

export function isValidRepoType(type: string): type is RepoType {
  return (VALID_REPO_TYPES as readonly string[]).includes(type);
}

/**
 * Returns canonical key for a repository: `<repoType>:<repoId>` in lowercase repoId
 */
export function canonicalRepoKey(repo: ManagedRepository | { type: string; repoId: string }): string {
  return `${repo.type.trim().toLowerCase()}:${repo.repoId.trim()}`;
}

/**
 * Parses HF_REPOSITORIES environment variable into an array of ManagedRepository objects.
 * Format: `<repo-type>:<owner>/<repo-name>`, separated by commas.
 * Example: `model:meta-llama/Llama-2-7b,dataset:VL4AI/SpatialBench`
 */
export function parseRepositories(rawInput: string | undefined | null): ManagedRepository[] {
  if (!rawInput || typeof rawInput !== "string") {
    throw new Error("HF_REPOSITORIES environment variable is empty or not defined.");
  }

  const entries = rawInput
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (entries.length === 0) {
    throw new Error("HF_REPOSITORIES must contain at least one repository entry.");
  }

  const seenKeys = new Set<string>();
  const repositories: ManagedRepository[] = [];

  for (const entry of entries) {
    const colonIndex = entry.indexOf(":");
    if (colonIndex <= 0 || colonIndex === entry.length - 1) {
      throw new Error(
        `Invalid repository format "${entry}". Expected syntax: <repo-type>:<owner>/<repo-name> (e.g. model:meta-llama/Llama-2-7b)`
      );
    }

    const type = entry.substring(0, colonIndex).trim().toLowerCase();
    const repoId = entry.substring(colonIndex + 1).trim();

    if (!isValidRepoType(type)) {
      throw new Error(
        `Invalid repository type "${type}" in "${entry}". Supported types are: ${VALID_REPO_TYPES.join(", ")}`
      );
    }

    // Validate owner/repo pattern.
    // Hugging Face repoIds are either "owner/repo" or sometimes single name "repo" for root models/datasets.
    // However, gated repos are virtually always owner/name or name. Let's allow standard chars.
    const repoIdPattern = /^[a-zA-Z0-9-._]+(\/[a-zA-Z0-9-._]+)?$/;
    if (!repoIdPattern.test(repoId)) {
      throw new Error(
        `Invalid repository identifier "${repoId}" in "${entry}". Must be in format <owner>/<repo-name> or <repo-name>.`
      );
    }

    const key = canonicalRepoKey({ type, repoId });
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      repositories.push({
        type: type as RepoType,
        repoId,
      });
    }
  }

  return repositories;
}

/**
 * Checks if a given repository is present in the allowed list of managed repositories.
 */
export function isRepoAllowed(
  candidate: { type: string; repoId: string },
  allowedRepos: ManagedRepository[]
): boolean {
  const candidateKey = canonicalRepoKey(candidate);
  return allowedRepos.some((repo) => canonicalRepoKey(repo) === candidateKey);
}

/**
 * Finds and returns the matching ManagedRepository from the allowed list, or undefined.
 */
export function findManagedRepo(
  candidate: { type: string; repoId: string },
  allowedRepos: ManagedRepository[]
): ManagedRepository | undefined {
  const candidateKey = canonicalRepoKey(candidate);
  return allowedRepos.find((repo) => canonicalRepoKey(repo) === candidateKey);
}
