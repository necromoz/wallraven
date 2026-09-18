// Where the WallRaven website lives.
//
// This used to be spelled out in six places across main.cjs and cloud.cjs,
// split between two different hostnames, which is how the app ended up asking
// one host for updates and a different one for sign-in. Everything goes
// through here now, so moving the site is a one-line change rather than a
// search-and-replace that misses one.
//
// Order is preference. wallraven.app is the real address; the Lovable one is
// kept only while the site is still served from there, and should be deleted
// once it is not.
const SITE_ORIGINS = ["https://wallraven.app", "https://wallraven.lovable.app"];

// The origin to use when there is only room for one.
const SITE_ORIGIN = SITE_ORIGINS[0];

// The hosts a site request may legitimately end up on, including after a
// redirect. Used to decide whether following a Location header is safe: these
// requests can carry an access token, so they must never chase one off to
// somewhere else.
const SITE_HOSTS = new Set(SITE_ORIGINS.map((o) => new URL(o).hostname));

/** The same path on every known origin, in preference order. */
function siteUrls(path) {
  return SITE_ORIGINS.map((origin) => origin + path);
}

/** True when a redirect target is still one of ours, over https. */
function isSiteUrl(value) {
  try {
    const u = new URL(String(value));
    return u.protocol === "https:" && SITE_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

module.exports = { SITE_ORIGINS, SITE_ORIGIN, SITE_HOSTS, siteUrls, isSiteUrl };
