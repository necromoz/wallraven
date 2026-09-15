import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { allow, clientKey, tooManyRequests } from "@/lib/rate-limit";


const bodySchema = z.object({
  code: z.string().min(6).max(64),
  verifier_hash: z.string().length(64),
  device_name: z.string().max(120).optional(),
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const Route = createFileRoute("/api/public/pair/start")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        if (!allow(clientKey(request, "pair-start"), 20, 10 * 60 * 1000)) {
          return tooManyRequests(cors, 600);
        }
        let parsed;

        try {
          parsed = bodySchema.parse(await request.json());
        } catch {
          return Response.json({ error: "invalid_request" }, { status: 400, headers: cors });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Clean up expired rows opportunistically.
        await supabaseAdmin
          .from("device_pairings")
          .delete()
          .lt("expires_at", new Date().toISOString());

        const { error } = await supabaseAdmin.from("device_pairings").insert({
          code: parsed.code,
          verifier_hash: parsed.verifier_hash,
          device_name: parsed.device_name ?? null,
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        });

        if (error) {
          return Response.json({ error: "could_not_start" }, { status: 400, headers: cors });
        }

        return Response.json({ ok: true, expires_in: 300 }, { headers: cors });
      },
    },
  },
});
