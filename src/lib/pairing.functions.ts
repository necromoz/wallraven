import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const approveSchema = z.object({
  code: z.string().min(6).max(64),
  access_token: z.string().min(10),
  refresh_token: z.string().min(10),
  expires_at: z.number().optional(),
});

export const getPairingInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string }) => z.object({ code: z.string().min(6).max(64) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("device_pairings")
      .select("device_name, expires_at, session")
      .eq("code", data.code)
      .maybeSingle();

    if (!row) return { status: "not_found" as const };
    if (new Date(row.expires_at).getTime() < Date.now()) return { status: "expired" as const };
    if (row.session) return { status: "already_approved" as const };
    return { status: "pending" as const, deviceName: row.device_name };
  });

export const approvePairing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => approveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row } = await supabaseAdmin
      .from("device_pairings")
      .select("id, expires_at, session")
      .eq("code", data.code)
      .maybeSingle();

    if (!row) throw new Error("This pairing request no longer exists.");
    if (new Date(row.expires_at).getTime() < Date.now()) {
      throw new Error("This pairing request has expired. Start again from the app.");
    }
    if (row.session) throw new Error("This pairing request was already used.");

    const { error } = await supabaseAdmin
      .from("device_pairings")
      .update({
        user_id: context.userId,
        approved_at: new Date().toISOString(),
        session: {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: data.expires_at ?? null,
        },
      })
      .eq("id", row.id);

    if (error) throw new Error("Could not link the app. Please try again.");
    return { ok: true };
  });
