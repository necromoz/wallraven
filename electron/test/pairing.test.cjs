// Tests for the pairing code rules in src/lib/pairing-codes.ts.
//
// These sit in electron/test with the rest, but they cover website code. That
// is deliberate: the pairing codes are the thing standing between a link
// someone was sent and their account being taken over, and they should be
// checked by the same `npm test` that CI runs before every release.
//
// The module is TypeScript, so it is compiled here with the TypeScript compiler
// the repo already depends on, rather than being copied or hand-translated.
// Testing a copy would let the copy drift from what actually ships.
//
// Run with: node electron/test/pairing.test.cjs

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const crypto = require("crypto");
const Module = require("module");

const SRC_PATH = path.join(__dirname, "..", "..", "src", "lib", "pairing-codes.ts");

function loadTsModule(file) {
  let ts;
  try {
    ts = require("typescript");
  } catch {
    // Better than a MODULE_NOT_FOUND stack trace for someone who just cloned
    // the repo and ran the tests. CI installs dependencies first, so this only
    // ever fires locally.
    console.error(
      "These tests compile a TypeScript file and need the repo's dependencies.\n" +
        "Run `npm install` first, then `npm test` again.",
    );
    process.exit(1);
  }
  const source = fs.readFileSync(file, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: file,
  });
  const mod = new Module(file, null);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  mod._compile(outputText, file);
  return mod.exports;
}

const codes = loadTsModule(SRC_PATH);
const {
  USER_CODE_ALPHABET,
  USER_CODE_LENGTH,
  generateUserCode,
  formatUserCode,
  normaliseUserCode,
} = codes;

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

function section(name) {
  console.log(name);
}

const randomBytes = (n) => Uint8Array.from(crypto.randomBytes(n));

// ---------------------------------------------------------------- alphabet

section("code alphabet");

check("excludes every character people confuse when retyping", () => {
  for (const ch of ["0", "O", "1", "I", "L", "U"]) {
    assert.ok(
      !USER_CODE_ALPHABET.includes(ch),
      `${ch} is in the alphabet; it will be misread as something else`,
    );
  }
});

check("is large enough that guessing is impractical", () => {
  // Below about 1e11 combinations a code becomes brute-forceable within its own
  // lifetime, because the rate limiter is per-isolate on Workers and cannot be
  // relied on. If this assertion ever fails, the code got shorter or the
  // alphabet got smaller, and pairing got materially weaker.
  const combinations = Math.pow(USER_CODE_ALPHABET.length, USER_CODE_LENGTH);
  assert.ok(
    combinations > 1e11,
    `only ${combinations.toExponential(2)} possible codes, which is guessable`,
  );
});

check("has no repeated characters", () => {
  assert.strictEqual(new Set(USER_CODE_ALPHABET).size, USER_CODE_ALPHABET.length);
});

// ---------------------------------------------------------------- generation

section("generateUserCode");

check("produces a code of the expected length", () => {
  for (let i = 0; i < 50; i++) {
    assert.strictEqual(generateUserCode(randomBytes).length, USER_CODE_LENGTH);
  }
});

check("only ever emits characters from the alphabet", () => {
  for (let i = 0; i < 200; i++) {
    for (const ch of generateUserCode(randomBytes)) {
      assert.ok(USER_CODE_ALPHABET.includes(ch), `generated ${ch}, which is not in the alphabet`);
    }
  }
});

check("does not repeat itself", () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(generateUserCode(randomBytes));
  assert.strictEqual(seen.size, 500, "generated the same code twice in 500 tries");
});

check("stays uniform when the random source is biased towards high bytes", () => {
  // The generator rejects bytes at the top of the range so that the first
  // characters of the alphabet are not favoured. Feed it only bytes it must
  // reject followed by a usable one, and it should still terminate correctly
  // rather than loop forever or emit a wrong-length code.
  let call = 0;
  const awkward = (n) => {
    call++;
    // Every byte above the rejection threshold on the first pass.
    if (call === 1) return Uint8Array.from(Array(n).fill(255));
    return Uint8Array.from(Array(n).fill(7));
  };
  const code = generateUserCode(awkward);
  assert.strictEqual(code.length, USER_CODE_LENGTH);
  assert.ok(call > 1, "expected the generator to ask for more bytes after rejecting some");
});

// ---------------------------------------------------------------- formatting

section("formatUserCode");

check("splits the code in half with a dash", () => {
  assert.strictEqual(formatUserCode("ABCD2345"), "ABCD-2345");
});

check("round-trips through normalisation", () => {
  for (let i = 0; i < 50; i++) {
    const code = generateUserCode(randomBytes);
    assert.strictEqual(normaliseUserCode(formatUserCode(code)), code);
  }
});

// ---------------------------------------------------------------- parsing

section("normaliseUserCode");

check("accepts the code exactly as shown", () => {
  assert.strictEqual(normaliseUserCode("ABCD-2345"), "ABCD2345");
});

check("accepts lower case, stray spaces and missing dashes", () => {
  for (const input of ["abcd2345", "ABCD 2345", "  abcd-2345  ", "ab cd 23 45", "ABCD_2345"]) {
    assert.strictEqual(normaliseUserCode(input), "ABCD2345", `failed on ${JSON.stringify(input)}`);
  }
});

check("rejects a code of the wrong length", () => {
  for (const input of ["", "ABCD234", "ABCD23456", "A"]) {
    assert.strictEqual(normaliseUserCode(input), "", `accepted ${JSON.stringify(input)}`);
  }
});

check("rejects characters outside the alphabet rather than guessing at them", () => {
  // A typo must not be silently repaired into some other valid code: that would
  // mean one thing typed could match more than one real pairing.
  for (const input of ["ABCD234O", "ABCD2341", "ABCDI345", "ABCD-234!", "ABCD2#45"]) {
    assert.strictEqual(normaliseUserCode(input), "", `accepted ${JSON.stringify(input)}`);
  }
});

check("treats junk and unknown codes identically", () => {
  // Both return "", so callers cannot tell a malformed code from a real one
  // that does not exist, and neither can anyone probing the endpoint.
  assert.strictEqual(normaliseUserCode("<script>"), "");
  assert.strictEqual(normaliseUserCode("../../etc/passwd"), "");
  assert.strictEqual(normaliseUserCode(null), "");
  assert.strictEqual(normaliseUserCode(undefined), "");
});

// ------------------------------------------------- the takeover, specifically

section("the attack this replaced");

check("a code cannot be chosen by whoever asks for one", () => {
  // The old flow let the caller pick the code, which is what made a forged
  // pairing possible. There is no longer any way to influence what comes out:
  // generateUserCode takes only a source of random bytes.
  assert.strictEqual(
    generateUserCode.length,
    1,
    "generateUserCode gained a parameter; make sure it is not caller-supplied code",
  );
});

check("start.ts does not accept a code from the request body", () => {
  const start = fs.readFileSync(
    path.join(__dirname, "..", "..", "src", "routes", "api", "public", "pair", "start.ts"),
    "utf8",
  );
  assert.ok(
    !/bodySchema[\s\S]{0,200}?\bcode:/.test(start),
    "the pairing start endpoint is reading a code out of the request body again",
  );
  assert.ok(
    !/Access-Control-Allow-Origin/.test(start),
    "wildcard CORS is back on the pairing start endpoint",
  );
});

check("the link page does not approve a code taken from the URL", () => {
  const link = fs.readFileSync(
    path.join(__dirname, "..", "..", "src", "routes", "link.tsx"),
    "utf8",
  );
  // `pair` may still be read in order to tell someone their app is out of date,
  // but it must never reach getPairingInfo or approvePairing.
  assert.ok(
    !/(getPairingInfo|approvePairing)\s*\(\s*\{\s*data:\s*\{\s*code:\s*pair\b/.test(link),
    "the link page is approving a code straight from the query string again",
  );
});

// ---------------------------------------------------------------- summary

console.log();
if (failed) {
  console.error(`${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`${passed} passed`);
