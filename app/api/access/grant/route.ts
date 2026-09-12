import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { grantAccess } from "@/lib/huggingface";
import { findManagedRepo } from "@/lib/repositories";
import { grantAccessSchema } from "@/lib/validations";
import { authorizeApiRequest, readJsonRequest } from "@/lib/api-security";

export async function POST(request: NextRequest) {
  const denied = await authorizeApiRequest(request, true);
  if (denied) return denied;

  try {
    const body = await readJsonRequest(request);
    const { hfRepositories } = getEnv();

    const parsed = grantAccessSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.errors[0]?.message || "Invalid payload",
          },
        },
        { status: 400 }
      );
    }

    const { repo, username } = parsed.data;

    const matchedRepo = findManagedRepo(repo, hfRepositories);
    if (!matchedRepo) {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN_REPOSITORY",
            message: `Repository "${repo.type}:${repo.repoId}" is not in the configured allowlist.`,
          },
        },
        { status: 403 }
      );
    }

    await grantAccess(matchedRepo, username, { signal: request.signal });

    return NextResponse.json({
      data: {
        success: true,
        message: `Access granted to @${username}`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to grant access";
    const statusCode = (err as { statusCode?: number }).statusCode || 500;
    const code = (err as { code?: string }).code || "GRANT_FAILED";

    return NextResponse.json(
      {
        error: {
          code,
          message,
        },
      },
      { status: statusCode }
    );
  }
}
