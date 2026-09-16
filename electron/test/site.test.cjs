// Tests for the site origin helper and the redirect rule that depends on it.
//
// These exist because of a real failure: wallraven.lovable.app began answering
// every request with a 307 to wallraven.app, cloud.cjs did not follow
// redirects, and sign-in started reporting "check your internet connection" to
// people whose internet was fine. Silent, and blamed the user.
//
// Run with: node electron/test/site.test.cjs

const assert = require("assert");
const site = require("../site.cjs");

let passed = 0;
let failed = 0;

function check(label, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    console.error(`FAIL  ${label}`);
    console.error(`      ${err.message}`);
  }
}

console.log("site origins");

check("prefers the real domain over the Lovable one", () => {
  assert.strictEqual(site.SITE_ORIGIN, "https://wallraven.app");
  assert.strictEqual(site.SITE_ORIGINS[0], "https://wallraven.app");
});

check("every origin is https", () => {
  for (const o of site.SITE_ORIGINS) {
    assert.ok(o.startsWith("https://"), `${o} is not https`);
  }
});

check("siteUrls keeps preference order and appends the path", () => {
  const urls = site.siteUrls("/updates/latest.json");
  assert.strictEqual(urls.length, site.SITE_ORIGINS.length);
  assert.strictEqual(urls[0], "https://wallraven.app/updates/latest.json");
  assert.ok(urls.every((u) => u.endsWith("/updates/latest.json")));
});

console.log("redirect safety");

check("accepts a redirect to one of our own hosts", () => {
  assert.strictEqual(site.isSiteUrl("https://wallraven.app/api/public/pair/poll"), true);
  assert.strictEqual(site.isSiteUrl("https://wallraven.lovable.app/x"), true);
});

check("refuses a redirect to anywhere else", () => {
  // These requests carry an access token. Following a Location header to a
  // host we do not control would hand it over.
  for (const url of [
    "https://evil.example/x",
    "https://wallraven.app.evil.example/x",
    "https://notwallraven.app/x",
    "https://evilwallraven.app/x",
  ]) {
    assert.strictEqual(site.isSiteUrl(url), false, `accepted ${url}`);
  }
});

check("refuses plain http even on our own host", () => {
  assert.strictEqual(site.isSiteUrl("http://wallraven.app/x"), false);
});

check("refuses anything that is not a URL", () => {
  for (const value of ["", "not a url", "/relative/path", null, undefined, 42, {}]) {
    assert.strictEqual(site.isSiteUrl(value), false, `accepted ${String(value)}`);
  }
});

console.log("the app no longer hardcodes the site anywhere else");

check("main.cjs and cloud.cjs go through site.cjs", () => {
  const fs = require("fs");
  const path = require("path");
  for (const name of ["main.cjs", "cloud.cjs"]) {
    const src = fs.readFileSync(path.join(__dirname, "..", name), "utf8");
    const hits = src.match(/https:\/\/wallraven[a-z.]*/g) || [];
    assert.deepStrictEqual(
      hits,
      [],
      `${name} hardcodes ${hits.join(", ")} instead of using site.cjs`,
    );
  }
});

check("cloud.cjs follows redirects at all", () => {
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(path.join(__dirname, "..", "cloud.cjs"), "utf8");
  assert.ok(
    /redirectsLeft/.test(src),
    "the redirect handling is gone; sign-in will break again the next time a host redirects",
  );
  assert.ok(
    /isSiteUrl\(/.test(src),
    "redirects are being followed without checking the target host",
  );
});

console.log();
if (failed) {
  console.error(`${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`${passed} passed`);
