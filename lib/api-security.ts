import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifyTokenWithSecrets } from "./session-key";
import { validateMutationOrigin } from "./csrf";

export async function authorizeApiRequest(request: NextRequest, mutation = false) {
  const valid = await verifyTokenWithSecrets(request.cookies.get(SESSION_COOKIE_NAME)?.value || "",
    process.env.AUTH_SECRET || "", process.env.APP_PASSWORD || "");
  if (!valid) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } },
    { status: 401, headers: { "Cache-Control": "private, no-store" } });
  if (mutation && !validateMutationOrigin(request)) {
    return NextResponse.json({ error: { code: "CSRF_ERROR", message: "Invalid request origin" } }, { status: 403 });
  }
  return null;
}

export async function readJsonRequest(request: NextRequest, maxBytes = 64_000): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw Object.assign(new Error("JSON request body is required"), { statusCode: 400, code: "INVALID_JSON" });
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  const deadline = AbortSignal.timeout(10_000);
  const signal = AbortSignal.any([request.signal, deadline]);
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(Object.assign(new Error("Request body timed out or was cancelled"), { statusCode: 408, code: "BODY_TIMEOUT" }));
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw Object.assign(new Error("Request body is too large"), { statusCode: 413, code: "BODY_TOO_LARGE" });
      text += decoder.decode(value, { stream: true });
    }
    try { return JSON.parse(text + decoder.decode()); }
    catch { throw Object.assign(new Error("Invalid JSON request body"), { statusCode: 400, code: "INVALID_JSON" }); }
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
