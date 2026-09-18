import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

// Whether this sign-in was started in order to link a desktop app. Only a flag:
// the pairing code itself is never carried through the website, because a code
// that travels in a link is a code an attacker can choose and send to someone.
// See src/routes/link.tsx.
const LINKING_KEY = "wallraven.linking";

// Google sign-in used to sit above the email form. It went through
// Lovable's platform, via a /~oauth/initiate route their hosting provided
// rather than anything in this codebase, so it returns a 404 anywhere else.
// A button that cannot work is worse than no button: it reads as the whole
// app being broken. Adding it back means configuring Google as a real
// provider on the Supabase project, which is a separate job.

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — WallRaven" },
      {
        name: "description",
        content:
          "Sign in to your WallRaven account to sync settings, presets and playlists across machines.",
      },
      { property: "og:title", content: "Sign in — WallRaven" },
      {
        property: "og:description",
        content:
          "Sign in to your WallRaven account to sync settings, presets and playlists across machines.",
      },
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

        <form
          onSubmit={onSubmit}
          className="mt-4 space-y-4 rounded-xl border border-border bg-card p-6"
        >
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
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
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
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
          <Link to="/" className="underline">
            Back to wallraven.app
          </Link>
        </p>
      </main>
    </div>
  );
}
