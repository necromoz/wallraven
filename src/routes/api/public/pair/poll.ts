import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { allow, clientKey, tooManyRequests } from "@/lib/rate-limit";

// The desktop app collects its session here once the person has approved the
// request on the website.
//
// The app presents only the device code it was issued at /start. It no longer
// sends the user code: that one is for a human to read and type, and having the
// app send it too would have meant a stolen user code was enough to collect the
// session.
//
// As at /start, there are no CORS headers. The caller is an Electron main
// process, not a browser.

const bodySchema = z.object({
  device_code: z.string().min(16).max(200),
});

export const Route = createFileRoute("/api/public/pair/poll")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // A device pairing legitimately polls every few seconds for up to ten
        // minutes, so this has to be generous. It is not the thing standing
        // between an attacker and a session: the device code's own size is.
        if (!allow(clientKey(request, "pair-poll"), 240, 60 * 1000)) {
          return tooManyRequests({}, 60);
        }

        let parsed;
        try {
          parsed = bodySchema.parse(await request.json());
        } catch {
          return Response.json({ error: "invalid_request" }, { status: 400 });
        }

        const deviceCodeHash = createHash("sha256").update(parsed.device_code).digest("hex");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Look the row up by the hash rather than by the user code. The device
        // code is the only thing the app proves it holds, so it is the only
        // thing that should select a row.
        const { data: row } = await supabaseAdmin
          .from("device_pairings")
          .select("id, verifier_hash, session, claimed, expires_at")
          .eq("verifier_hash", deviceCodeHash)
          .maybeSingle();

        // Constant-time even though the lookup above already matched: the
        // column is indexed on equality, and this keeps the comparison honest
        // if that ever changes.
        const hashMatches = (stored: string | null | undefined, given: string) => {
          if (!stored || stored.length !== given.length) return false;
          return timingSafeEqual(Buffer.from(stored), Buffer.from(given));
        };

        if (!row || !hashMatches(row.verifier_hash, deviceCodeHash)) {
          return Response.json({ status: "not_found" }, { status: 404 });
        }

        if (new Date(row.expires_at).getTime() < Date.now()) {
          await supabaseAdmin.from("device_pairings").delete().eq("id", row.id);
          return Response.json({ status: "expired" }, { status: 410 });
        }

        if (!row.session || row.claimed) {
          return Response.json({ status: "pending" });
        }

        // Single use. Burn the row before handing the session over, so a
        // retried or duplicated request cannot collect the same tokens twice.
        await supabaseAdmin.from("device_pairings").delete().eq("id", row.id);

        return Response.json({ status: "ok", session: row.session });
      },
    },
  },
});
