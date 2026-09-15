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

const SRC = fs.readFileSync(path.join(__dirname, "..", "main.cjs"), "utf8");

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

// ---------------------------------------------------------------- summary

console.log();
if (failed) {
  console.error(`${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`${passed} passed`);
