import { createFileRoute } from "@tanstack/react-router";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";

import { allow, clientKey, tooManyRequests } from "@/lib/rate-limit";
import { formatUserCode, generateUserCode } from "@/lib/pairing-codes";

// Begin pairing a desktop app with an account.
//
// What changed, and why it mattered:
//
// This endpoint used to accept a pairing code chosen by the caller, and it
// answered any website on the internet because of a wildcard CORS header. That
// combination was a one-click account takeover. An attacker registered a code
// of their own choosing, sent the victim a link to /link carrying that code,
// and the victim — already signed in, and shown nothing that distinguished the
// request from a real one — pressed a button that handed over their access and
// refresh tokens.
//
// Now the server chooses both codes, and the human has to read one off the
// device that is actually asking. A code obtained by an attacker is useless
// without physical sight of the victim's screen.
//
// There are no CORS headers any more. The desktop app is an Electron main
// process making a plain HTTPS request, which has no origin and never needed
// them. Their only effect was to let a web page in a victim's browser drive
// this endpoint, so they are gone rather than narrowed.

const bodySchema = z.object({
  device_name: z.string().max(120).optional(),
});

const PAIRING_TTL_MS = 10 * 60 * 1000;

export const Route = createFileRoute("/api/public/pair/start")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!allow(clientKey(request, "pair-start"), 20, 10 * 60 * 1000)) {
          return tooManyRequests({}, 600);
        }

        let parsed;
        try {
          parsed = bodySchema.parse(await request.json().catch(() => ({})));
        } catch {
          return Response.json({ error: "invalid_request" }, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Opportunistic cleanup: pairing rows are short-lived and nothing else
        // reaps them.
        await supabaseAdmin
          .from("device_pairings")
          .delete()
          .lt("expires_at", new Date().toISOString());

        // The device code is the secret half. It is never displayed, never put
        // in a URL, and only its hash is stored, so a dump of this table does
        // not let anyone collect a pending session.
        const deviceCode = randomBytes(32).toString("base64url");
        const deviceCodeHash = createHash("sha256").update(deviceCode).digest("hex");

        // `code` is UNIQUE, so a collision is a genuine (if vanishingly rare)
        // possibility rather than something to assume away. Retry a few times
        // and fail honestly if the dice really are against us.
        let userCode = "";
        let inserted = false;
        for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
          userCode = generateUserCode((n) => Uint8Array.from(randomBytes(n)));
          const { error } = await supabaseAdmin.from("device_pairings").insert({
            code: userCode,
            verifier_hash: deviceCodeHash,
            device_name: parsed.device_name ?? null,
            expires_at: new Date(Date.now() + PAIRING_TTL_MS).toISOString(),
          });
          if (!error) inserted = true;
        }

        if (!inserted) {
          return Response.json({ error: "could_not_start" }, { status: 503 });
        }

        return Response.json({
          device_code: deviceCode,
          user_code: formatUserCode(userCode),
          verification_uri: new URL("/link", request.url).toString(),
          expires_in: Math.floor(PAIRING_TTL_MS / 1000),
          interval: 3,
        });
      },
    },
  },
});
