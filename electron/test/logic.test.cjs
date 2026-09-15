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

// ---------------------------------------------------------------- summary

console.log();
if (failed) {
  console.error(`${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`${passed} passed`);
