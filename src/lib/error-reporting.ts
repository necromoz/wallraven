// Reports an unhandled error the site's own root error boundary caught.
//
// This used to call window.__lovableEvents?.captureException -- an object
// only ever injected by Lovable's own editor iframe. In production that
// object never existed, so every call silently did nothing: the site had no
// working error reporting at all, and a crash a visitor hit would never be
// seen here.
//
// Posts to the same /api/public/feedback endpoint and table the Electron
// app's own crash reporter already uses (kind: "crash"), so this adds no new
// infrastructure and keeps the same "our own database, no third party"
// approach. Unlike the app's crash reporter, there is no local store to
// review before sending -- a crashed tab has no settings panel to come back
// to -- so this fires automatically in the background. It never throws and
// never blocks the error page from rendering; a failed report is just a
// report that didn't arrive, not a second crash.
//
// Scope: this only covers errors the root route's errorComponent catches,
// i.e. React render-time errors. An unhandled promise rejection in an event
// handler, for instance, is not caught by a React error boundary and is not
// reported by this.

const ENDPOINT = "/api/public/feedback";
const MAX_MESSAGE = 4000;

function describe(error: unknown): string {
  if (error instanceof Error) {
    return [error.message, error.stack].filter(Boolean).join("\n\n");
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function reportError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined" || typeof fetch === "undefined") return;

  const parts = [
    describe(error),
    `route: ${window.location.pathname}`,
    ...Object.entries(context).map(([k, v]) => `${k}: ${String(v)}`),
  ];
  const message = parts.join("\n").slice(0, MAX_MESSAGE);

  void fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "crash", message, platform: "web" }),
    keepalive: true,
  }).catch(() => {
    // Best-effort. A page that's already broken does not need a second
    // failure surfaced for the report that was trying to describe the first.
  });
}
