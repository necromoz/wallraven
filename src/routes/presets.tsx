import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { filterOfficialPresets } from "@/lib/official-presets";
import { PRESET_CATEGORIES } from "@/lib/preset-categories";
import {
  deleteMyPreset,
  listCommunityPresets,
  listMyLikes,
  listMyPresets,
  toggleLikePreset,
} from "@/lib/presets.functions";

export const Route = createFileRoute("/presets")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Wallpaper presets — WallRaven" },
      {
        name: "description",
        content:
          "Browse, like and copy WallRaven wallpaper presets: searches, filters and colours, both the ones that ship with the app and ones shared by other people.",
      },
      { property: "og:title", content: "Wallpaper presets — WallRaven" },
      {
        property: "og:description",
        content:
          "Browse, like and copy WallRaven wallpaper presets: searches, filters and colours, both the ones that ship with the app and ones shared by other people.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PresetsPage,
});

type Preset = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  tags: string[];
  author_name: string;
  data: unknown;
  like_count: number;
  copy_count: number;
  created_at: string;
  official?: boolean;
};

type Sort = "popular" | "new";

function summarise(data: unknown) {
  const d = (data ?? {}) as Record<string, unknown>;
  const bits: string[] = [];
  if (typeof d["query"] === "string" && d["query"]) bits.push(`“${d["query"]}”`);
  const cats = d["categories"] as Record<string, boolean> | undefined;
  if (cats) {
    const on = Object.entries(cats)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (on.length) bits.push(on.join(" + "));
  }
  if (typeof d["sorting"] === "string") bits.push(String(d["sorting"]).replace("_", " "));
  const colors = d["colors"] as string[] | undefined;
  if (colors?.length) bits.push(`${colors.length} colour${colors.length > 1 ? "s" : ""}`);
  
  return bits.join(" · ") || "No filters";
}

// Live preview: ask our cached proxy for the first Wallhaven result matching
// the preset's search, so each card shows roughly what you'd get.
const thumbCache = new Map<string, string | null>();

function PresetThumb({ data, name }: { data: unknown; name: string }) {
  const d = (data ?? {}) as Record<string, unknown>;
  const query = typeof d["query"] === "string" ? d["query"] : "";
  const cats = d["categories"] as Record<string, boolean> | undefined;
  const categories = cats
    ? `${cats["general"] ? 1 : 0}${cats["anime"] ? 1 : 0}${cats["people"] ? 1 : 0}`
    : "111";
  const sorting = typeof d["sorting"] === "string" ? d["sorting"] : "toplist";
  const key = `${query}|${categories}|${sorting}`;
  const [url, setUrl] = useState<string | null>(thumbCache.get(key) ?? null);
  const [visible, setVisible] = useState(() => thumbCache.has(key));
  const holder = useRef<HTMLDivElement | null>(null);

  // Only ask for a preview once the card is near the viewport: a long list was
  // firing dozens of requests and decoding every image straight away.
  useEffect(() => {
    if (visible) return;
    const el = holder.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    if (thumbCache.has(key)) {
      setUrl(thumbCache.get(key) ?? null);
      return;
    }
    let active = true;
    (async () => {
      try {
        const params = new URLSearchParams({ q: query, categories, sorting });
        const res = await fetch(`/api/public/presets/thumb?${params.toString()}`);
        const body = (await res.json()) as { url?: string | null };
        thumbCache.set(key, body.url ?? null);
        if (active) setUrl(body.url ?? null);
      } catch {
        if (active) setUrl(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [visible, key, query, categories, sorting]);

  return (
    <div
      ref={holder}
      className="mt-3 aspect-[16/9] w-full overflow-hidden rounded-lg border border-border bg-muted/40"
    >
      {url ? (
        <img
          src={`/api/public/presets/image?u=${encodeURIComponent(url)}`}
          alt={`Preview of the ${name} preset`}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
      ) : null}

    </div>
  );
}


function PresetsPage() {
  const [sort, setSort] = useState<Sort>("popular");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [likes, setLikes] = useState<string[]>([]);
  const [mineIds, setMineIds] = useState<string[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const has = !!data.session;
      setSignedIn(has);
      if (has) {
        try {
          const [res, mine] = await Promise.all([listMyLikes(), listMyPresets()]);
          setLikes(res.ids);
          setMineIds((mine.items as Preset[]).map((it) => it.id));
        } catch {
          /* ignore */
        }
      }
    })();
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const t = setTimeout(async () => {
      // The presets that ship with the app always lead the list, then whatever
      // people have shared.
      const official = filterOfficialPresets(category, search) as unknown as Preset[];
      // Show them straight away; shared ones drop in when the request lands.
      setItems(official);
      setLoading(false);
      try {
        const res = await listCommunityPresets({
          data: { sort, category: category || undefined, search: search || undefined, limit: 48 },
        });
        if (!active) return;
        setItems([...official, ...(res.items as Preset[])]);
        setError(res.error);
      } catch {
        if (active) {
          setItems(official);
          setError(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    }, 200);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [sort, category, search]);

  const categories = useMemo(() => PRESET_CATEGORIES, []);

  async function onLike(p: Preset) {
    if (!signedIn) return;
    const liked = !likes.includes(p.id);
    setLikes((prev) => (liked ? [...prev, p.id] : prev.filter((id) => id !== p.id)));
    setItems((prev) =>
      prev.map((it) =>
        it.id === p.id ? { ...it, like_count: Math.max(0, it.like_count + (liked ? 1 : -1)) } : it,
      ),
    );
    try {
      await toggleLikePreset({ data: { id: p.id, liked } });
    } catch {
      /* optimistic only */
    }
  }

  async function onCopy(p: Preset) {
    try {
      await navigator.clipboard.writeText(JSON.stringify({ name: p.name, data: p.data }, null, 2));
      setCopied(p.id);
      setTimeout(() => setCopied(null), 2000);
      if (p.official) return;
      await fetch("/api/public/presets/copied", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: p.id }),
      });
    } catch {
      /* clipboard denied */
    }
  }

  async function onDelete(p: Preset) {
    try {
      await deleteMyPreset({ data: { id: p.id } });
      setItems((prev) => prev.filter((it) => it.id !== p.id));
    } catch {
      /* ignore */
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl pb-24 pt-7">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Presets</h1>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          The presets that come with Wallraven, plus ones people have shared. Copying only brings
          across searches, filters and colours — never your own timetable, screen resolution, aspect
          ratio or API key. Publish your own from the app's Presets card.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {(["popular", "new"] as Sort[]).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                sort === s ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-accent"
              }`}
            >
              {s === "popular" ? "Most popular" : "Newest"}
            </button>
          ))}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-xs"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search presets…"
            className="min-w-40 flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-xs"
          />
        </div>

        {loading ? (
          <p className="mt-8 text-sm text-muted-foreground">Loading presets…</p>
        ) : error ? (
          <p className="mt-8 text-sm text-destructive">{error}</p>
        ) : items.length === 0 ? (
          <p className="mt-8 text-sm text-muted-foreground">
            No presets published yet. Be the first — share one from the desktop app.
          </p>
        ) : (
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {items.map((p) => (
              <li key={p.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-medium">{p.name}</h2>
                    <p className="text-xs text-muted-foreground">
                      {p.category} · by {p.author_name}
                    </p>
                  </div>
                  {p.official ? (
                    <span className="rounded-md border border-primary/40 px-2 py-1 text-[10px] font-medium text-primary">
                      Included
                    </span>
                  ) : (
                    <button
                      onClick={() => onLike(p)}
                      disabled={!signedIn}
                      title={signedIn ? "Like this preset" : "Sign in to like presets"}
                      className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                        likes.includes(p.id) ? "border-primary text-primary" : "border-input hover:bg-accent"
                      } disabled:opacity-50`}
                    >
                      ♥ {p.like_count}
                    </button>
                  )}
                </div>

                {p.description && <p className="mt-2 text-xs text-muted-foreground">{p.description}</p>}
                <p className="mt-2 text-xs text-muted-foreground">{summarise(p.data)}</p>
                <PresetThumb data={p.data} name={p.name} />

                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => onCopy(p)}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    {copied === p.id ? "Copied!" : "Copy preset"}
                  </button>
                  {!p.official && (
                    <span className="text-xs text-muted-foreground">{p.copy_count} copies</span>
                  )}
                  {mineIds.includes(p.id) && (
                    <button
                      onClick={() => onDelete(p)}
                      className="ml-auto text-xs text-muted-foreground underline hover:text-destructive"
                    >
                      Delete mine
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
    </main>
  );
}
