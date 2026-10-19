// Tests for turning a wallpaper into the app's own background theme.
//
// Two real bugs drove this: "set as theme" refused outright on a wallpaper
// whose cached copy had been pruned (or that was never downloaded), and
// setting a second theme image silently failed to show — it copied the new
// file over the fixed name "theme-bg.jpg" every time, so the renderer's
// file:// URL never changed and the browser kept showing the old picture.
// The fix is a fresh filename per theme change (forces a redraw) with the
// old one cleaned up only once the new one is safely down.
//
// Run with: node electron/test/theme.test.cjs

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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wallraven-theme-test-"));

const { themeBgPath, clearThemeBgFiles } = new Function(
  "fs",
  "path",
  "DATA_DIR",
  `${extract("themeBgPath")}
   ${extract("clearThemeBgFiles")}
   return { themeBgPath, clearThemeBgFiles };`,
)(fs, path, tmp);

console.log("naming a theme image");

check("two calls in the same path never collide", () => {
  const a = themeBgPath(".jpg", 1);
  const b = themeBgPath(".jpg", 2);
  assert.notStrictEqual(a, b, "two tags produced the same filename");
  assert.ok(a.startsWith(tmp) && b.startsWith(tmp));
});

check("the same tag always gives the same path", () => {
  assert.strictEqual(themeBgPath(".png", 42), themeBgPath(".png", 42));
});

console.log("only one theme image survives");

check("an old theme image under a different tag or extension is removed", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wallraven-theme-clear-"));
  const oldJpg = path.join(dir, "theme-bg-1.jpg");
  const oldPng = path.join(dir, "theme-bg-2.png");
  fs.writeFileSync(oldJpg, "a");
  fs.writeFileSync(oldPng, "b");
  const clear = new Function(
    "fs",
    "path",
    "DATA_DIR",
    `${extract("clearThemeBgFiles")}; return clearThemeBgFiles;`,
  )(fs, path, dir);
  const keep = path.join(dir, "theme-bg-3.jpg");
  fs.writeFileSync(keep, "c");
  clear(keep);
  assert.ok(!fs.existsSync(oldJpg), "old .jpg theme image was not removed");
  assert.ok(!fs.existsSync(oldPng), "old .png theme image was not removed");
  assert.ok(fs.existsSync(keep), "the new theme image was removed too");
});

check("unrelated files in the data dir are left alone", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wallraven-theme-clear-"));
  const unrelated = path.join(dir, "config.json");
  fs.writeFileSync(unrelated, "{}");
  const clear = new Function(
    "fs",
    "path",
    "DATA_DIR",
    `${extract("clearThemeBgFiles")}; return clearThemeBgFiles;`,
  )(fs, path, dir);
  clear(path.join(dir, "theme-bg-1.jpg"));
  assert.ok(fs.existsSync(unrelated), "clearThemeBgFiles deleted something it should not have");
});

check("a missing data dir does not throw", () => {
  const clear = new Function(
    "fs",
    "path",
    "DATA_DIR",
    `${extract("clearThemeBgFiles")}; return clearThemeBgFiles;`,
  )(fs, path, path.join(tmp, "does-not-exist"));
  assert.doesNotThrow(() => clear(path.join(tmp, "does-not-exist", "theme-bg-1.jpg")));
});

console.log("setting the theme from an item");

check("it exists and handles both a local file and one that needs downloading", () => {
  assert.ok(SRC.includes('ipcMain.handle("theme:setFromItem"'), "handler was renamed or removed");
  const at = SRC.indexOf('ipcMain.handle("theme:setFromItem"');
  const end = SRC.indexOf("\n});", at);
  const handler = SRC.slice(at, end);
  assert.ok(/fileExistsSafe\(file\)/.test(handler), "no longer checks for a local file first");
  assert.ok(
    /restoreHistoryFile\(\{\s*id,\s*file\s*\}\)/.test(handler),
    "no longer falls back to downloading the wallpaper again",
  );
  assert.ok(/assertImageReadable\(source\)/.test(handler), "no longer checks the file is usable");
});

check("the old theme image is cleared only after the new one is copied", () => {
  const at = SRC.indexOf('ipcMain.handle("theme:setFromItem"');
  const end = SRC.indexOf("\n});", at);
  const handler = SRC.slice(at, end);
  const copyAt = handler.indexOf("fs.copyFileSync(");
  const clearAt = handler.indexOf("clearThemeBgFiles(");
  assert.ok(copyAt !== -1 && clearAt !== -1, "copy or cleanup step is missing");
  assert.ok(
    copyAt < clearAt,
    "the old theme image is cleared before the new one is safely down — a failed copy would leave no theme image at all",
  );
});

check("a wallpaper that cannot be downloaded again gets a clear error, not a crash", () => {
  const at = SRC.indexOf('ipcMain.handle("theme:setFromItem"');
  const end = SRC.indexOf("\n});", at);
  const handler = SRC.slice(at, end);
  assert.ok(/throw new Error/.test(handler), "no error is thrown when nothing can be recovered");
});

console.log("the renderer side");

const settingsSrc = fs.readFileSync(path.join(__dirname, "..", "settings.js"), "utf8");

check("setAsAppTheme falls back to the id when there's no local file", () => {
  const at = settingsSrc.indexOf("async function setAsAppTheme(");
  assert.ok(at !== -1, "setAsAppTheme is gone");
  const end = settingsSrc.indexOf("\n}", at);
  const fn = settingsSrc.slice(at, end);
  assert.ok(/item\?\.id/.test(fn), "no longer accepts an item with only an id");
  assert.ok(
    /setAppThemeFromItem\(\{\s*file:\s*item\.file,\s*id:\s*item\.id\s*\}\)/.test(fn),
    "no longer passes both file and id through to the main process",
  );
});

check("preload exposes the renamed call", () => {
  const preload = fs.readFileSync(path.join(__dirname, "..", "preload.cjs"), "utf8");
  assert.ok(
    /setAppThemeFromItem:\s*\(item\)\s*=>\s*ipcRenderer\.invoke\("theme:setFromItem",\s*item\)/.test(
      preload,
    ),
    "preload no longer bridges theme:setFromItem",
  );
});

console.log();
if (failed) {
  console.error(`${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`${passed} passed`);
