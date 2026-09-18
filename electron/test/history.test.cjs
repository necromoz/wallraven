// Tests for stepping back and forward through history, and for refusing to
// "set" a wallpaper that is not on disk.
//
// Both come from the same real failure. The cache prunes oldest-first at a 1 GB
// default, so the file behind an entry from earlier today is usually already
// gone. Back then moved the position, found no file, and returned silently: the
// button did nothing, repeatedly, while the position kept sliding. And on the
// rotation path Windows accepts a missing file, paints the desktop black and
// reports success, so history, statistics and the notification all claimed a
// wallpaper that was not there.
//
// Run with: node electron/test/history.test.cjs

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const SRC = fs.readFileSync(path.join(__dirname, "..", "main.cjs"), "utf8").replace(/\r\n/g, "\n");

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

const helpers = new Function(
  `${extract("historyRestorable")}
   ${extract("historyFileUsable")}
   ${extract("findReachableHistoryIndex")}
   return { historyRestorable, historyFileUsable, findReachableHistoryIndex };`,
)();
const { historyRestorable, historyFileUsable, findReachableHistoryIndex } = helpers;

const assertImageReadable = new Function(
  "fs",
  "path",
  `${extract("assertImageReadable")}; return assertImageReadable;`,
)(fs, path);

console.log("which history entries can come back");

check("a Wallhaven id can be fetched again", () => {
  assert.strictEqual(historyRestorable({ id: "9d3yjg" }), true);
  assert.strictEqual(historyRestorable({ id: "85rjeo" }), true);
});

check("a local file cannot", () => {
  // Folder and playlist entries get a 'local:' id. Once the file is deleted the
  // entry is dead, and pretending otherwise would mean a request to Wallhaven
  // for an id that does not exist.
  assert.strictEqual(historyRestorable({ id: "local:c2VkZmdo" }), false);
  assert.strictEqual(historyRestorable({}), false);
  assert.strictEqual(historyRestorable(null), false);
  assert.strictEqual(historyRestorable({ id: 12345 }), false);
});

check("a cached file counts whatever the id looks like", () => {
  const exists = (f) => f === "/cache/a.jpg";
  assert.strictEqual(historyFileUsable({ id: "local:x", file: "/cache/a.jpg" }, exists), true);
  assert.strictEqual(historyFileUsable({ id: "local:x", file: "/cache/b.jpg" }, exists), false);
  assert.strictEqual(historyFileUsable({ id: "local:x" }, exists), false);
});

console.log("stepping to somewhere that can actually be shown");

const none = () => false;
const all = () => true;

check("back from the end finds the previous entry", () => {
  const items = [{ id: "aaaaaa" }, { id: "bbbbbb" }, { id: "cccccc" }];
  assert.strictEqual(findReachableHistoryIndex(items, 2, -1, none), 1);
});

check("it steps over dead local entries instead of stopping on one", () => {
  // This is the case that made Back look broken: the entry immediately behind
  // was a folder image that had since been deleted.
  const items = [
    { id: "aaaaaa" },
    { id: "local:gone", file: "/gone.jpg" },
    { id: "local:gone2", file: "/gone2.jpg" },
    { id: "cccccc" },
  ];
  assert.strictEqual(findReachableHistoryIndex(items, 3, -1, none), 0);
});

check("a dead local entry is still reachable while its file is there", () => {
  const items = [{ id: "aaaaaa" }, { id: "local:here", file: "/here.jpg" }, { id: "cccccc" }];
  assert.strictEqual(
    findReachableHistoryIndex(items, 2, -1, (f) => f === "/here.jpg"),
    1,
  );
});

check("nothing reachable behind gives -1, not index 0", () => {
  const items = [
    { id: "local:a", file: "/a.jpg" },
    { id: "local:b", file: "/b.jpg" },
    { id: "cccccc" },
  ];
  assert.strictEqual(findReachableHistoryIndex(items, 2, -1, none), -1);
});

check("forward stops at the end rather than wrapping", () => {
  const items = [{ id: "aaaaaa" }, { id: "bbbbbb" }];
  assert.strictEqual(findReachableHistoryIndex(items, 1, 1, all), -1);
});

check("an empty history is not a special case", () => {
  assert.strictEqual(findReachableHistoryIndex([], 0, -1, all), -1);
  assert.strictEqual(findReachableHistoryIndex([], -1, 1, all), -1);
});

check("searching never revisits where it started", () => {
  // navigateHistory calls this in a loop, passing the index it just rejected.
  // If it could ever return that index the app would spin.
  const items = [{ id: "aaaaaa" }, { id: "bbbbbb" }, { id: "cccccc" }];
  for (const step of [-1, 1]) {
    for (let from = 0; from < items.length; from++) {
      const got = findReachableHistoryIndex(items, from, step, all);
      assert.notStrictEqual(got, from, `step ${step} from ${from} returned itself`);
      if (got !== -1) {
        assert.ok(
          step === -1 ? got < from : got > from,
          `step ${step} from ${from} went backwards`,
        );
      }
    }
  }
});

console.log("refusing to set a wallpaper that is not there");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wallraven-test-"));

check("a real file passes", () => {
  const f = path.join(tmp, "ok.jpg");
  fs.writeFileSync(f, "not really a jpeg, but it has bytes");
  assert.doesNotThrow(() => assertImageReadable(f));
});

check("a missing file is refused, by name", () => {
  const f = path.join(tmp, "gone.jpg");
  assert.throws(() => assertImageReadable(f), /no longer there \(gone\.jpg\)/);
});

check("a zero-byte file is refused", () => {
  // A download that was interrupted leaves exactly this behind, and Windows
  // paints it black without complaining.
  const f = path.join(tmp, "empty.jpg");
  fs.writeFileSync(f, "");
  assert.throws(() => assertImageReadable(f), /empty or not a file/);
});

check("a directory is refused", () => {
  assert.throws(() => assertImageReadable(tmp), /empty or not a file/);
});

check("nonsense input throws rather than being passed to Windows", () => {
  for (const input of [null, undefined, "", 42]) {
    assert.throws(() => assertImageReadable(input), `did not throw on ${String(input)}`);
  }
});

console.log("the callers actually use it");

check("both wallpaper setters check before calling PowerShell", () => {
  const single = SRC.indexOf("function setWindowsWallpaper(");
  const multi = SRC.indexOf("function setWindowsWallpaperPerMonitor(");
  assert.ok(single !== -1 && multi !== -1);
  assert.ok(
    /assertImageReadable\(filePath\)/.test(SRC.slice(single, single + 600)),
    "setWindowsWallpaper does not check the file",
  );
  assert.ok(
    /assertImageReadable\(f\)/.test(SRC.slice(multi, multi + 900)),
    "setWindowsWallpaperPerMonitor does not check its files",
  );
});

check("the script checks what SystemParametersInfo returned", () => {
  assert.ok(
    /\$ok = \[Wp\]::SystemParametersInfo\(20, 0, '\$\{escaped\}', 3\)/.test(SRC),
    "the return value is still being discarded",
  );
  assert.ok(/if \(-not \$ok\) \{ Write-Error/.test(SRC));
});

check("navigateHistory keeps looking instead of returning on a dead entry", () => {
  const at = SRC.indexOf("async function navigateHistory(");
  const fn = SRC.slice(at, SRC.indexOf("\n}", at));
  assert.ok(/while \(idx !== -1\)/.test(fn), "it no longer loops over unreachable entries");
  assert.ok(/restoreHistoryFile\(item\)/.test(fn), "a pruned wallpaper is not fetched again");
  assert.ok(/No earlier wallpaper is still available/.test(fn), "it can still fail silently");
});

console.log();
if (failed) {
  console.error(`${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`${passed} passed`);
