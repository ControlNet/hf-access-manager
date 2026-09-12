import { getEnv } from "@/lib/env";
import { aggregateRepositoriesStatus } from "@/lib/access";
import { RepositoriesClient } from "./repositories-client";

export const dynamic = "force-dynamic";

export default async function RepositoriesPage() {
  const { hfRepositories } = getEnv();
  const initialStatuses = await aggregateRepositoriesStatus(hfRepositories);

  return <RepositoriesClient initialStatuses={initialStatuses} />;
}
