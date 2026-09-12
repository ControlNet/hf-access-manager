import { getEnv } from "@/lib/env";
import { DashboardClient } from "./dashboard-client";
import { requirePageSession } from "@/lib/page-auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await requirePageSession();
  const { hfRepositories } = getEnv();

  // Strip anything except type and repoId to ensure zero leak of internal configs
  const safeRepos = hfRepositories.map((r) => ({
    type: r.type,
    repoId: r.repoId,
  }));

  return <DashboardClient configuredRepositories={safeRepos} />;
}
