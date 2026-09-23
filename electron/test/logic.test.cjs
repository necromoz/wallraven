// Tests for the pure logic inside main.cjs.
//
// main.cjs cannot be required directly: it calls Electron APIs at load time.
// So the functions under test are extracted from the source by name and
// evaluated in isolation. That keeps the tests honest (they run the real
// shipped code, not a copy that can drift) without needing a display or a
// Windows box.
//
// Run with: node electron/test/logic.test.cjs

const fs = require("fs");
const path = require("path");
const assert = require("assert");

// Normalised to LF: Windows checks the repo out with CRLF, and the
// extractors below match on line ends.
const SRC = fs.readFileSync(path.join(__dirname, "..", "main.cjs"), "utf8").replace(/\r\n/g, "\n");

/** Pull a top-level `function name(...) { ... }` out of the source by brace matching. */
function extract(name) {
  const start = SRC.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `could not find function ${name} in main.cjs`);
  let i = SRC.indexOf("{", start);
  let depth = 0;
  for (let j = i; j < SRC.length; j++) {
    const c = SRC[j];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return SRC.slice(start, j + 1);
    }
  }
  throw new Error(`unbalanced braces reading ${name}`);
}

/** Pull a top-level `const NAME = ...;` initialiser out of the source. */
function extractConst(name) {
  const re = new RegExp("const " + name + " = ([\\s\\S]*?);\\n", "m");
  const m = re.exec(SRC);
  assert.ok(m, `could not find const ${name} in main.cjs`);
  return `const ${name} = ${m[1]};`;
}

let passed = 0;
let failed = 0;

function check(label, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    console.error(`  FAIL  ${label}`);
    console.error(`        ${err.message}`);
  }
}

// ---------------------------------------------------------------- compareVersions

const compareVersions = new Function(`${extract("compareVersions")}; return compareVersions;`)();

const newer = (a, b) => assert.ok(compareVersions(a, b) > 0, `expected ${a} > ${b}`);
const older = (a, b) => assert.ok(compareVersions(a, b) < 0, `expected ${a} < ${b}`);
const same = (a, b) => assert.strictEqual(compareVersions(a, b), 0, `expected ${a} == ${b}`);

console.log("compareVersions");

check("orders the numeric core", () => {
  newer("0.8.13", "0.8.8");
  newer("1.0.0", "0.9.9");
  newer("0.10.0", "0.9.0");
  older("0.8.4", "0.8.13");
});

check("treats a missing part as zero", () => {
  same("1.0", "1.0.0");
  same("1", "1.0.0");
  newer("1.0.1", "1.0");
});

check("ignores a leading v", () => {
  same("v0.8.13", "0.8.13");
  newer("v0.8.13", "v0.8.8");
});

check("a release outranks its own prerelease", () => {
  // This is the bug that was fixed: the old implementation compared "beta"
  // against 0 with localeCompare and decided the beta was newer.
  newer("0.8.0", "0.8.0-beta.1");
  newer("0.8.0", "0.8.0-beta.2");
  older("0.8.0-beta.2", "0.8.0");
});

check("orders prereleases against each other", () => {
  newer("0.8.0-beta.2", "0.8.0-beta.1");
  newer("0.8.0-beta.10", "0.8.0-beta.2"); // numeric, not lexical
  newer("0.8.0-beta", "0.8.0-alpha");
  newer("0.8.0-beta.1", "0.8.0-beta"); // more identifiers wins
});

check("a numeric identifier sorts below an alphanumeric one", () => {
  older("0.8.0-1", "0.8.0-alpha");
});

check("a later release still beats an earlier prerelease", () => {
  newer("0.8.1", "0.8.0-beta.1");
  newer("0.9.0-beta.1", "0.8.13");
});

check("ignores build metadata", () => {
  same("0.8.13+build.5", "0.8.13");
});

check("handles junk without throwing", () => {
  assert.strictEqual(typeof compareVersions("", ""), "number");
  assert.strictEqual(typeof compareVersions(null, undefined), "number");
  assert.strictEqual(typeof compareVersions("not.a.version", "0.1.0"), "number");
});

// ---------------------------------------------------------------- parseHHMM

const parseHHMM = new Function(`${extract("parseHHMM")}; return parseHHMM;`)();

console.log("parseHHMM");

check("parses valid times to minutes since midnight", () => {
  assert.strictEqual(parseHHMM("00:00"), 0);
  assert.strictEqual(parseHHMM("08:00"), 480);
  assert.strictEqual(parseHHMM("22:30"), 1350);
  assert.strictEqual(parseHHMM("23:59"), 1439);
  assert.strictEqual(parseHHMM(" 9:05 "), 545);
});

check("rejects malformed input", () => {
  assert.strictEqual(parseHHMM("nonsense"), null);
  assert.strictEqual(parseHHMM(""), null);
  assert.strictEqual(parseHHMM(null), null);
  assert.strictEqual(parseHHMM("8"), null);
});

// ------------------------------------------------------------- findActiveRule

const findActiveRule = new Function(
  `${extract("parseHHMM")}
   ${extract("findActiveRule")}
   return findActiveRule;`,
)();

// 2026-09-15 is a Tuesday. Day numbers are 0=Sun..6=Sat.
const at = (day, hh, mm) => new Date(2026, 8, 13 + day, hh, mm); // 13 Sep 2026 is a Sunday
const TUE = 2;

console.log("findActiveRule");

check("picks the latest rule that has already started today", () => {
  const rules = [
    { id: "morning", startHHMM: "08:00" },
    { id: "evening", startHHMM: "20:00" },
  ];
  assert.strictEqual(findActiveRule(rules, at(TUE, 9, 0)).id, "morning");
  assert.strictEqual(findActiveRule(rules, at(TUE, 19, 59)).id, "morning");
  assert.strictEqual(findActiveRule(rules, at(TUE, 20, 0)).id, "evening");
  assert.strictEqual(findActiveRule(rules, at(TUE, 23, 59)).id, "evening");
});

check("an evening rule survives midnight", () => {
  // The bug: at 01:00 the old code found nothing, because 20:00 is not
  // earlier than 01:00 once the minute counter resets.
  const rules = [
    { id: "morning", startHHMM: "08:00" },
    { id: "evening", startHHMM: "20:00" },
  ];
  assert.strictEqual(findActiveRule(rules, at(TUE, 0, 30)).id, "evening");
  assert.strictEqual(findActiveRule(rules, at(TUE, 7, 59)).id, "evening");
});

check("carries over from the correct earlier day", () => {
  // A rule that only runs at weekends should still be in force early Monday.
  const rules = [{ id: "weekend", startHHMM: "10:00", days: [0, 6] }];
  const MON = 1;
  assert.strictEqual(findActiveRule(rules, at(MON, 3, 0)).id, "weekend");
});

check("respects the days a rule applies to", () => {
  const rules = [
    { id: "weekday", startHHMM: "09:00", days: [1, 2, 3, 4, 5] },
    { id: "weekend", startHHMM: "11:00", days: [0, 6] },
  ];
  const SAT = 6;
  assert.strictEqual(findActiveRule(rules, at(TUE, 12, 0)).id, "weekday");
  assert.strictEqual(findActiveRule(rules, at(SAT, 12, 0)).id, "weekend");
});

check("an empty days list means every day", () => {
  const rules = [{ id: "always", startHHMM: "06:00", days: [] }];
  assert.strictEqual(findActiveRule(rules, at(TUE, 7, 0)).id, "always");
});

check("returns null when there are no usable rules", () => {
  assert.strictEqual(findActiveRule([], at(TUE, 12, 0)), null);
  assert.strictEqual(findActiveRule(null, at(TUE, 12, 0)), null);
  assert.strictEqual(findActiveRule([{ id: "bad", startHHMM: "nope" }], at(TUE, 12, 0)), null);
});

check("ignores malformed rules but keeps the good ones", () => {
  const rules = [
    { id: "bad", startHHMM: "" },
    { id: "good", startHHMM: "07:00" },
  ];
  assert.strictEqual(findActiveRule(rules, at(TUE, 8, 0)).id, "good");
});

// ---------------------------------------------------------------- mergeConfig

const mergeConfig = new Function(`${extract("mergeConfig")}; return mergeConfig;`)();

console.log("mergeConfig");

check("fills in keys added to a nested object since the config was written", () => {
  const defaults = {
    hotkeys: { next: "A", like: "B", back: "C", forward: "D" },
    cycleMinutes: 30,
  };
  const saved = { hotkeys: { next: "X", like: "B" }, cycleMinutes: 15 };
  const out = mergeConfig(defaults, saved);
  // The saved values win...
  assert.strictEqual(out.hotkeys.next, "X");
  assert.strictEqual(out.cycleMinutes, 15);
  // ...but keys the old config never had are no longer undefined.
  assert.strictEqual(out.hotkeys.back, "C");
  assert.strictEqual(out.hotkeys.forward, "D");
});

check("merges categories, purity and schedule the same way", () => {
  const defaults = {
    categories: { general: true, anime: false, people: false },
    purity: { sfw: true, sketchy: false, nsfw: false },
    schedule: { enabled: false, rules: [] },
  };
  const saved = { categories: { anime: true }, schedule: { enabled: true } };
  const out = mergeConfig(defaults, saved);
  assert.strictEqual(out.categories.anime, true);
  assert.strictEqual(out.categories.general, true);
  assert.strictEqual(out.purity.sfw, true);
  assert.strictEqual(out.schedule.enabled, true);
  assert.deepStrictEqual(out.schedule.rules, []);
});

check("never merges arrays, so cleared user data stays cleared", () => {
  const defaults = { likes: [], dislikes: [], colors: ["ff0000"] };
  const saved = { likes: ["123"], colors: [] };
  const out = mergeConfig(defaults, saved);
  assert.deepStrictEqual(out.likes, ["123"]);
  assert.deepStrictEqual(out.colors, [], "an emptied array must not be refilled from defaults");
});

check("keeps saved keys the defaults do not know about", () => {
  const out = mergeConfig({ a: 1 }, { a: 2, somethingNew: true });
  assert.strictEqual(out.somethingNew, true);
});

check("survives a null where an object was expected", () => {
  const out = mergeConfig({ hotkeys: { next: "A" } }, { hotkeys: null });
  assert.strictEqual(out.hotkeys, null);
});

// ---------------------------------------------------- atomic JSON read/write

const os = require("os");

const jsonIo = new Function(
  "fs",
  "console",
  `${extract("writeJsonAtomic")}
   ${extract("readJsonWithBackup")}
   return { writeJsonAtomic, readJsonWithBackup };`,
)(fs, { warn() {}, error() {} });

const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "wallraven-test-"));
const target = path.join(tmpdir, "config.json");

console.log("writeJsonAtomic / readJsonWithBackup");

check("round-trips a value", () => {
  jsonIo.writeJsonAtomic(target, { likes: ["a", "b"], cycleMinutes: 30 });
  assert.deepStrictEqual(jsonIo.readJsonWithBackup(target), {
    likes: ["a", "b"],
    cycleMinutes: 30,
  });
});

check("leaves no temp file behind", () => {
  assert.ok(!fs.existsSync(`${target}.tmp`), "temp file was not renamed away");
});

check("keeps the previous good copy as .bak", () => {
  jsonIo.writeJsonAtomic(target, { generation: 2 });
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(`${target}.bak`, "utf8")), {
    likes: ["a", "b"],
    cycleMinutes: 30,
  });
  assert.deepStrictEqual(jsonIo.readJsonWithBackup(target), { generation: 2 });
});

check("recovers from a truncated main file", () => {
  // Simulate a crash mid-write: the old code wrote straight over the live file,
  // so this is exactly the state a power cut used to leave behind.
  fs.writeFileSync(target, '{"generation": 2, "likes": ["a"');
  assert.deepStrictEqual(jsonIo.readJsonWithBackup(target), {
    likes: ["a", "b"],
    cycleMinutes: 30,
  });
});

check("returns null when nothing is usable", () => {
  const missing = path.join(tmpdir, "nope.json");
  assert.strictEqual(jsonIo.readJsonWithBackup(missing), null);
});

check("returns null when both copies are corrupt", () => {
  const both = path.join(tmpdir, "both-bad.json");
  fs.writeFileSync(both, "{not json");
  fs.writeFileSync(`${both}.bak`, "also not json");
  assert.strictEqual(jsonIo.readJsonWithBackup(both), null);
});

fs.rmSync(tmpdir, { recursive: true, force: true });

// ------------------------------------------------- update download guards

const guards = new Function(
  `${extractConst("UPDATE_DOWNLOAD_HOSTS")}
   ${extractConst("SAFE_VERSION_RE")}
   ${extract("isAllowedUpdateUrl")}
   ${extract("safeVersion")}
   ${extract("parseSha256Sums")}
   return { isAllowedUpdateUrl, safeVersion, parseSha256Sums };`,
)();

console.log("update download guards");

check("allows the hosts that actually serve releases", () => {
  assert.ok(guards.isAllowedUpdateUrl("https://wallraven.app/updates/x.exe"));
  assert.ok(
    guards.isAllowedUpdateUrl("https://github.com/necromoz/wallraven/releases/download/v1/x.exe"),
  );
  // GitHub redirects release downloads here, so the hop has to be allowed too.
  assert.ok(guards.isAllowedUpdateUrl("https://release-assets.githubusercontent.com/whatever"));
  assert.ok(guards.isAllowedUpdateUrl("https://objects.githubusercontent.com/whatever"));
});

check("refuses anywhere else", () => {
  assert.ok(!guards.isAllowedUpdateUrl("https://evil.example/x.exe"));
  // A lookalike host must not pass.
  assert.ok(!guards.isAllowedUpdateUrl("https://wallraven.app.evil.example/x.exe"));
  assert.ok(!guards.isAllowedUpdateUrl("https://notgithub.com/x.exe"));
});

check("refuses plain http even on an allowed host", () => {
  assert.ok(!guards.isAllowedUpdateUrl("http://wallraven.app/updates/x.exe"));
});

check("refuses junk instead of throwing", () => {
  assert.ok(!guards.isAllowedUpdateUrl(""));
  assert.ok(!guards.isAllowedUpdateUrl(null));
  assert.ok(!guards.isAllowedUpdateUrl("not a url"));
  assert.ok(!guards.isAllowedUpdateUrl("file:///C:/Windows/System32/calc.exe"));
});

check("accepts sensible versions and strips a leading v", () => {
  assert.strictEqual(guards.safeVersion("1.0.1"), "1.0.1");
  assert.strictEqual(guards.safeVersion("v1.0.1"), "1.0.1");
  assert.strictEqual(guards.safeVersion("1.0.0-beta.2"), "1.0.0-beta.2");
});

check("rejects a version that could escape the filename", () => {
  // This is the path traversal: latestVersion is interpolated straight into
  // Wallraven-Setup-v<version>.exe.
  assert.strictEqual(guards.safeVersion("../../../Windows/System32/evil"), "");
  assert.strictEqual(guards.safeVersion("1.0/../../x"), "");
  assert.strictEqual(guards.safeVersion("1.0\\..\\x"), "");
  assert.strictEqual(guards.safeVersion(""), "");
  assert.strictEqual(guards.safeVersion("a".repeat(64)), "");
});

check("reads a checksum out of sha256sum output", () => {
  const sums = [
    "1becc7e7e05a3a2020d52e566110b459ac1ac047216e9b4abeb9785d05303f11 *Wallraven-Setup-v1.0.1.exe",
    "0000000000000000000000000000000000000000000000000000000000000000  something-else.exe",
  ].join("\n");
  assert.strictEqual(
    guards.parseSha256Sums(sums, "Wallraven-Setup-v1.0.1.exe"),
    "1becc7e7e05a3a2020d52e566110b459ac1ac047216e9b4abeb9785d05303f11",
  );
});

check("returns nothing when the wanted file is absent", () => {
  const sums = "0000000000000000000000000000000000000000000000000000000000000000  other.exe";
  assert.strictEqual(guards.parseSha256Sums(sums, "Wallraven-Setup-v1.0.1.exe"), "");
  assert.strictEqual(guards.parseSha256Sums("", "x.exe"), "");
  assert.strictEqual(guards.parseSha256Sums("garbage", "x.exe"), "");
});

// ---------------------------------------------------------------- crashes

console.log("crash redaction");

// CRASH_TEXT_MAX is a module constant in main.cjs, so it has to be supplied
// to the extracted function's scope. Keep it in step with the source.
const CRASH_TEXT_MAX_EXPECTED = 4000;
const crashRedact = new Function(
  `const CRASH_TEXT_MAX = ${CRASH_TEXT_MAX_EXPECTED}; ${extract("redactCrashText")}; return redactCrashText;`,
)();

check("the cap under test still matches the one in main.cjs", () => {
  const m = /const CRASH_TEXT_MAX = (\d+)/.exec(SRC);
  assert.ok(m, "CRASH_TEXT_MAX is no longer declared in main.cjs");
  assert.strictEqual(
    Number(m[1]),
    CRASH_TEXT_MAX_EXPECTED,
    "main.cjs changed CRASH_TEXT_MAX; update the tests to match",
  );
});

const WIN_CTX = { home: "C:\\Users\\steve", user: "steve", apiKey: "abcd1234efgh5678" };

check("replaces the home directory with ~", () => {
  const out = crashRedact(
    "Error: nope\n    at f (C:\\Users\\steve\\AppData\\Roaming\\WallRaven\\main.cjs:12:3)",
    WIN_CTX,
  );
  assert.ok(!out.includes("C:\\Users\\steve"), "home directory survived redaction");
  assert.ok(out.includes("~"), "expected the home directory to be replaced with ~");
});

check("handles paths written with forward slashes too", () => {
  const out = crashRedact("at f (C:/Users/steve/AppData/x.js:1:1)", WIN_CTX);
  assert.ok(!out.includes("Users/steve"), `username survived: ${out}`);
});

check("removes the username where it appears on its own", () => {
  const out = crashRedact("ENOENT: no such file, open 'steve.json'", WIN_CTX);
  assert.ok(!/\bsteve\b/i.test(out), `username survived: ${out}`);
});

check("removes the Wallhaven API key", () => {
  const out = crashRedact("request failed: ?apikey=abcd1234efgh5678&q=x", WIN_CTX);
  assert.ok(!out.includes("abcd1234efgh5678"), "API key survived redaction");
  assert.ok(out.includes("<api key>"), "expected the key to be marked as removed");
});

check("does not mangle text when there is nothing to redact", () => {
  const out = crashRedact("TypeError: x is not a function", { home: "", user: "", apiKey: "" });
  assert.strictEqual(out, "TypeError: x is not a function");
});

check("ignores a suspiciously short username rather than shredding the text", () => {
  // A two-character username would match inside ordinary words.
  const out = crashRedact("at read (a/b/c.js)", { home: "", user: "at", apiKey: "" });
  assert.strictEqual(out, "at read (a/b/c.js)");
});

check("ignores a short api key for the same reason", () => {
  const out = crashRedact("error code 42 raised", { home: "", user: "", apiKey: "42" });
  assert.strictEqual(out, "error code 42 raised");
});

check("caps the length so one crash cannot fill a report", () => {
  const out = crashRedact("x".repeat(9000), { home: "", user: "", apiKey: "" });
  assert.ok(out.length <= 4000, `got ${out.length} characters`);
});

check("survives being handed something that is not a string", () => {
  for (const input of [null, undefined, 42, {}]) {
    assert.doesNotThrow(() => crashRedact(input, WIN_CTX), `threw on ${String(input)}`);
  }
});

// ---------------------------------------------------------------- formatSizeMB

const formatSizeMB = new Function(`${extract("formatSizeMB")}; return formatSizeMB;`)();

console.log("formatSizeMB");

check("small sizes keep a decimal, larger ones do not need one", () => {
  assert.strictEqual(formatSizeMB(0), "0.0 MB");
  assert.strictEqual(formatSizeMB(5.25), "5.3 MB");
  assert.strictEqual(formatSizeMB(40), "40 MB");
  assert.strictEqual(formatSizeMB(1023), "1023 MB");
});

check("it switches to GB where people would", () => {
  // The cache limit slider goes to 20480 MB, which is nobody's idea of a size.
  assert.strictEqual(formatSizeMB(1024), "1.00 GB");
  assert.strictEqual(formatSizeMB(5120), "5.00 GB");
  assert.strictEqual(formatSizeMB(20480), "20.0 GB");
});

check("and to TB, for anyone pointing the cache at a NAS", () => {
  assert.strictEqual(formatSizeMB(1024 * 1024), "1.00 TB");
  assert.strictEqual(formatSizeMB(1024 * 1024 * 2.5), "2.50 TB");
});

check("nonsense does not produce NaN on the tray menu", () => {
  for (const v of [null, undefined, "", NaN, -5, {}]) {
    assert.strictEqual(formatSizeMB(v), "0.0 MB", `failed on ${String(v)}`);
  }
});

// ---------------------------------------------------------------- fetch generations

const fetches = new Function(`
  let fetchGeneration = 0;
  ${extract("startFetchGeneration")}
  ${extract("fetchSuperseded")}
  return { startFetchGeneration, fetchSuperseded };
`)();

console.log("fetch generations");

check("the fetch that holds the lock is the current one", () => {
  const mine = fetches.startFetchGeneration();
  assert.strictEqual(fetches.fetchSuperseded(mine), false);
});

check("taking the lock away retires whoever had it", () => {
  // The 30-second safety valve can take the lock from a fetch that has hung,
  // but it cannot stop that fetch. When it finally comes back it must not set
  // its wallpaper over the top of the one the user asked for.
  const hung = fetches.startFetchGeneration();
  fetches.startFetchGeneration(); // the takeover
  const replacement = fetches.startFetchGeneration();
  assert.strictEqual(
    fetches.fetchSuperseded(hung),
    true,
    "the hung fetch would still apply its result",
  );
  assert.strictEqual(
    fetches.fetchSuperseded(replacement),
    false,
    "the replacement thinks it is stale",
  );
});

check("a retired fetch stays retired", () => {
  const old = fetches.startFetchGeneration();
  fetches.startFetchGeneration();
  assert.strictEqual(fetches.fetchSuperseded(old), true);
  assert.strictEqual(fetches.fetchSuperseded(old), true);
});

check("the rotation checks before it changes anything, and before freeing the lock", () => {
  const at = SRC.indexOf("async function fetchAndSetWallpaper(");
  const body = SRC.slice(at, SRC.indexOf("\n}", SRC.indexOf("} finally {", at)));
  assert.ok(
    /const generation = startFetchGeneration\(\)/.test(body),
    "the fetch does not take a generation",
  );
  assert.ok(
    /if \(fetchSuperseded\(generation\)\) \{/.test(body),
    "a superseded fetch still applies its wallpaper",
  );
  assert.ok(
    /if \(!fetchSuperseded\(generation\)\) \{\n      isFetching = false;/.test(body),
    "a superseded fetch still frees the lock, which lets two rotations run at once",
  );
  assert.ok(
    /startFetchGeneration\(\);\n      isFetching = false;/.test(body),
    "the takeover does not retire the fetch it is taking over from",
  );
});

// ---------------------------------------------------------------- save-triggered fetch

// Fake timers: queueSaveFetch is a debounce, so the thing worth testing is what
// happens between the call and the timer firing.
function fakeTimers() {
  let next = 1;
  const pending = new Map();
  return {
    setTimeout: (fn, ms) => {
      const id = next++;
      pending.set(id, { fn, ms });
      return id;
    },
    clearTimeout: (id) => pending.delete(id),
    runAll: () => {
      const jobs = [...pending.values()];
      pending.clear();
      for (const j of jobs) j.fn();
    },
    count: () => pending.size,
  };
}

function saveFetch() {
  const timers = fakeTimers();
  const fetches = [];
  const toasts = [];
  const mod = new Function(
    "setTimeout",
    "clearTimeout",
    "notifySettings",
    "fetchAndSetWallpaper",
    "console",
    `let saveFetchTimer = null;
     const SAVE_FETCH_DELAY_MS = 900;
     ${extract("queueSaveFetch")}
     ${extract("cancelSaveFetch")}
     return { queueSaveFetch, cancelSaveFetch };`,
  )(
    timers.setTimeout,
    timers.clearTimeout,
    (kind, payload) => toasts.push({ kind, payload }),
    () => {
      fetches.push(Date.now());
      return Promise.resolve();
    },
    { warn() {}, log() {}, error() {} },
  );
  return { ...mod, timers, fetches, toasts };
}

console.log("the fetch a save asks for");

check("saving a filter change asks for one wallpaper", () => {
  const s = saveFetch();
  s.queueSaveFetch();
  s.timers.runAll();
  assert.strictEqual(s.fetches.length, 1);
});

check("a burst of saves still only asks for one", () => {
  // Applying a preset writes the settings and then asks for a wallpaper.
  // Without this the write alone started a second one, and anything else
  // saving in between made a third: the wallpaper changed two or three times
  // in a row on its own.
  const s = saveFetch();
  s.queueSaveFetch();
  s.queueSaveFetch();
  s.queueSaveFetch();
  assert.strictEqual(s.timers.count(), 1, "more than one fetch is queued");
  s.timers.runAll();
  assert.strictEqual(s.fetches.length, 1);
});

check("changing the wallpaper on purpose cancels the queued one", () => {
  const s = saveFetch();
  s.queueSaveFetch();
  s.cancelSaveFetch();
  s.timers.runAll();
  assert.strictEqual(s.fetches.length, 0, "the save-triggered fetch ran anyway");
});

check("cancelling when nothing is queued is harmless", () => {
  const s = saveFetch();
  assert.doesNotThrow(() => s.cancelSaveFetch());
  s.timers.runAll();
  assert.strictEqual(s.fetches.length, 0);
});

check("it says what it is doing, but only when it actually does it", () => {
  const s = saveFetch();
  s.queueSaveFetch();
  assert.strictEqual(s.toasts.length, 0, "it announced a fetch before starting one");
  s.timers.runAll();
  assert.strictEqual(s.toasts.length, 1);
});

check("everything that changes the wallpaper on purpose cancels it", () => {
  for (const site of [
    'ipcMain.handle("wp:next"',
    'ipcMain.handle("wp:setFromRemote"',
    "async function navigateHistory(",
  ]) {
    const at = SRC.indexOf(site);
    assert.ok(at !== -1, `${site} is gone`);
    assert.ok(
      SRC.slice(at, at + 400).includes("cancelSaveFetch()"),
      `${site} does not cancel a queued save fetch`,
    );
  }
});

// ---------------------------------------------------------------- tray reactions

console.log("tray reactions");

const trayMenu = SRC.slice(
  SRC.indexOf("function updateTrayMenu()"),
  SRC.indexOf("Open current on Wallhaven"),
);

check("Like and Dislike wear the same kind of icon", () => {
  // They used to disagree: a heart or star for Like, a thumb for Dislike, so
  // the two halves of the same decision looked like unrelated features.
  const icons = [
    ...trayMenu.matchAll(
      /"([^"]*?) (?:Liked \(undo\)|Like current|Disliked \(undo\)|Dislike current)/g,
    ),
  ].map((m) => m[1]);
  assert.strictEqual(icons.length, 4, `expected 4 reaction labels, found ${icons.length}`);
  assert.deepStrictEqual(
    [...new Set(icons)].sort(),
    ["\u{1F44D}", "\u{1F44E}"],
    `tray reaction icons are inconsistent: ${icons.join(" ")}`,
  );
});

check("both reactions stay clickable once set, so they can be undone", () => {
  // enabled: !!last && !liked greyed the item out the moment it was pressed.
  // likeCurrent and dislikeCurrent both toggle, so that was the menu refusing
  // to let the user reach a behaviour that already existed.
  assert.ok(
    !/enabled: !!last && !liked/.test(trayMenu),
    "Like is disabled once liked and cannot be undone from the tray",
  );
  assert.ok(
    !/enabled: !!last && !disliked/.test(trayMenu),
    "Dislike is disabled once disliked and cannot be undone from the tray",
  );
});

check("clearing either reaction empties both lists behind it", () => {
  // The ids are what the picker filters on; the item records are what the
  // Library draws. Clearing one and not the other leaves orphans on screen.
  const clearD = SRC.slice(
    SRC.indexOf('ipcMain.handle("wp:clearDislikes"'),
    SRC.indexOf('ipcMain.handle("wp:clearLikes"'),
  );
  assert.ok(/config\.dislikes = \[\]/.test(clearD), "dislike ids not cleared");
  assert.ok(/config\.dislikedItems = \[\]/.test(clearD), "disliked item records survive the clear");
  const at = SRC.indexOf('ipcMain.handle("wp:clearLikes"');
  assert.ok(at !== -1, "there is no wp:clearLikes handler");
  const clearL = SRC.slice(at, at + 400);
  assert.ok(/config\.likes = \[\]/.test(clearL), "like ids not cleared");
  assert.ok(/liked\.items = \[\]/.test(clearL), "the Liked playlist is not emptied");
});

// ---------------------------------------------------------------- summary

console.log();
if (failed) {
  console.error(`${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`${passed} passed`);
