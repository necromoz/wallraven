import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { allow, clientKey, tooManyRequests } from "@/lib/rate-limit";


const bodySchema = z.object({
  code: z.string().min(6).max(64),
  verifier: z.string().min(16).max(200),
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const Route = createFileRoute("/api/public/pair/poll")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        // Legit devices poll every couple of seconds while pairing; this only
        // stops scripted guessing of codes/verifiers.
        if (!allow(clientKey(request, "pair-poll"), 120, 60 * 1000)) {
          return tooManyRequests(cors, 60);
        }
        let parsed;

        try {
          parsed = bodySchema.parse(await request.json());
        } catch {
          return Response.json({ error: "invalid_request" }, { status: 400, headers: cors });
        }

        const verifierHash = createHash("sha256").update(parsed.verifier).digest("hex");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: row } = await supabaseAdmin
          .from("device_pairings")
          .select("id, verifier_hash, session, claimed, expires_at")
          .eq("code", parsed.code)
          .maybeSingle();

        const hashMatches = (a: string | null | undefined, b: string) => {
          if (!a || a.length !== b.length) return false;
          return timingSafeEqual(Buffer.from(a), Buffer.from(b));
        };

        if (!row || !hashMatches(row.verifier_hash, verifierHash)) {
          return Response.json({ status: "not_found" }, { status: 404, headers: cors });
        }


        if (new Date(row.expires_at).getTime() < Date.now()) {
          await supabaseAdmin.from("device_pairings").delete().eq("id", row.id);
          return Response.json({ status: "expired" }, { status: 410, headers: cors });
        }

        if (!row.session || row.claimed) {
          return Response.json({ status: "pending" }, { headers: cors });
        }

        // Single use: burn the row immediately.
        await supabaseAdmin.from("device_pairings").delete().eq("id", row.id);

        return Response.json({ status: "ok", session: row.session }, { headers: cors });
      },
    },
  },
});
