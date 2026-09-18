import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { allow, clientKey, tooManyRequests } from "@/lib/rate-limit";

const bodySchema = z.object({
  kind: z.enum(["bug", "feature", "feedback", "crash"]).default("feedback"),
  message: z.string().trim().min(5).max(4000),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  appVersion: z.string().trim().max(40).optional(),
  platform: z.string().trim().max(60).optional(),
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const Route = createFileRoute("/api/public/feedback")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        // Loose cap first so malformed floods can't spin the server, then a
        // tight cap that only counts genuine submissions — a typo'd form
        // should never lock someone out of reporting a bug.
        if (!allow(clientKey(request, "feedback-raw"), 30, 10 * 60 * 1000)) {
          return tooManyRequests(cors, 600);
        }
        let parsed;

        try {
          parsed = bodySchema.parse(await request.json());
        } catch {
          return Response.json({ error: "invalid_request" }, { status: 400, headers: cors });
        }

        if (!allow(clientKey(request, "feedback"), 5, 10 * 60 * 1000)) {
          return tooManyRequests(cors, 600);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { error } = await supabaseAdmin.from("feedback").insert({
          kind: parsed.kind,
          message: parsed.message,
          email: parsed.email || null,
          app_version: parsed.appVersion ?? null,
          platform: parsed.platform ?? null,
        });

        if (error) {
          return Response.json({ error: "insert_failed" }, { status: 500, headers: cors });
        }
        return Response.json({ ok: true }, { headers: cors });
      },
    },
  },
});
