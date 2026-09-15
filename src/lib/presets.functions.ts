import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

const PRESET_COLUMNS =
  "id, name, description, category, tags, author_name, data, like_count, copy_count, created_at";

const listSchema = z.object({
  category: z.string().max(40).optional(),
  search: z.string().max(80).optional(),
  sort: z.enum(["popular", "new"]).default("popular"),
  limit: z.number().int().min(1).max(100).default(48),
});

// PostgREST parses commas as clause separators and parentheses as grouping
// inside an `or=` filter, so interpolating a raw search term let a caller
// escape the intended condition and filter on any column. It also meant anyone
// typing a comma in the search box got a 400 and an empty gallery.
//
// Strip the characters that carry meaning in the filter grammar. `*` goes too,
// since the wildcards are supplied by the query itself.
function sanitiseSearchTerm(term: string) {
  return term.replace(/[,()*"\\]/g, " ").replace(/\s+/g, " ").trim();
}

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export const listCommunityPresets = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => listSchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    const supabase = publicClient();
    let query = supabase
      .from("community_presets")
      .select(PRESET_COLUMNS)
      .eq("hidden", false)
      .limit(data.limit);

    if (data.category) query = query.eq("category", data.category);
    const search = data.search ? sanitiseSearchTerm(data.search) : "";
    if (search) query = query.or(`name.ilike.*${search}*,description.ilike.*${search}*`);

    query =
      data.sort === "new"
        ? query.order("created_at", { ascending: false })
        : query.order("copy_count", { ascending: false });

    const { data: rows, error } = await query;
    if (error) return { items: [], error: "Could not load presets right now." };
    return { items: rows ?? [], error: null as string | null };
  });

export const listMyPresets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("community_presets")
      .select(PRESET_COLUMNS)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) return { items: [] };
    return { items: data ?? [] };
  });

export const listMyLikes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("preset_likes").select("preset_id");
    return { ids: (data ?? []).map((r) => r.preset_id) };
  });

export const toggleLikePreset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid(), liked: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    // The result was discarded and ok:true returned regardless, so a like
    // rejected by RLS or lost to a unique-constraint collision still rendered
    // as though it had worked until the next refresh.
    const { error } = data.liked
      ? await context.supabase.from("preset_likes").insert({ preset_id: data.id, user_id: context.userId })
      : await context.supabase
          .from("preset_likes")
          .delete()
          .eq("preset_id", data.id)
          .eq("user_id", context.userId);

    if (error) return { ok: false as const, liked: !data.liked, error: "Could not save that." };
    return { ok: true as const, liked: data.liked };
  });

export const deleteMyPreset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("community_presets")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error("Could not delete that preset.");
    return { ok: true };
  });
