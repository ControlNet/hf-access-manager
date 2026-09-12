import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { aggregateRequests } from "@/lib/access";
import { RequestStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status") || "pending";

    const validStatuses: RequestStatus[] = ["pending", "accepted", "rejected"];
    const status: RequestStatus = validStatuses.includes(statusParam as RequestStatus)
      ? (statusParam as RequestStatus)
      : "pending";

    const { hfRepositories } = getEnv();
    const result = await aggregateRequests(hfRepositories, status);

    return NextResponse.json({
      data: result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch access requests";
    return NextResponse.json(
      {
        error: {
          code: "REQUEST_FETCH_FAILED",
          message,
        },
      },
      { status: 500 }
    );
  }
}
