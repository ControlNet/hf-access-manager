export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { initializeAuthSecret } = await import("./lib/runtime-auth-secret");
    initializeAuthSecret();
  }
}
