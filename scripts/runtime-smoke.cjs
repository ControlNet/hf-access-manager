// Run inside the standalone image with networking disabled; see README.md.
// Credentials are random, synthetic, process-local fixtures, never deployment defaults.
const { spawn } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const { readdir, readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");

function check(condition, message) {
  if (!condition) throw new Error(message);
}

const origin = "http://127.0.0.1:3000";
const synthetic = () => randomBytes(32).toString("hex");
const config = {
  NODE_ENV: "production", HOSTNAME: "127.0.0.1", PORT: "3000",
  APP_ORIGIN: origin, HF_REPOSITORIES: "model:runtime-check/repository",
  HF_TOKEN: synthetic(), APP_PASSWORD: synthetic(), AUTH_SECRET: synthetic(),
};
let child;

async function request(path, init = {}) {
  return fetch(`${origin}${path}`, { redirect: "manual", signal: AbortSignal.timeout(5000), ...init });
}

async function start() {
  child = spawn(process.execPath, ["server.js"], { env: { ...process.env, ...config }, stdio: "ignore" });
  const until = Date.now() + 15000;
  while (Date.now() < until) {
    check(child.exitCode === null, "Standalone server exited before becoming ready");
    try {
      const response = await request("/login");
      await response.arrayBuffer();
      if (response.ok) return;
    } catch { /* Wait for startup without printing environment or credentials. */ }
    await delay(100);
  }
  throw new Error("Standalone server did not become ready");
}

async function stop() {
  if (!child || child.exitCode !== null) return;
  const processToStop = child;
  await new Promise(resolve => {
    const timeout = setTimeout(() => processToStop.kill("SIGKILL"), 3000);
    processToStop.once("exit", () => { clearTimeout(timeout); resolve(); });
    processToStop.kill("SIGTERM");
  });
}

async function login(password) {
  return request("/api/auth/login", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
}

async function scanArtifacts(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await scanArtifacts(path);
    else if (entry.isFile()) {
      const content = await readFile(path);
      check(![config.HF_TOKEN, config.APP_PASSWORD, config.AUTH_SECRET].some(value => content.includes(value)),
        "Runtime credential was persisted in a build artifact");
    }
  }
}

async function main() {
  check(process.getuid?.() === 1001, "Runtime must use the non-root nextjs user");
  check(["APP_PASSWORD", "AUTH_SECRET", "HF_TOKEN"].every(key => !process.env[key]),
    "Image must not provide embedded credential defaults");
  await start();

  const anonymousPage = await request("/");
  check(anonymousPage.status === 307, "Anonymous page request must redirect to login");
  check((await request("/api/access/requests")).status === 401, "Anonymous API must return 401");
  check((await login(synthetic())).status === 401, "Wrong runtime password must be rejected");
  const signedIn = await login(config.APP_PASSWORD);
  check(signedIn.ok, "Runtime password must be accepted by the built image");
  const cookieHeader = signedIn.headers.get("set-cookie") || "";
  check(/httponly/i.test(cookieHeader) && /secure/i.test(cookieHeader) && /samesite=lax/i.test(cookieHeader)
    && /path=\//i.test(cookieHeader), "Production session cookie flags must be present");
  const cookie = cookieHeader.split(";")[0];

  const home = await request("/", { headers: { Cookie: cookie } });
  const html = await home.text();
  check(home.ok && html.includes("runtime-check/repository"), "Runtime repository configuration must render after login");
  check(![config.HF_TOKEN, config.APP_PASSWORD, config.AUTH_SECRET].some(value => html.includes(value)),
    "HTML must not expose runtime credentials");
  check(home.headers.get("x-frame-options") === "DENY", "Authenticated page must deny framing");
  check((home.headers.get("cache-control") || "").includes("no-store"), "Authenticated page must disable caching");

  for (const action of ["approve", "reject", "revoke", "grant"]) {
    const response = await request(`/api/access/${action}`, {
      method: "POST", headers: { Origin: origin, Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ repo: { type: "model", repoId: "outside/allowlist" }, username: "synthetic-user" }),
    });
    check(response.status === 403, "Non-allowlisted mutations must be rejected without upstream access");
  }
  const forgedOrigin = await request("/api/access/approve", {
    method: "POST", headers: { Origin: "https://attacker.invalid", "X-Forwarded-Host": "attacker.invalid", Cookie: cookie,
      "Content-Type": "application/json" },
    body: JSON.stringify({ repo: { type: "model", repoId: "runtime-check/repository" }, username: "synthetic-user" }),
  });
  check(forgedOrigin.status === 403 && (await forgedOrigin.json()).error?.code === "CSRF_ERROR",
    "Forwarded host must not authorize a foreign origin");

  await scanArtifacts(".next");
  await stop();
  config.APP_PASSWORD = synthetic();
  await start();
  check((await request("/api/access/requests", { headers: { Cookie: cookie } })).status === 401,
    "Restart with a rotated password must invalidate the previous cookie");
  const rotatedLogin = await login(config.APP_PASSWORD);
  check(rotatedLogin.ok, "Rotated runtime password must work without rebuilding");
  const rotatedCookie = (rotatedLogin.headers.get("set-cookie") || "").split(";")[0];
  const logout = await request("/api/auth/logout", { method: "POST", headers: { Origin: origin, Cookie: rotatedCookie } });
  check(logout.ok && /expires=Thu, 01 Jan 1970/i.test(logout.headers.get("set-cookie") || ""), "Logout must clear the browser cookie");

  await stop();
  config.AUTH_SECRET = "";
  await start();
  check((await request("/api/access/requests", { headers: { Cookie: rotatedCookie } })).status === 401,
    "An explicit-key cookie must not authenticate under a generated key");
  const automaticLogin = await login(config.APP_PASSWORD);
  check(automaticLogin.ok, "Login must work without a configured AUTH_SECRET");
  const automaticCookie = (automaticLogin.headers.get("set-cookie") || "").split(";")[0];
  const automaticHome = await request("/", { headers: { Cookie: automaticCookie } });
  check(automaticHome.ok, "Middleware and server page must agree on the generated signing key");
  await automaticHome.arrayBuffer();
  check((await request("/login", { headers: { Cookie: automaticCookie } })).status === 307,
    "Middleware must verify generated-key sessions on the login page");
  for (const action of ["approve", "reject", "revoke", "grant"]) {
    const response = await request(`/api/access/${action}`, {
      method: "POST", headers: { Origin: origin, Cookie: automaticCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ repo: { type: "model", repoId: "outside/allowlist" }, username: "synthetic-user" }),
    });
    check(response.status === 403 && (await response.json()).error?.code === "FORBIDDEN_REPOSITORY",
      "Each API handler must recognize generated-key sessions and still enforce the allowlist");
  }

  await stop();
  await start();
  check((await request("/api/access/requests", { headers: { Cookie: automaticCookie } })).status === 401,
    "Restart without AUTH_SECRET must invalidate the previous generated-key cookie");
  check((await login(config.APP_PASSWORD)).ok, "A fresh generated key must permit a new login after restart");
  console.log("Runtime smoke passed: non-root, runtime env, authentication, allowlist, CSRF, headers, secret isolation, password rotation, logout, optional AUTH_SECRET and restart invalidation.");
}

main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(stop);
