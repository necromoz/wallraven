// The presets that ship with the desktop app, exposed on the website so the
// Presets page is never empty. Same source file the app reads, so the two
// listings can never drift apart.
import raw from "../../electron/builtin-presets.json";

export type OfficialPreset = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  tags: string[];
  author_name: string;
  data: Record<string, unknown>;
  like_count: number;
  copy_count: number;
  created_at: string;
  official: true;
};

type RawPreset = {
  id: string;
  name: string;
  category: string;
  description?: string;
  data?: Record<string, unknown>;
};

// The shipped file stores a short `cats` array; presets everywhere else use the
// expanded shape, so normalise once here.
function expand(d: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...d };
  const cats = d["cats"];
  if (Array.isArray(cats)) {
    out["categories"] = {
      general: cats.includes("general"),
      anime: cats.includes("anime"),
      people: cats.includes("people"),
    };
    delete out["cats"];
  }
  if (out["purity"] === undefined) out["purity"] = { sfw: true, sketchy: false, nsfw: false };
  if (out["aiArtFilter"] === undefined) out["aiArtFilter"] = 1;
  if (out["sorting"] === undefined) out["sorting"] = "random";
  if (out["colors"] === undefined) out["colors"] = [];
  return out;
}

export const OFFICIAL_PRESET_CATEGORIES: string[] = (raw as { categories?: string[] }).categories ?? [];

export const OFFICIAL_PRESETS: OfficialPreset[] = ((raw as { presets?: RawPreset[] }).presets ?? []).map(
  (p) => ({
    id: `official:${p.id}`,
    name: p.name,
    description: p.description ?? null,
    category: p.category,
    tags: [],
    author_name: "Wallraven",
    data: expand(p.data ?? {}),
    like_count: 0,
    copy_count: 0,
    created_at: "",
    official: true as const,
  }),
);

export function filterOfficialPresets(category: string, search: string): OfficialPreset[] {
  const q = search.trim().toLowerCase();
  return OFFICIAL_PRESETS.filter((p) => {
    if (category && p.category !== category) return false;
    if (!q) return true;
    const hay = `${p.name} ${p.description ?? ""} ${String(p.data["query"] ?? "")}`.toLowerCase();
    return hay.includes(q);
  });
}
