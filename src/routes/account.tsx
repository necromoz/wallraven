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
  const [editingUsername, setEditingUsername] = useState(false);
  const [nextChangeAt, setNextChangeAt] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        navigate({ to: "/auth" });
        return;
      }
      setEmail(data.user.email ?? null);
      // Before the cooldown migration is applied the column is missing and the
      // query errors; fall back to the username alone rather than show nothing.
      let { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("username, username_changed_at")
        .eq("id", data.user.id)
        .maybeSingle();
      if (pErr) {
        const fallback = await supabase
          .from("profiles")
          .select("username")
          .eq("id", data.user.id)
          .maybeSingle();
        profile = fallback.data ? { ...fallback.data, username_changed_at: null } : null;
      }
      if (profile?.username) {
        setSavedUsername(profile.username);
        setUsername(profile.username);
        setNextChangeAt(nextUsernameChange(profile.username_changed_at));
      }
      setLoading(false);
    });
  }, [navigate]);

  async function onSaveUsername(e: React.FormEvent) {
    e.preventDefault();
    setUErr(null);
    setUMsg(null);
    if (savedUsername && !editingUsername) {
      setEditingUsername(true);
      setUMsg("Pick carefully: after this change you cannot change it again for 30 days.");
      return;
    }
    const wanted = username.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{2,23}$/.test(wanted)) {
      setUErr("3–24 characters: letters, numbers, dot, dash or underscore.");
      return;
    }
    if (savedUsername && wanted === savedUsername) {
      setEditingUsername(false);
      setUMsg(null);
      return;
    }
    if (
      savedUsername &&
      !window.confirm(
        `Change your username from \u201c${savedUsername}\u201d to \u201c${wanted}\u201d?\n\n` +
          "Presets you have shared will show the new name, and you will not be able to change it " +
          "again for 30 days. Your old name becomes free for anyone to claim.",
      )
    )
      return;
    setUBusy(true);
    const { data: userData } = await supabase.auth.getUser();
    const id = userData.user?.id;
    if (!id) {
      setUBusy(false);
      setUErr("Session expired — sign in again.");
      return;
    }
    const { data: row, error } = await supabase
      .from("profiles")
      .upsert({ id, username: wanted })
      .select("username_changed_at")
      .maybeSingle();
    setUBusy(false);
    if (error) {
      const cooldown = /username_cooldown until ([0-9T:.Z-]+)/.exec(error.message);
      if (cooldown) {
        setNextChangeAt(cooldown[1]);
        setEditingUsername(false);
        setUsername(savedUsername ?? "");
        setUErr(`You can change your username again on ${longDate(cooldown[1])}.`);
        return;
      }
      setUErr(
        /duplicate|unique/i.test(error.message) ? "That username is already taken." : error.message,
      );
      return;
    }
    setSavedUsername(wanted);
    setEditingUsername(false);
    setNextChangeAt(nextUsernameChange(row?.username_changed_at ?? null));
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

  const locked = !!savedUsername && !editingUsername;
  const waiting = !!nextChangeAt && Date.parse(nextChangeAt) > Date.now();

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
              readOnly={locked}
              onChange={(e) => setUsername(e.target.value)}
              className={
                locked
                  ? "w-full rounded-md border border-transparent bg-transparent px-0 py-2 text-sm outline-none"
                  : "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              }
            />
            <p className="text-xs text-muted-foreground">
              {waiting
                ? `Changed recently. You can change it again on ${longDate(nextChangeAt!)}.`
                : savedUsername
                  ? "Public handle shown on presets you share. Changing it is limited to once every 30 days."
                  : "Public handle shown on presets you share. Separate from your email address."}
            </p>
          </div>
          {uErr && <p className="text-sm text-destructive">{uErr}</p>}
          {uMsg && <p className="text-sm text-muted-foreground">{uMsg}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={
                uBusy ||
                (locked ? waiting : username.trim() === (savedUsername ?? "") && !editingUsername)
              }
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uBusy
                ? "Saving…"
                : !savedUsername
                  ? "Claim username"
                  : locked
                    ? "Change username…"
                    : "Save username"}
            </button>
            {savedUsername && editingUsername ? (
              <button
                type="button"
                onClick={() => {
                  setEditingUsername(false);
                  setUsername(savedUsername);
                  setUErr(null);
                  setUMsg(null);
                }}
                className="rounded-md border border-input px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
              >
                Cancel
              </button>
            ) : null}
          </div>
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

// The database enforces this (supabase/migrations/20261006120000); the page only
// reports it. Keep in step with USERNAME_COOLDOWN_DAYS in electron/cloud.cjs.
const USERNAME_COOLDOWN_DAYS = 30;

function nextUsernameChange(changedAt: string | null): string | null {
  if (!changedAt) return null;
  const t = Date.parse(changedAt);
  if (!Number.isFinite(t)) return null;
  const next = t + USERNAME_COOLDOWN_DAYS * 86400000;
  return next > Date.now() ? new Date(next).toISOString() : null;
}

function longDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
