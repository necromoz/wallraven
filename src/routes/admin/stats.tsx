import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

// Usage numbers for the site owner. Not linked from anywhere.
//
// Nothing here collects anything new: the database side
// (supabase/migrations/20261006180000_admin_stats.sql) counts rows the service
// already holds and returns totals only, and only to someone listed in
// public.app_admins. Downloads are GitHub's own public counters. People who use
// the app without an account cannot be seen, which is the point of the privacy
// notice, and the page says so rather than guessing.

const RELEASES_API = "https://api.github.com/repos/wallraven-app/wallraven/releases?per_page=100";

type Stats = {
  generated_at: string;
  accounts: { total: number; confirmed: number; new_7d: number; new_30d: number; with_username: number };
  active: { users_1d: number; users_7d: number; users_30d: number; sessions_7d: number };
  daily_active: { day: string; users: number }[];
  sync: { users: number; changed_7d: number };
  community: { presets: number; likes: number; copies: number };
  feedback: { total_30d: number; crashes_30d: number };
};

type Release = { tag: string; date: string; downloads: number; prerelease: boolean };

export const Route = createFileRoute("/admin/stats")({
  ssr: false,
  head: () => ({ meta: [{ title: "Stats — WallRaven" }, { name: "robots", content: "noindex" }] }),
  component: StatsPage,
});

function useReleases() {
  const [releases, setReleases] = useState<Release[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    fetch(RELEASES_API, { headers: { Accept: "application/vnd.github+json" } })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((list: any[]) =>
        setReleases(
          list
            .map((r) => ({
              tag: String(r.tag_name),
              date: String(r.published_at || r.created_at || ""),
              prerelease: !!r.prerelease,
              downloads: (r.assets || [])
                .filter((a: any) => /\.exe$/i.test(a.name))
                .reduce((n: number, a: any) => n + (a.download_count || 0), 0),
            }))
            .sort((a, b) => b.date.localeCompare(a.date)),
        ),
      )
      .catch(() => setError(true));
  }, []);
  return { releases, error };
}

function Tile({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 font-display text-3xl font-semibold tabular-nums">{value}</div>
      {note && <div className="mt-1 text-xs text-muted-foreground">{note}</div>}
    </div>
  );
}

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="glass-card rounded-2xl p-6">
      <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
      {note && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Row({ k, v }: { k: string; v: number | string }) {
  return (
    <div className="flex justify-between border-b border-border/60 py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium tabular-nums">{v}</span>
    </div>
  );
}

const fmtDay = (d: string) =>
  new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

// Thirty days of one series, as columns on a shared baseline. Each column has a
// hover target the full height of the plot and says its value; the busiest day
// is labelled directly so the scale is readable without hovering.
function DailyBars({ days }: { days: Stats["daily_active"] }) {
  const max = Math.max(1, ...days.map((d) => d.users));
  const peak = days.reduce((a, b) => (b.users > a.users ? b : a), days[0]);
  return (
    <div>
      <div className="relative flex h-40 items-end gap-[2px] border-b border-border" role="img"
        aria-label={`Daily active signed-in users over 30 days, peak ${peak?.users ?? 0}`}>
        {days.map((d) => (
          <div key={d.day} className="group relative flex h-full flex-1 items-end"
            title={`${fmtDay(d.day)}: ${d.users} ${d.users === 1 ? "user" : "users"}`}>
            <div className="w-full rounded-t-[4px] bg-primary/85 transition-colors group-hover:bg-primary"
              style={{ height: `${(d.users / max) * 100}%`, minHeight: d.users ? 3 : 0 }} />
            {d === peak && d.users > 0 && (
              <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] tabular-nums text-muted-foreground">
                {d.users}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
        <span>{days[0] && fmtDay(days[0].day)}</span>
        <span>today</span>
      </div>
    </div>
  );
}

function ReleaseBars({ releases }: { releases: Release[] }) {
  const shown = releases.slice(0, 12);
  const max = Math.max(1, ...shown.map((r) => r.downloads));
  return (
    <table className="w-full text-sm">
      <thead className="sr-only">
        <tr><th>Release</th><th>Downloads</th></tr>
      </thead>
      <tbody>
        {shown.map((r) => (
          <tr key={r.tag} title={`${r.tag}: ${r.downloads} downloads`}>
            <td className="w-28 py-1 pr-3 align-middle tabular-nums text-muted-foreground">
              {r.tag}
              {r.prerelease && <span className="ml-1 text-[10px] uppercase">beta</span>}
            </td>
            <td className="py-1 align-middle">
              <div className="flex items-center gap-2">
                <div className="h-3 rounded-r-[4px] bg-primary/85" style={{ width: `${(r.downloads / max) * 100}%`, minWidth: r.downloads ? 3 : 0 }} />
                <span className="tabular-nums text-foreground">{r.downloads}</span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "denied" | "error">("loading");
  const { releases, error: relError } = useReleases();

  useEffect(() => {
    supabase.rpc("admin_stats").then(({ data, error }) => {
      if (error) {
        setState(/forbidden|permission denied|JWT/i.test(error.message) ? "denied" : "error");
        return;
      }
      setStats(data as unknown as Stats);
      setState("ok");
    });
  }, []);

  if (state === "loading") {
    return <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (state === "denied") {
    // Same answer as a page that does not exist: nothing to learn from probing.
    return (
      <main className="mx-auto max-w-xl pt-20 text-center">
        <h1 className="font-display text-2xl font-semibold">Page not found</h1>
        <p className="mt-3 text-sm text-muted-foreground"><Link to="/" className="underline">Back to WallRaven</Link></p>
      </main>
    );
  }
  if (state === "error" || !stats) {
    return <main className="mx-auto max-w-xl pt-20 text-center text-sm text-muted-foreground">The numbers could not be loaded.</main>;
  }

  const stable = (releases || []).filter((r) => !r.prerelease);
  const totalDownloads = (releases || []).reduce((n, r) => n + r.downloads, 0);
  const latest = stable[0];

  return (
    <main className="mx-auto w-full max-w-5xl pb-24 pt-7">
      <h1 className="text-gradient font-display text-4xl font-semibold tracking-tight">Stats</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        As of {new Date(stats.generated_at).toLocaleString("en-GB")}. Only you can see this page.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Tile label="Installer downloads" value={releases ? totalDownloads : relError ? "–" : "…"} note="All releases, includes updates" />
        <Tile label={latest ? `${latest.tag} downloads` : "Latest release"} value={latest ? latest.downloads : "…"} note="Current stable" />
        <Tile label="Active, last 7 days" value={stats.active.users_7d} note={`${stats.active.users_1d} today · ${stats.active.users_30d} in 30 days`} />
        <Tile label="Accounts" value={stats.accounts.total} note={`${stats.accounts.new_30d} new in 30 days`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Signed-in users per day"
          note="Distinct accounts whose app or browser renewed its sign-in that day, which happens about hourly while in use. Anyone using the app without an account is not counted, by design.">
          <DailyBars days={stats.daily_active} />
        </Card>

        <Card title="Downloads by release"
          note="GitHub's download counter for each installer. The app's own updater downloads from the same place, so a release's count is new installs plus existing copies updating to it.">
          {releases ? <ReleaseBars releases={releases} /> : relError
            ? <p className="text-sm text-muted-foreground">GitHub did not answer. Try again in a minute.</p>
            : <p className="text-sm text-muted-foreground">Loading…</p>}
        </Card>

        <Card title="Accounts">
          <Row k="Total" v={stats.accounts.total} />
          <Row k="Email confirmed" v={stats.accounts.confirmed} />
          <Row k="Chose a username" v={stats.accounts.with_username} />
          <Row k="New in 7 days" v={stats.accounts.new_7d} />
          <Row k="Sign-in sessions active in 7 days" v={stats.active.sessions_7d} />
        </Card>

        <Card title="Sync, community and feedback">
          <Row k="Accounts syncing settings" v={stats.sync.users} />
          <Row k="Changed their settings in 7 days" v={stats.sync.changed_7d} />
          <Row k="Shared presets" v={stats.community.presets} />
          <Row k="Preset likes" v={stats.community.likes} />
          <Row k="Preset copies" v={stats.community.copies} />
          <Row k="Feedback in 30 days" v={stats.feedback.total_30d} />
          <Row k="Crash reports in 30 days" v={stats.feedback.crashes_30d} />
        </Card>
      </div>
    </main>
  );
}
