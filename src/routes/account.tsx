import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/account")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Your account — WallRaven" },
      {
        name: "description",
        content: "Manage your WallRaven account, change your password and sign out.",
      },
      { property: "og:title", content: "Your account — WallRaven" },
      {
        property: "og:description",
        content: "Manage your WallRaven account, change your password and sign out.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [savedUsername, setSavedUsername] = useState<string | null>(null);
  const [uBusy, setUBusy] = useState(false);
  const [uMsg, setUMsg] = useState<string | null>(null);
  const [uErr, setUErr] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        navigate({ to: "/auth" });
        return;
      }
      setEmail(data.user.email ?? null);
      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", data.user.id)
        .maybeSingle();
      if (profile?.username) {
        setSavedUsername(profile.username);
        setUsername(profile.username);
      }
      setLoading(false);
    });
  }, [navigate]);

  async function onSaveUsername(e: React.FormEvent) {
    e.preventDefault();
    setUErr(null);
    setUMsg(null);
    const wanted = username.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{2,23}$/.test(wanted)) {
      setUErr("3–24 characters: letters, numbers, dot, dash or underscore.");
      return;
    }
    setUBusy(true);
    const { data: userData } = await supabase.auth.getUser();
    const id = userData.user?.id;
    if (!id) {
      setUBusy(false);
      setUErr("Session expired — sign in again.");
      return;
    }
    const { error } = await supabase.from("profiles").upsert({ id, username: wanted });
    setUBusy(false);
    if (error) {
      setUErr(
        /duplicate|unique/i.test(error.message) ? "That username is already taken." : error.message,
      );
      return;
    }
    setSavedUsername(wanted);
    setUMsg("Username saved. Shared presets now show \u201cby " + wanted + "\u201d.");
  }

  async function onChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(error.message);
    else {
      setPassword("");
      setMessage("Password updated.");
    }
  }

  async function onSignOut(scope: "local" | "global") {
    await supabase.auth.signOut({ scope });
    navigate({ to: "/auth" });
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center py-8 text-foreground">
      <main className="w-full max-w-sm">
        <h1 className="text-center text-2xl font-semibold tracking-tight">Your account</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          {savedUsername ? (
            <span className="font-medium text-foreground">@{savedUsername}</span>
          ) : null}
          {savedUsername ? " · " : ""}
          {email}
        </p>

        <form
          onSubmit={onSaveUsername}
          className="mt-8 space-y-4 rounded-xl border border-border bg-card p-6"
        >
          <div className="space-y-1.5">
            <label htmlFor="un" className="text-sm font-medium">
              Username
            </label>
            <input
              id="un"
              type="text"
              maxLength={24}
              autoCapitalize="off"
              spellCheck={false}
              placeholder="yourname"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              Public handle shown on presets you share. Separate from your email address.
            </p>
          </div>
          {uErr && <p className="text-sm text-destructive">{uErr}</p>}
          {uMsg && <p className="text-sm text-muted-foreground">{uMsg}</p>}
          <button
            type="submit"
            disabled={uBusy || username.trim() === (savedUsername ?? "")}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {uBusy ? "Saving…" : savedUsername ? "Update username" : "Claim username"}
          </button>
        </form>

        <form
          onSubmit={onChangePassword}
          className="mt-4 space-y-4 rounded-xl border border-border bg-card p-6"
        >
          <div className="space-y-1.5">
            <label htmlFor="np" className="text-sm font-medium">
              New password
            </label>
            <input
              id="np"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {message && <p className="text-sm text-muted-foreground">{message}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Change password"}
          </button>
        </form>

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => onSignOut("local")}
            className="flex-1 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            Sign out
          </button>
          <button
            onClick={() => onSignOut("global")}
            className="flex-1 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            Sign out everywhere
          </button>
        </div>
      </main>
    </div>
  );
}
