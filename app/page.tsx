import { getEnv } from "@/lib/env";
import { DashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const { hfRepositories } = getEnv();

  // Strip anything except type and repoId to ensure zero leak of internal configs
  const safeRepos = hfRepositories.map((r) => ({
    type: r.type,
    repoId: r.repoId,
  }));

  return <DashboardClient configuredRepositories={safeRepos} />;
}
