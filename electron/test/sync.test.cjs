// Tests for the parts of cloud sync that can destroy data.
//
// These exist because of a real defect: playlist items are uploaded without
// their local cache paths (correctly, since a path on one machine is
// meaningless on another), but the download replaced the local playlists
// wholesale, so every item lost its `file`. main.cjs decides which images the
// cache cleaner may delete by collecting `file` from every playlist, so with
// the paths gone nothing was protected and the next prune deleted the user's
// liked and saved wallpapers off disk. No error, no way back.
//
// Run with: node electron/test/sync.test.cjs

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const SRC = fs
  .readFileSync(path.join(__dirname, "..", "cloud.cjs"), "utf8")
  .replace(/\r\n/g, "\n");

/** Pull a top-level function out of cloud.cjs by brace matching. */
function extract(name) {
  const start = SRC.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `could not find function ${name} in cloud.cjs`);
  let depth = 0;
  const from = SRC.indexOf("{", start);
  for (let i = from; i < SRC.length; i++) {
    if (SRC[i] === "{") depth++;
    else if (SRC[i] === "}" && --depth === 0) return SRC.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces reading ${name}`);
}

const restorePlaylistFiles = new Function(
  `${extract("restorePlaylistFiles")}; return restorePlaylistFiles;`,
)();
const stripPlaylists = new Function(`${extract("stripPlaylists")}; return stripPlaylists;`)();

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

const local = {
  Liked: {
    createdAt: 1,
    items: [
      { id: "aaa", url: "u1", file: "C:\\cache\\aaa.jpg", resolution: "3840x2160" },
      { id: "bbb", url: "u2", file: "C:\\cache\\bbb.jpg", resolution: "1920x1080" },
    ],
  },
  Desk: {
    createdAt: 2,
    items: [{ id: "ccc", url: "u3", file: "C:\\cache\\ccc.jpg" }],
  },
};

console.log("uploading");

check("strips local cache paths before upload", () => {
  const stripped = stripPlaylists(local);
  for (const pl of Object.values(stripped)) {
    for (const it of pl.items) {
      assert.ok(!("file" in it), "a local path was about to be uploaded");
    }
  }
});

console.log("downloading");

check("puts the local paths back on the way in", () => {
  const incoming = stripPlaylists(local);
  const merged = restorePlaylistFiles(local, incoming);
  assert.strictEqual(merged.Liked.items[0].file, "C:\\cache\\aaa.jpg");
  assert.strictEqual(merged.Liked.items[1].file, "C:\\cache\\bbb.jpg");
  assert.strictEqual(merged.Desk.items[0].file, "C:\\cache\\ccc.jpg");
});

check("every item that had a path still has one", () => {
  // This is the assertion that matters: anything without a path here is an
  // image the cache cleaner is free to delete.
  const merged = restorePlaylistFiles(local, stripPlaylists(local));
  const files = Object.values(merged).flatMap((pl) => pl.items.map((it) => it.file));
  assert.ok(files.every(Boolean), `some items lost their file: ${JSON.stringify(files)}`);
  assert.strictEqual(files.length, 3);
});

check("matches by id across playlists, not just within one", () => {
  // The same image liked and also added to another playlist must keep its path
  // even if the playlists were reorganised on the other machine.
  const incoming = { Moved: { createdAt: 3, items: [{ id: "aaa", url: "u1" }] } };
  const merged = restorePlaylistFiles(local, incoming);
  assert.strictEqual(merged.Moved.items[0].file, "C:\\cache\\aaa.jpg");
});

check("leaves genuinely new items without a path", () => {
  // An image added on another machine has never been downloaded here. Inventing
  // a path would be worse than leaving it empty.
  const incoming = { Liked: { createdAt: 1, items: [{ id: "zzz", url: "u9" }] } };
  const merged = restorePlaylistFiles(local, incoming);
  assert.strictEqual(merged.Liked.items[0].file, undefined);
});

check("never overwrites a path the incoming item already carries", () => {
  const incoming = { Liked: { createdAt: 1, items: [{ id: "aaa", file: "D:\\other.jpg" }] } };
  const merged = restorePlaylistFiles(local, incoming);
  assert.strictEqual(merged.Liked.items[0].file, "D:\\other.jpg");
});

check("keeps playlist metadata intact", () => {
  const merged = restorePlaylistFiles(local, stripPlaylists(local));
  assert.strictEqual(merged.Liked.createdAt, 1);
  assert.strictEqual(merged.Desk.createdAt, 2);
});

check("survives empty, missing and malformed input", () => {
  assert.doesNotThrow(() => restorePlaylistFiles(null, null));
  assert.doesNotThrow(() => restorePlaylistFiles({}, {}));
  assert.doesNotThrow(() => restorePlaylistFiles(local, { X: {} }));
  assert.doesNotThrow(() => restorePlaylistFiles(local, { X: { items: [null, undefined] } }));
});

check("a round trip through the cloud changes nothing locally", () => {
  // Upload then download must be a no-op for a machine that is already in step.
  const merged = restorePlaylistFiles(local, stripPlaylists(local));
  for (const name of Object.keys(local)) {
    for (let i = 0; i < local[name].items.length; i++) {
      assert.strictEqual(
        merged[name].items[i].file,
        local[name].items[i].file,
        `${name}[${i}] lost or changed its file`,
      );
    }
  }
});

console.log("the pull path actually uses it");

check("pull restores paths rather than assigning the remote blob straight in", () => {
  assert.ok(
    /restorePlaylistFiles\(config\.playlists/.test(SRC),
    "pull() is no longer restoring local cache paths; saved wallpapers will be deleted again",
  );
});

console.log();
if (failed) {
  console.error(`${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`${passed} passed`);
