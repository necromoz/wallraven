import { createFileRoute } from "@tanstack/react-router";
import { allow, clientKey, tooManyRequests } from "@/lib/rate-limit";

// Returns a Wallhaven preview thumbnail for a preset's search, so gallery
// cards can show what the preset actually looks like. Read-only proxy of
// Wallhaven's public search endpoint; no key, no user data.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const cache = new Map<string, { url: string | null; at: number }>();
const TTL = 1000 * 60 * 60 * 6;
const CACHE_MAX = 500;

function remember(key: string, value: { url: string | null; at: number }) {
  // Keep the map bounded: oldest insertion first out.
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

function firstGroup(query: string) {
  return (
    String(query || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)[0] ?? ""
  );
}

function bits(raw: string | null, fallback: string) {
  return raw && /^[01]{3}$/.test(raw) && raw !== "000" ? raw : fallback;
}

export const Route = createFileRoute("/api/public/presets/thumb")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      GET: async ({ request }) => {
        if (!allow(clientKey(request, "thumb"), 120, 60 * 1000)) {
          return tooManyRequests(cors, 60);
        }
        const url = new URL(request.url);

        const q = firstGroup(url.searchParams.get("q") ?? "").slice(0, 120);
        const categories = bits(url.searchParams.get("categories"), "111");
        // Never surface anything beyond SFW on the public website.
        const purity = "100";
        const sorting = [
          "toplist",
          "relevance",
          "random",
          "date_added",
          "views",
          "favorites",
        ].includes(url.searchParams.get("sorting") ?? "")
          ? url.searchParams.get("sorting")!
          : "toplist";

        const key = `${q}|${categories}|${sorting}`;
        const hit = cache.get(key);
        if (hit && Date.now() - hit.at < TTL) {
          return Response.json(
            { url: hit.url },
            { headers: { ...cors, "cache-control": "public, max-age=21600" } },
          );
        }

        const params = new URLSearchParams({ categories, purity, sorting, page: "1" });
        if (q) params.set("q", q);
        if (sorting === "toplist") params.set("topRange", "1y");

        let thumb: string | null = null;
        try {
          const res = await fetch(`https://wallhaven.cc/api/v1/search?${params.toString()}`, {
            headers: { accept: "application/json", "user-agent": "WallRaven-Web/1.0" },
          });
          if (res.ok) {
            const body = (await res.json()) as {
              data?: Array<{ thumbs?: { small?: string; original?: string }; path?: string }>;
            };
            const item = body.data?.[0];
            thumb = item?.thumbs?.small ?? item?.thumbs?.original ?? null;
          }
        } catch {
          thumb = null;
        }

        remember(key, { url: thumb, at: Date.now() });
        return Response.json(
          { url: thumb },
          { headers: { ...cors, "cache-control": "public, max-age=21600" } },
        );
      },
    },
  },
});
