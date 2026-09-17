// Tests for offering the folders this PC already has.
//
// "Dropbox and Google Drive support" turned out to need no integration at all:
// all three of Dropbox, Google Drive and OneDrive sync into ordinary folders,
// so the app only has to know where to look instead of making someone find a
// path they have never typed.
//
// Run with: node electron/test/folders.test.cjs

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const SRC = fs.readFileSync(path.join(__dirname, "..", "main.cjs"), "utf8").replace(/\r\n/g, "\n");
const HTML = fs.readFileSync(path.join(__dirname, "..", "settings.html"), "utf8");
const PRELOAD = fs.readFileSync(path.join(__dirname, "..", "preload.cjs"), "utf8");

function extract(name) {
  const at = SRC.indexOf(`function ${name}(`);
  assert.ok(at !== -1, `no function ${name} in main.cjs`);
  const open = SRC.indexOf("{", SRC.indexOf(")", at));
  let depth = 0;
  for (let i = open; i < SRC.length; i++) {
    if (SRC[i] === "{") depth++;
    else if (SRC[i] === "}") { depth--; if (depth === 0) return SRC.slice(at, i + 1); }
  }
  throw new Error(`unbalanced braces reading ${name}`);
}

const built = new Function(
  "path",
  `${extract("samePathKey")}
   ${extract("cloudFolderCandidates")}
   return { samePathKey, cloudFolderCandidates };`,
)(path);
const { samePathKey, cloudFolderCandidates } = built;

let passed = 0;
let failed = 0;
function check(label, fn) {
  try { fn(); passed++; }
  catch (err) { failed++; console.error(`  FAIL  ${label}`); console.error(`        ${err.message}`); }
}

const HOME = "C:/Users/steve";
const paths = (list) => list.map((x) => x.path.replace(/\\/g, "/"));

console.log("where to look");

check("the usual cloud folders are offered", () => {
  const out = paths(cloudFolderCandidates({}, HOME));
  for (const wanted of [`${HOME}/Dropbox`, `${HOME}/Google Drive`, `${HOME}/My Drive`, `${HOME}/OneDrive`]) {
    assert.ok(out.includes(wanted), `${wanted} is not offered`);
  }
});

check("a work OneDrive is found through its environment variable", () => {
  // A business account lands somewhere like C:\\Users\\steve\\OneDrive - Acme,
  // which no amount of guessing at folder names would find.
  const out = paths(cloudFolderCandidates({ OneDriveCommercial: "C:/Users/steve/OneDrive - Acme" }, HOME));
  assert.ok(out.includes("C:/Users/steve/OneDrive - Acme"));
});

check("each folder's Pictures subfolder is offered too", () => {
  const out = paths(cloudFolderCandidates({}, HOME));
  assert.ok(out.includes(`${HOME}/Dropbox/Pictures`));
  assert.ok(out.includes(`${HOME}/Pictures`), "the plain Pictures folder is missing");
});

check("Pictures does not get a Pictures inside it", () => {
  const out = paths(cloudFolderCandidates({}, HOME));
  assert.ok(!out.includes(`${HOME}/Pictures/Pictures`));
});

check("the same folder is never offered twice", () => {
  // OneDrive appears both as an environment variable and as a guess at the
  // folder name, and those are usually the same place. This failed on Windows
  // and passed on Linux, because path.join joins with a backslash there and
  // the environment variable came back with forward slashes, so the two
  // spellings of one folder did not match.
  for (const spelling of [`${HOME}/OneDrive`, `${HOME}\\OneDrive`, `${HOME}\\OneDrive\\`]) {
    const out = cloudFolderCandidates({ OneDrive: spelling }, HOME).map((x) => samePathKey(x.path));
    assert.strictEqual(new Set(out).size, out.length, `duplicates for ${spelling}: ${out.join(", ")}`);
  }
});

check("two spellings of one folder compare equal", () => {
  assert.strictEqual(samePathKey("C:/Users/steve/OneDrive"), samePathKey("C:\\Users\\Steve\\OneDrive"));
  assert.strictEqual(samePathKey("C:/Users/steve/OneDrive/"), samePathKey("C:/Users/steve/OneDrive"));
  assert.notStrictEqual(samePathKey("C:/Users/steve/OneDrive"), samePathKey("C:/Users/steve/OneDrive2"));
  assert.strictEqual(samePathKey(null), "");
});

check("a folder already added is compared the same way", () => {
  const at = SRC.indexOf("ipcMain.handle('folder:cloudRoots'");
  const handler = SRC.slice(at, at + 700);
  assert.ok(/\(config\.folderPaths \|\| \[\]\)\.map\(samePathKey\)/.test(handler));
  assert.ok(/chosen\.has\(samePathKey\(item\.path\)\)/.test(handler));
});

check("no home directory is not a crash", () => {
  assert.doesNotThrow(() => cloudFolderCandidates({}, ""));
  assert.doesNotThrow(() => cloudFolderCandidates(null, null));
});

console.log("what happens to them");

check("only folders that exist and are not already added are offered", () => {
  const at = SRC.indexOf("ipcMain.handle('folder:cloudRoots'");
  assert.ok(at !== -1, "nothing offers them");
  const handler = SRC.slice(at, at + 700);
  assert.ok(/statSync\(item\.path\)\.isDirectory\(\)/.test(handler), "a folder that is not there would still be offered");
  assert.ok(/chosen\.has\(samePathKey\(item\.path\)\)/.test(handler), "a folder already added would be offered again");
  assert.ok(/slice\(0, 6\)/.test(handler), "the list is unbounded");
});

check("adding one checks the path rather than trusting the window", () => {
  const at = SRC.indexOf("ipcMain.handle('folder:addKnown'");
  assert.ok(at !== -1);
  const handler = SRC.slice(at, at + 600);
  assert.ok(/statSync\(dir\)\.isDirectory\(\)/.test(handler), "any path sent from the renderer would be accepted");
});

check("the card renders them and the preload exposes them", () => {
  assert.ok(/id="folderQuickAdd"/.test(HTML));
  assert.ok(/async function renderFolderQuickAdd\(\)/.test(HTML));
  assert.ok(/renderFolderQuickAdd\(\);/.test(HTML), "it is defined but never called");
  assert.ok(/folderCloudRoots:/.test(PRELOAD) && /folderAddKnown:/.test(PRELOAD));
});

check("the card explains what an online-only picture does", () => {
  // The interesting failure with cloud folders is a file that is not really on
  // disk yet, and the honest thing is to say so rather than to pretend.
  assert.ok(/online only is downloaded by Windows/.test(HTML), "nothing mentions online-only files");
});

console.log();
if (failed) { console.error(`${failed} failed, ${passed} passed`); process.exit(1); }
console.log(`${passed} passed`);
