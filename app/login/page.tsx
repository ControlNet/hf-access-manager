"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Loader2, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GitHubLink } from "@/components/github-link";
import { ThemeToggle } from "@/components/theme-toggle";

const GUARANTEES = [
  { tone: "bg-success", text: "NO DATABASE · THE HUB IS THE SOURCE OF TRUTH" },
  { tone: "bg-primary", text: "HF_TOKEN NEVER LEAVES THE SERVER" },
  { tone: "bg-model", text: "MUTATIONS RESTRICTED TO HF_REPOSITORIES" },
];

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!password) {
      setErrorMessage("Please enter the application password.");
      return;
    }

    try {
      setIsLoading(true);
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error?.message || "Invalid password.");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setErrorMessage("Failed to connect to authentication service.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* What this instance is, before anyone signs in. */}
      <aside className="relative hidden flex-col justify-between border-r bg-muted px-11 py-12 lg:flex lg:w-[46%] lg:max-w-[560px]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.55]"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        <div className="relative flex items-center gap-2.5">
          <ShieldCheck className="h-5 w-5 text-primary" strokeWidth={1.5} />
          <span className="text-sm font-semibold -tracking-[0.01em] text-foreground">Access Manager</span>
        </div>

        <div className="relative">
          <h1 className="max-w-[420px] text-[30px] font-semibold leading-[1.2] -tracking-[0.025em] text-foreground [text-wrap:pretty]">
            Review gated access without holding the owner&rsquo;s token.
          </h1>
          <p className="mt-4 max-w-[400px] text-[13.5px] leading-[1.6] text-muted-foreground [text-wrap:pretty]">
            Requests from every configured model and dataset land in one queue. Decisions go straight to the
            Hub — nothing about a requester is stored here.
          </p>

          <ul className="mt-7 space-y-2.5">
            {GUARANTEES.map((item) => (
              <li key={item.text} className="flex items-center gap-2.5 font-mono text-[11.5px] text-muted-foreground">
                <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${item.tone}`} />
                {item.text}
              </li>
            ))}
          </ul>
        </div>

        <span className="relative font-mono text-[11px] text-label">AGPL-3.0 · self-hosted · open source</span>
      </aside>

      <main className="relative flex flex-1 items-center justify-center px-4 py-12">
        <div className="absolute right-4 top-4 flex items-center gap-0.5">
          <GitHubLink />
          <ThemeToggle />
        </div>

        <div className="w-full max-w-[368px]">
          <div className="mb-7 flex items-center gap-2.5 lg:hidden">
            <ShieldCheck className="h-5 w-5 text-primary" strokeWidth={1.5} />
            <span className="text-sm font-semibold text-foreground">Access Manager</span>
          </div>

          <h2 className="text-[19px] font-semibold -tracking-[0.015em] text-foreground">Reviewer sign in</h2>
          <p className="mt-1.5 text-[12.5px] leading-[1.5] text-muted-foreground">
            One shared password, set by whoever deployed this instance.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-2.5">
            <label htmlFor="password" className="field-label flex items-center gap-1.5">
              <Lock className="h-2.5 w-2.5" strokeWidth={2} />
              Password
            </label>

            <Input
              id="password"
              type="password"
              placeholder="Shared application password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              autoFocus
              autoComplete="current-password"
              className="h-10 bg-card font-mono tracking-[0.08em]"
            />

            {errorMessage && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/[0.06] px-2.5 py-2 text-xs leading-[1.4] text-danger"
              >
                <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-destructive" strokeWidth={1.6} />
                <span>{errorMessage}</span>
              </div>
            )}

            <Button type="submit" className="h-10 w-full text-[13.5px]" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>

          <p className="mt-6 text-[11.5px] leading-[1.55] text-label">
            Sessions are stored in an HttpOnly cookie. If you need reviewer access, ask whoever owns the
            repositories — this instance has no sign-up.
          </p>
        </div>
      </main>
    </div>
  );
}
