import { createFileRoute } from "@tanstack/react-router";
import { allow, clientKey, tooManyRequests } from "@/lib/rate-limit";

// Streams a Wallhaven preview thumbnail through our own domain. Some networks,
// DNS filters and privacy extensions block th.wallhaven.cc outright, which left
// preset cards blank even though the lookup succeeded. Serving the bytes from
// wallraven.app makes previews load everywhere.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const ALLOWED_HOSTS = new Set(["th.wallhaven.cc", "w.wallhaven.cc", "wallhaven.cc"]);

export const Route = createFileRoute("/api/public/presets/image")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      GET: async ({ request }) => {
        if (!allow(clientKey(request, "preset-image"), 600, 60 * 1000)) {
          return tooManyRequests(cors, 60);
        }

        const raw = new URL(request.url).searchParams.get("u") ?? "";
        let target: URL;
        try {
          target = new URL(raw);
        } catch {
          return new Response("Bad request", { status: 400, headers: cors });
        }
        if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) {
          return new Response("Forbidden", { status: 403, headers: cors });
        }

        try {
          const res = await fetch(target.toString(), {
            headers: { accept: "image/*", "user-agent": "WallRaven-Web/1.0" },
          });
          if (!res.ok || !res.body) {
            return new Response("Upstream error", { status: 502, headers: cors });
          }
          return new Response(res.body, {
            status: 200,
            headers: {
              ...cors,
              "content-type": res.headers.get("content-type") ?? "image/jpeg",
              "cache-control": "public, max-age=604800, immutable",
            },
          });
        } catch {
          return new Response("Upstream error", { status: 502, headers: cors });
        }
      },
    },
  },
});
