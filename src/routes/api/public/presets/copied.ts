import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { allow, clientKey, tooManyRequests } from "@/lib/rate-limit";

const bodySchema = z.object({ id: z.string().uuid() });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const Route = createFileRoute("/api/public/presets/copied")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        let parsed;
        try {
          parsed = bodySchema.parse(await request.json());
        } catch {
          return Response.json({ error: "invalid_request" }, { status: 400, headers: cors });
        }

        // One count per visitor per preset per hour, plus a global per-visitor
        // cap: stops the counter being inflated in a loop.
        if (!allow(clientKey(request, `copied:${parsed.id}`), 1, 60 * 60 * 1000)) {
          return Response.json({ ok: true, counted: false }, { headers: cors });
        }
        if (!allow(clientKey(request, "copied"), 60, 60 * 60 * 1000)) {
          return tooManyRequests(cors, 600);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Atomic increment in the database — a read-then-write loses counts
        // when two people copy the same preset at the same time.
        const { data, error } = await supabaseAdmin.rpc("increment_preset_copy_count", {
          _preset_id: parsed.id,
        });

        if (error) {
          return Response.json({ error: "update_failed" }, { status: 500, headers: cors });
        }
        if (!data) {
          return Response.json({ error: "not_found" }, { status: 404, headers: cors });
        }

        return Response.json({ ok: true, counted: true }, { headers: cors });
      },
    },
  },
});
