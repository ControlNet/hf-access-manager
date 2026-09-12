import { NextRequest, NextResponse } from "next/server";
import { authorizeApiRequest } from "@/lib/api-security";
import { SESSION_COOKIE_NAME } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const denied = await authorizeApiRequest(request, true);
  if (denied) return denied;
  const response = NextResponse.json({ success: true });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
