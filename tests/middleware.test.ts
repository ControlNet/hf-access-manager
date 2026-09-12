import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { middleware } from "@/middleware";

// No cookie is ever set here: every case is an anonymous visitor.
const visit = (path: string) => middleware(new NextRequest(new URL(`http://dashboard.test${path}`)));

describe("session gate", () => {
  it.each(["/favicon.ico", "/icon.svg", "/apple-icon.png"])(
    "serves %s without a session, so the login tab has an icon",
    async (path) => {
      const res = await visit(path);
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
      // Passing the gate must not cost the security headers.
      expect(res.headers.get("X-Frame-Options")).toBe("DENY");
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    }
  );

  it.each(["/", "/repositories", "/icon.svg.html", "/apple-icon.png/../"])(
    "still sends %s to the login page",
    async (path) => {
      const res = await visit(path);
      expect(res.status).toBe(307);
      expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
    }
  );

  it("answers an unauthenticated API call with 401 rather than a redirect", async () => {
    const res = await visit("/api/access/requests");
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });
});
