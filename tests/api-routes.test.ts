import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { createSessionToken } from "@/lib/auth";
import { deriveSessionKey } from "@/lib/session-key";
import { resetEnvCache } from "@/lib/env";
import * as hf from "@/lib/huggingface";
import * as access from "@/lib/access";
import { POST as approve } from "@/app/api/access/approve/route";
import { POST as reject } from "@/app/api/access/reject/route";
import { POST as revoke } from "@/app/api/access/revoke/route";
import { POST as grant } from "@/app/api/access/grant/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as requests } from "@/app/api/access/requests/route";
import { GET as repositories } from "@/app/api/access/repositories/route";

// Synthetic credentials and usernames are confined to this test process.
const repo = { type: "model", repoId: "review/synthetic" };
let cookie: string;
const req = (body?: unknown, headers: Record<string, string> = {}, url = "https://dashboard.example/api/access/approve") => new NextRequest(url, {
  method: body === undefined ? "GET" : "POST",
  headers: { host: "dashboard.example", origin: "https://dashboard.example", cookie, ...headers },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
beforeEach(async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("HF_TOKEN", "synthetic-test-only");
  vi.stubEnv("HF_REPOSITORIES", "model:review/synthetic");
  vi.stubEnv("APP_PASSWORD", "synthetic-test-password".repeat(2));
  vi.stubEnv("AUTH_SECRET", "synthetic-signing-material".repeat(2));
  vi.stubEnv("SESSION_MAX_AGE", "3600");
  vi.stubEnv("APP_ORIGIN", "");
  resetEnvCache();
  cookie = `hf_access_session=${await createSessionToken()}`;
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected real fetch in route test")));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); resetEnvCache(); });

describe("actual API route security", () => {
  it("authenticates every handler using a generated secret without weakening repository checks", async () => {
    vi.stubEnv("AUTH_SECRET", undefined);
    vi.stubEnv("VERCEL", undefined);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    resetEnvCache();
    cookie = `hf_access_session=${await createSessionToken()}`;
    for (const handler of [approve, reject, revoke, grant]) {
      const response = await handler(req({ repo: { ...repo, repoId: "outside/repo" }, username: "synthetic-user" }));
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("FORBIDDEN_REPOSITORY");
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([approve, reject, revoke, grant, requests, repositories, logout])("requires a valid session without middleware", async handler => {
    expect((await handler(req({ repo, username: "synthetic-user" }, { cookie: "" }))).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([approve, reject, revoke, grant])("rejects outside repositories before upstream access", async handler => {
    const res = await handler(req({ repo: { ...repo, repoId: "outside/repo" }, username: "synthetic-user" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN_REPOSITORY");
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([approve, reject])("rejects a mixed bulk batch before performing any mutations", async handler => {
    expect((await handler(req({ items: [{ repo, username: "synthetic-user" }, { repo: { ...repo, repoId: "outside/repo" }, username: "synthetic-user" }] }))).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("reconstructs canonical partial-failure IDs after stripping supplied IDs", async () => {
    vi.spyOn(hf, "approveRequest").mockImplementation(async (_repo, user) => { if (user === "synthetic-failure") throw new Error("Synthetic denial"); });
    const res = await approve(req({ items: [{ id: "untrusted", repo, username: "synthetic-success" }, { id: "untrusted", repo, username: "synthetic-failure" }] }));
    const { data } = await res.json();
    expect(data.succeeded).toBe(1);
    expect(data.failed).toBe(1);
    expect(data.errors[0].id).toBe("model:review/synthetic:synthetic-failure");
  });
  it("rejects duplicate identities and whitespace-only usernames", async () => {
    expect((await approve(req({ repo, username: "   " }))).status).toBe(400);
    expect((await approve(req({ items: [{ repo, username: "synthetic-user" }, { repo, username: "SYNTHETIC-user" }] }))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not trust forged forwarded hosts or insecure schemes", async () => {
    const cases: Record<string, string>[] = [{ origin: "https://outside.invalid", "x-forwarded-host": "outside.invalid" }, { origin: "http://dashboard.example" }];
    for (const headers of cases) {
      const res = await grant(req({ repo, username: "synthetic-user" }, headers));
      expect((await res.json()).error.code).toBe("CSRF_ERROR");
    }
  });
  it("accepts the configured public origin behind a proxy without trusting its headers", async () => {
    vi.stubEnv("APP_ORIGIN", "https://public.example");
    vi.spyOn(hf, "grantAccess").mockResolvedValue();
    expect((await grant(req({ repo, username: "synthetic-user" }, { origin: "https://public.example", host: "internal:3000" }))).status).toBe(200);
  });
  it("accepts a same-origin Referer but rejects missing origin information in production", async () => {
    vi.spyOn(hf, "grantAccess").mockResolvedValue();
    const withReferer = req({ repo, username: "synthetic-user" }, { referer: "https://dashboard.example/" });
    withReferer.headers.delete("origin");
    expect((await grant(withReferer)).status).toBe(200);
    withReferer.headers.delete("referer");
    expect((await grant(withReferer)).status).toBe(403);
  });
  it("rejects malformed and oversized JSON without upstream access", async () => {
    const malformed = new NextRequest("https://dashboard.example", { method: "POST", headers: { cookie, host: "dashboard.example", origin: "https://dashboard.example" }, body: "{" });
    expect((await approve(malformed)).status).toBe(400);
    expect((await approve(req({ padding: "x".repeat(65_000) }))).status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("bounds a stalled incoming JSON body even if stream cancellation does not settle", async () => {
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    vi.spyOn(AbortSignal, "timeout").mockImplementation(ms => timeout(ms === 10_000 ? 10 : ms));
    const request = new NextRequest("https://dashboard.example/api/access/approve", {
      method: "POST", headers: { cookie, host: "dashboard.example", origin: "https://dashboard.example" },
      body: new ReadableStream({ start() {}, cancel() { return new Promise(() => {}); } }),
      // Node requires duplex for streaming request bodies.
      duplex: "half",
    } as ConstructorParameters<typeof NextRequest>[1]);
    const result = await approve(request);
    expect(result.status).toBe(408);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("passes clamped pagination and cancellation through the actual GET route", async () => {
    const spy = vi.spyOn(access, "aggregateRequests").mockResolvedValue({ requests: [], errors: [], totalRepos: 1, successfulRepos: 1, hasMore: false, truncated: false });
    const request = req(undefined, {}, "https://dashboard.example/api/access/requests?status=accepted&maxPages=999");
    const res = await requests(request);
    expect(res.status).toBe(200);
    expect(spy.mock.calls[0][2]).toMatchObject({ maxPages: 100, signal: request.signal });
    expect(res.headers.get("cache-control")).toContain("no-store");
  });
  it("sets production cookie flags and clears the cookie on logout", async () => {
    const res = await login(req({ password: process.env.APP_PASSWORD }));
    expect(res.status).toBe(200);
    const flags = res.headers.get("set-cookie")!;
    for (const flag of ["HttpOnly", "Secure", "SameSite=lax", "Path=/", "Max-Age=3600"]) expect(flags).toContain(flag);
    expect((await logout(req({}))).headers.get("set-cookie")).toContain("Expires=Thu, 01 Jan 1970");
  });
  it("rejects expired, non-expiring, wrong-algorithm, and rotated-password tokens", async () => {
    const key = await deriveSessionKey(process.env.AUTH_SECRET!, process.env.APP_PASSWORD!);
    for (const jwt of [new SignJWT({ authenticated: true }).setIssuedAt().setExpirationTime(1).setProtectedHeader({ alg: "HS256" }),
      new SignJWT({ authenticated: true }).setIssuedAt().setProtectedHeader({ alg: "HS256" }),
      new SignJWT({ authenticated: true }).setIssuedAt().setExpirationTime("1h").setProtectedHeader({ alg: "HS512" })]) {
      expect((await requests(req(undefined, { cookie: `hf_access_session=${await jwt.sign(key)}` }))).status).toBe(401);
    }
    vi.stubEnv("APP_PASSWORD", "synthetic-rotated-password");
    expect((await requests(req())).status).toBe(401);
  });
});
