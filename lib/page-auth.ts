import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME, verifyTokenWithSecrets } from "./session-key";

export async function requirePageSession() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value || "";
  if (!await verifyTokenWithSecrets(token, process.env.AUTH_SECRET || "", process.env.APP_PASSWORD || "")) redirect("/login");
}
