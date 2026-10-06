// Credits for the wallpaper on screen come from Wallhaven's per-wallpaper API,
// and both the uploader name and the "source" field are typed by strangers.
// These check that only a real http(s) link is ever passed on to be opened,
// and that uploader and source stay separate.
//
// Run with: node electron/test/credits.test.cjs

const assert = require("assert");
const { MAIN, extractFrom } = require("./sources.cjs");

const parseCredits = new Function(`${extractFrom(MAIN, "parseCredits")}; return parseCredits;`)();

let passed = 0;
let failed = 0;
function check(label, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.error("FAIL", label, "\n ", e.message);
  }
}

check("a normal wallpaper gives source, uploader and page", () => {
  const c = parseCredits({
    id: "gwq6me",
    source: "https://www.pixiv.net/en/artworks/123",
    uploader: { username: "someone" },
  });
  assert.strictEqual(c.source, "https://www.pixiv.net/en/artworks/123");
  assert.strictEqual(c.sourceHost, "pixiv.net");
  assert.strictEqual(c.uploader, "someone");
  assert.strictEqual(c.uploaderUrl, "https://wallhaven.cc/user/someone");
  assert.strictEqual(c.page, "https://wallhaven.cc/w/gwq6me");
});

check("no source is reported as none, not as an empty link", () => {
  const c = parseCredits({ id: "abc123", source: "", uploader: { username: "x" } });
  assert.strictEqual(c.source, null);
  assert.strictEqual(c.sourceHost, null);
});

check("a source that is not http(s) is dropped", () => {
  for (const bad of ["javascript:alert(1)", "file:///C:/Windows", "ms-settings:", "not a url", "  "]) {
    const c = parseCredits({ id: "a", source: bad, uploader: { username: "x" } });
    assert.strictEqual(c.source, null, bad);
  }
});

check("a strange uploader name is escaped into the profile link", () => {
  const c = parseCredits({ id: "a", source: "", uploader: { username: "a/b?c" } });
  assert.strictEqual(c.uploaderUrl, "https://wallhaven.cc/user/a%2Fb%3Fc");
});

check("missing data gives nothing rather than throwing", () => {
  assert.strictEqual(parseCredits(null), null);
  const c = parseCredits({});
  assert.strictEqual(c.uploader, null);
  assert.strictEqual(c.page, null);
});

console.log(`${passed} passed${failed ? `, ${failed} failed` : ""}`);
if (failed) process.exit(1);
