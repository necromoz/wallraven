import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { allow } from "@/lib/rate-limit";
import { normaliseUserCode } from "@/lib/pairing-codes";

// Approving a pairing request, from the website side.
//
// Both functions are keyed on the user code, which the person types in after
// reading it off the desktop app. Previously the code arrived in the /link URL
// and the page approved whatever it was given, which meant a link was enough to
// take over an account. Making the human transcribe the code is the whole
// defence: it requires sight of the screen of the device being paired.
//
// Everything here runs behind requireSupabaseAuth, so an unauthenticated caller
// gets nothing, and the tokens handed over are always the caller's own.

const codeSchema = z.object({ code: z.string().min(1).max(64) });

const approveSchema = z.object({
  code: z.string().min(1).max(64),
  access_token: z.string().min(10),
  refresh_token: z.string().min(10),
  expires_at: z.number().optional(),
});

/**
 * Guessing is limited per signed-in account rather than per IP: the attacker we
 * care about here has an account of their own and is trying codes against
 * someone else's pending pairing. Thirty attempts an hour is far more than a
 * person fat-fingering an eight-character code will ever need.
 *
 * This is defence in depth, not the main protection. The limiter holds state in
 * the memory of one server instance, and on Cloudflare Workers that means one
 * isolate, so a determined attacker can get fresh allowances by spreading
 * requests around. What actually makes guessing impractical is the size of the
 * code itself. See src/lib/pairing-codes.ts.
 */
function guessAllowance(userId: string) {
  return allow(`pair-approve:${userId}`, 30, 60 * 60 * 1000);
}

export const getPairingInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => codeSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!guessAllowance(context.userId)) return { status: "rate_limited" as const };

    const code = normaliseUserCode(data.code);
    // A malformed code and a code that does not exist get the same answer. The
    // person typing sees "check the code and try again" either way, and an
    // attacker learns nothing about which codes are live.
    if (!code) return { status: "not_found" as const };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("device_pairings")
      .select("device_name, expires_at, session")
      .eq("code", code)
      .maybeSingle();

    if (!row) return { status: "not_found" as const };
    if (new Date(row.expires_at).getTime() < Date.now()) return { status: "expired" as const };
    if (row.session) return { status: "already_approved" as const };

    // device_name is supplied by whatever called /start, so it is a label, not
    // evidence. The page presents it as something the device claims about
    // itself rather than as a verified fact.
    return { status: "pending" as const, deviceName: row.device_name };
  });

export const approvePairing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => approveSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!guessAllowance(context.userId)) {
      throw new Error("Too many attempts. Wait a few minutes and try again.");
    }

    const code = normaliseUserCode(data.code);
    if (!code) throw new Error("That code is not valid. Check it and try again.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row } = await supabaseAdmin
      .from("device_pairings")
      .select("id, expires_at, session")
      .eq("code", code)
      .maybeSingle();

    if (!row) throw new Error("That code is not valid. Check it and try again.");
    if (new Date(row.expires_at).getTime() < Date.now()) {
      throw new Error("That request expired. Start again from the app.");
    }
    if (row.session) throw new Error("That request was already used.");

    // Conditional on session still being null, so two approvals racing each
    // other cannot both write. The loser sees no rows updated and is told the
    // request was already used, rather than silently overwriting the winner.
    const { data: updated, error } = await supabaseAdmin
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
      .eq("id", row.id)
      .is("session", null)
      .select("id");

    if (error) throw new Error("Could not link the app. Please try again.");
    if (!updated || updated.length === 0) throw new Error("That request was already used.");
    return { ok: true };
  });
