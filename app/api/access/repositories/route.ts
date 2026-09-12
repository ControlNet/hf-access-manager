import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { aggregateRepositoriesStatus } from "@/lib/access";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { hfRepositories } = getEnv();
    const statuses = await aggregateRepositoriesStatus(hfRepositories);

    return NextResponse.json({
      data: statuses,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch repositories";
    return NextResponse.json(
      {
        error: {
          code: "REPOSITORIES_FETCH_FAILED",
          message,
        },
      },
      { status: 500 }
    );
  }
}
