import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset password — WallRaven" },
      { name: "description", content: "Choose a new password for your WallRaven account." },
      { property: "og:title", content: "Reset password — WallRaven" },
      { property: "og:description", content: "Choose a new password for your WallRaven account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

type RecoveryState = "checking" | "ready" | "invalid";

function hasRecoveryMarker() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const search = new URLSearchParams(window.location.search);
  return hash.get("type") === "recovery" || search.get("type") === "recovery";
}

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [recoveryState, setRecoveryState] = useState<RecoveryState>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const recoveryUrl = hasRecoveryMarker();
    let active = true;

    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (recoveryUrl && data.session) {
        setRecoveryState("ready");
        return;
      }
      if (data.session) {
        navigate({ to: "/account", replace: true });
        return;
      }
      setRecoveryState("invalid");
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && recoveryUrl)) {
        setRecoveryState("ready");
        return;
      }
      if (event === "SIGNED_IN") navigate({ to: "/account", replace: true });
    });
    void check();
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
    setTimeout(() => navigate({ to: "/account" }), 1200);
  }

  return (
    <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center py-8 text-foreground">
      <main className="w-full max-w-sm">
        <h1 className="text-center text-2xl font-semibold tracking-tight">Choose a new password</h1>

        {recoveryState === "checking" && !done && (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Checking your reset link…
          </p>
        )}

        {recoveryState === "invalid" && !done && (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Open this page from the link in your reset email. If the link has expired, request a new
            one from the sign-in page.
          </p>
        )}

        {done ? (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Password updated. Taking you to your account…
          </p>
        ) : recoveryState === "ready" ? (
          <form
            onSubmit={onSubmit}
            className="mt-8 space-y-4 rounded-xl border border-border bg-card p-6"
          >
            <div className="space-y-1.5">
              <label htmlFor="pw" className="text-sm font-medium">
                New password
              </label>
              <input
                id="pw"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="pw2" className="text-sm font-medium">
                Confirm password
              </label>
              <input
                id="pw2"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {busy ? "Saving…" : "Update password"}
            </button>
          </form>
        ) : (
          <p className="mt-6 text-center text-xs text-muted-foreground">
            <a href="/auth" className="underline">
              Back to sign in
            </a>
          </p>
        )}
      </main>
    </div>
  );
}
