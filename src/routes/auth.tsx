import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/integrations/supabase/client";

// Whether this sign-in was started in order to link a desktop app. Only a flag:
// the pairing code itself is never carried through the website, because a code
// that travels in a link is a code an attacker can choose and send to someone.
// See src/routes/link.tsx.
const LINKING_KEY = "wallraven.linking";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — WallRaven" },
      { name: "description", content: "Sign in to your WallRaven account to sync settings, presets and playlists across machines." },
      { property: "og:title", content: "Sign in — WallRaven" },
      { property: "og:description", content: "Sign in to your WallRaven account to sync settings, presets and playlists across machines." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // The Google redirect drops our query string, so remember the intent
    // locally. `pair` is honoured only as a sign that an older app sent the
    // person here; its value is deliberately ignored and never forwarded.
    const wantsLink =
      params.get("link") === "1" ||
      params.has("pair") ||
      sessionStorage.getItem(LINKING_KEY) === "1";
    if (wantsLink) {
      setLinking(true);
      sessionStorage.setItem(LINKING_KEY, "1");
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return;
      if (wantsLink) {
        sessionStorage.removeItem(LINKING_KEY);
        navigate({ to: "/link" });
      } else navigate({ to: "/account" });
    });
  }, [navigate]);

  const afterAuth = () => {
    if (linking) {
      sessionStorage.removeItem(LINKING_KEY);
      navigate({ to: "/link" });
    } else navigate({ to: "/account" });
  };

  async function onGoogle() {
    setBusy(true);
    setError(null);
    setMessage(null);
    if (linking) sessionStorage.setItem(LINKING_KEY, "1");
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/auth",
    });
    if (result.error) {
      setError(result.error.message || "Google sign-in failed.");
      setBusy(false);
      return;
    }
    if (result.redirected) return;
    afterAuth();
  }


  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        afterAuth();
      } else if (mode === "signup") {
        const redirect = new URL("/auth", window.location.origin);
        if (linking) redirect.searchParams.set("link", "1");
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirect.toString() },
        });
        if (error) throw error;
        if (data.session) afterAuth();
        else setMessage("Check your inbox to confirm your email address, then sign in.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setMessage("If that address has an account, a reset link is on its way.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center py-8 text-foreground">
      <main className="w-full max-w-sm">
        <h1 className="text-center text-2xl font-semibold tracking-tight">WallRaven</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          {linking
            ? "Sign in to link the Wallraven desktop app."
            : "Sync your settings, presets and playlists."}
        </p>

        <div className="mt-8 space-y-3 rounded-xl border border-border bg-card p-6">
          <button
            type="button"
            onClick={onGoogle}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4">
              <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.2-2.2H12v4.2h6.6c-.1 1.1-.9 2.8-2.6 3.9l-.1.1 3.8 3c2.4-2.3 3.8-5.5 3.8-9z" />
              <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.7-2.9l-3.7-2.9c-1 .7-2.3 1.2-4 1.2-3.1 0-5.8-2.1-6.7-5l-.1.1-3.9 3C3.1 21.3 7.2 24 12 24z" />
              <path fill="#FBBC05" d="M5.3 14.4c-.3-.7-.4-1.5-.4-2.4s.2-1.7.4-2.4v-.1L1.3 6.4C.5 8.1 0 10 0 12s.5 3.9 1.3 5.6l4-3.2z" />
              <path fill="#EA4335" d="M12 4.7c2.2 0 3.7.9 4.5 1.7l3.3-3.2C17.9 1.2 15.2 0 12 0 7.2 0 3.1 2.7 1.3 6.4l4 3.2c1-2.9 3.6-4.9 6.7-4.9z" />
            </svg>
            Continue with Google
          </button>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" />
          </div>
        </div>

        <form onSubmit={onSubmit} className="mt-4 space-y-4 rounded-xl border border-border bg-card p-6">

          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium">Email</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {mode !== "forgot" && (
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium">Password</label>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          {message && <p className="text-sm text-muted-foreground">{message}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {busy
              ? "Please wait…"
              : mode === "signin"
                ? "Sign in"
                : mode === "signup"
                  ? "Create account"
                  : "Send reset link"}
          </button>

          <div className="flex justify-between pt-1 text-xs text-muted-foreground">
            {mode !== "signin" ? (
              <button type="button" className="underline" onClick={() => setMode("signin")}>
                Back to sign in
              </button>
            ) : (
              <button type="button" className="underline" onClick={() => setMode("forgot")}>
                Forgot password?
              </button>
            )}
            {mode !== "signup" && (
              <button type="button" className="underline" onClick={() => setMode("signup")}>
                Create an account
              </button>
            )}
          </div>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link to="/" className="underline">Back to wallraven.app</Link>
        </p>
      </main>
    </div>
  );
}
