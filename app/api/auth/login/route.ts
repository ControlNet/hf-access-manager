import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSessionToken, getSessionCookieOptions, verifyPassword } from "@/lib/auth";
import { getEnv } from "@/lib/env";

const loginSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
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
    const message = err instanceof Error ? err.message : "Authentication error";
    return NextResponse.json(
      {
        error: {
          code: "SERVER_ERROR",
          message,
        },
      },
      { status: 500 }
    );
  }
}
