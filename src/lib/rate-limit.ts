// Simple in-memory sliding-window limiter for public HTTP endpoints.
// Per server instance (not distributed) — enough to blunt scripted abuse
// of the unauthenticated endpoints without adding infrastructure.

type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 5000;

export function clientKey(request: Request, scope: string) {
  // Order matters. cf-connecting-ip is set by Cloudflare on the way in and
  // overwrites anything the caller sent, so it cannot be forged. x-forwarded-for
  // is caller-supplied unless a trusted proxy rewrites it, so reading it first
  // let anyone bypass every limit on every public endpoint simply by varying
  // their own header. It stays only as a fallback for running behind something
  // other than Cloudflare.
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ||
    "unknown";
  return `${scope}:${ip}`;
}

/** Returns true when the caller is allowed through. */
export function allow(key: string, limit: number, windowMs: number) {
  const now = Date.now();

  // Bound memory: drop the oldest half once the map gets large.
  if (buckets.size > MAX_KEYS) {
    let dropped = 0;
    for (const k of buckets.keys()) {
      buckets.delete(k);
      if (++dropped > MAX_KEYS / 2) break;
    }
  }

  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= limit) {
    buckets.set(key, bucket);
    return false;
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  return true;
}

export function tooManyRequests(headers: Record<string, string>, retryAfterSec = 60) {
  return Response.json(
    { error: "rate_limited" },
    { status: 429, headers: { ...headers, "retry-after": String(retryAfterSec) } },
  );
}
