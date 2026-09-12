import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { approveRequest } from "@/lib/huggingface";
import { executeBulkApprove } from "@/lib/access";
import { findManagedRepo } from "@/lib/repositories";
import { bulkMutationSchema, singleMutationSchema } from "@/lib/validations";
import { validateMutationOrigin } from "@/lib/csrf";

export async function POST(request: NextRequest) {
  if (!validateMutationOrigin(request)) {
    return NextResponse.json(
      { error: { code: "CSRF_ERROR", message: "Invalid request origin" } },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { hfRepositories } = getEnv();

    // Check if bulk mutation
    if (body && Array.isArray(body.items)) {
      const parsedBulk = bulkMutationSchema.safeParse(body);
      if (!parsedBulk.success) {
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: parsedBulk.error.errors[0]?.message || "Invalid bulk payload",
            },
          },
          { status: 400 }
        );
      }

      const validatedItems = [];
      for (const item of parsedBulk.data.items) {
        const matched = findManagedRepo(item.repo, hfRepositories);
        if (!matched) {
          return NextResponse.json(
            {
              error: {
                code: "FORBIDDEN_REPOSITORY",
                message: `Repository "${item.repo.type}:${item.repo.repoId}" is not in the configured allowlist.`,
              },
            },
            { status: 403 }
          );
        }
        validatedItems.push({ repo: matched, username: item.username });
      }

      const result = await executeBulkApprove(validatedItems);
      return NextResponse.json({ data: result });
    }

    // Single mutation
    const parsed = singleMutationSchema.safeParse(body);
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

    await approveRequest(matchedRepo, username);

    return NextResponse.json({
      data: {
        success: true,
        message: `Access approved for @${username}`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to approve access request";
    const statusCode = (err as { statusCode?: number }).statusCode || 500;
    const code = (err as { code?: string }).code || "APPROVE_FAILED";

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
