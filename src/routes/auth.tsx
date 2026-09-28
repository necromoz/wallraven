import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

// Whether this sign-in was started in order to link a desktop app. Only a flag:
// the pairing code itself is never carried through the website, because a code
// that travels in a link is a code an attacker can choose and send to someone.
// See src/routes/link.tsx.
const LINKING_KEY = "wallraven.linking";

// OAuth sign-in used to be a single Google button above the email form. It
// went through Lovable's platform, via a /~oauth/initiate route their
// hosting provided rather than anything in this codebase, so it returned a
// 404 anywhere else. A button that cannot work is worse than no button: it
// reads as the whole app being broken. It only works again once each
// provider below is configured for real on the Supabase project -- client
// ID and secret entered directly into the Supabase dashboard, never through
// this repo.
const OAUTH_PROVIDERS = [
  {
    id: "google" as const,
    label: "Google",
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.87c2.27-2.09 3.58-5.17 3.58-8.82Z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11A12 12 0 0 0 12 24Z"
        />
        <path
          fill="#FBBC05"
          d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28V6.61H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.39l4-3.11Z"
        />
        <path
          fill="#EA4335"
          d="M12 4.77c1.76 0 3.34.61 4.58 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.61l4 3.11C6.22 6.88 8.87 4.77 12 4.77Z"
        />
      </svg>
    ),
  },
  {
    id: "azure" as const,
    label: "Microsoft",
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <rect x="1" y="1" width="10" height="10" fill="#F25022" />
        <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
        <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
        <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
      </svg>
    ),
  },
  {
    id: "discord" as const,
    label: "Discord",
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path
          fill="#5865F2"
          d="M20.32 4.77A19.8 19.8 0 0 0 15.3 3.1a.07.07 0 0 0-.08.04c-.21.39-.46.9-.63 1.3a18.3 18.3 0 0 0-5.18 0 13 13 0 0 0-.64-1.3.08.08 0 0 0-.08-.04 19.7 19.7 0 0 0-5.02 1.67.07.07 0 0 0-.03.03C.6 9.32-.36 13.75.11 18.13a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 6.05 3.13.08.08 0 0 0 .09-.03c.47-.66.88-1.35 1.24-2.08a.08.08 0 0 0-.04-.11 13 13 0 0 1-1.9-.94.08.08 0 0 1-.01-.13c.13-.1.25-.2.37-.3a.08.08 0 0 1 .08-.01c3.99 1.87 8.31 1.87 12.25 0a.08.08 0 0 1 .08.01c.12.1.24.2.37.3a.08.08 0 0 1-.01.13c-.6.36-1.24.67-1.9.94a.08.08 0 0 0-.04.11c.37.73.78 1.42 1.24 2.08a.08.08 0 0 0 .09.03 19.9 19.9 0 0 0 6.06-3.13.08.08 0 0 0 .03-.06c.56-5.07-.94-9.46-3.96-13.36a.06.06 0 0 0-.03-.03Zm-12.34 10.7c-1.2 0-2.19-1.16-2.19-2.58 0-1.42.97-2.58 2.19-2.58 1.23 0 2.21 1.17 2.19 2.58 0 1.42-.97 2.58-2.19 2.58Zm7.06 0c-1.2 0-2.19-1.16-2.19-2.58 0-1.42.97-2.58 2.19-2.58 1.23 0 2.2 1.17 2.19 2.58 0 1.42-.96 2.58-2.19 2.58Z"
        />
      </svg>
    ),
  },
];

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

  // OAuth leaves the page entirely and comes back to `redirectTo`, so there
  // is no local state to restore afterwards -- the useEffect above picks up
  // the new session on load and does the linking/account redirect itself.
  // The linking intent travels two ways belt-and-braces: as a query param on
  // the return URL, and in sessionStorage in case a provider's redirect
  // drops query strings (Google's used to, going through Lovable's old
  // /~oauth/initiate route).
  async function signInWithProvider(provider: "google" | "azure" | "discord") {
    setBusy(true);
    setError(null);
    const redirect = new URL("/auth", window.location.origin);
    if (linking) redirect.searchParams.set("link", "1");
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: redirect.toString() },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
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

        <div className="mt-4 space-y-2">
          {OAUTH_PROVIDERS.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={busy}
              onClick={() => signInWithProvider(p.id)}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
            >
              {p.icon}
              Continue with {p.label}
            </button>
          ))}
        </div>

        <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or continue with email
          <span className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border bg-card p-6">
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
