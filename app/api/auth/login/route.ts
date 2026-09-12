import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSessionToken, getSessionCookieOptions, verifyPassword } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { readJsonRequest } from "@/lib/api-security";
import { validateMutationOrigin } from "@/lib/csrf";

const loginSchema = z.object({
  password: z.string().min(1, "Password is required").max(1024, "Password is too long"),
});

export async function POST(request: NextRequest) {
  if (!validateMutationOrigin(request)) return NextResponse.json({ error: { code: "CSRF_ERROR", message: "Invalid request origin" } }, { status: 403 });
  try {
    const body = await readJsonRequest(request, 8192);
    const parseResult = loginSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parseResult.error.errors[0]?.message || "Invalid request payload",
          },
        },
        { status: 400 }
      );
    }

    const { appPassword } = getEnv();
    const isMatch = verifyPassword(parseResult.data.password, appPassword);

    if (!isMatch) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Incorrect password. Please try again.",
          },
        },
        { status: 401 }
      );
    }

    const token = await createSessionToken();
    const cookieOptions = getSessionCookieOptions();

    const response = NextResponse.json({ success: true });
    response.cookies.set({
      name: cookieOptions.name,
      value: token,
      httpOnly: cookieOptions.httpOnly,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
      path: cookieOptions.path,
      maxAge: cookieOptions.maxAge,
    });

    return response;
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode || 500;
    const message = status < 500 && err instanceof Error ? err.message : "Authentication configuration error. Contact the administrator.";
    return NextResponse.json(
      {
        error: {
          code: "SERVER_ERROR",
          message,
        },
      },
      { status }
    );
  }
}
