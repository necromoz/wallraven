import { useEffect, useState } from "react";

// What the site says you can download.
//
// The version and the link used to be typed into the page by hand, so the
// homepage offered 0.8.13 for weeks after 1.2.0 shipped, from a URL on the old
// host that no longer serves anything. Both now come from the same file the
// app's own updater reads, so publishing a release updates the site with it.

export type LatestRelease = {
  version: string;
  url: string;
  pageUrl: string;
};

// Used until the manifest answers, and if it never does. The releases page
// always redirects to the newest one, so the worst case is one extra click
// rather than a broken download.
export const RELEASES_PAGE = "https://github.com/wallraven-app/wallraven/releases/latest";

export function useLatestRelease(): LatestRelease | null {
  const [release, setRelease] = useState<LatestRelease | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/updates/latest.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data || typeof data.version !== "string") return;
        setRelease({
          version: data.version,
          url: typeof data.url === "string" && data.url ? data.url : RELEASES_PAGE,
          pageUrl: typeof data.pageUrl === "string" && data.pageUrl ? data.pageUrl : RELEASES_PAGE,
        });
      })
      .catch(() => {
        /* the fallback below covers it */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return release;
}
