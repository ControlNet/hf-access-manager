import { getEnv } from "@/lib/env";
import { aggregateRepositoriesStatus } from "@/lib/access";
import { RepositoriesClient } from "./repositories-client";
import { requirePageSession } from "@/lib/page-auth";

export const dynamic = "force-dynamic";

export default async function RepositoriesPage() {
  await requirePageSession();
  const { hfRepositories } = getEnv();
  const initialStatuses = await aggregateRepositoriesStatus(hfRepositories);

  return <RepositoriesClient initialStatuses={initialStatuses} />;
}
