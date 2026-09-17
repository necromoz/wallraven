// Tests for how the app decides it is a Microsoft Store build, and for the
// places that decision has to be honoured.
//
// The risk this guards against is specific: a Store (MSIX) package is
// installed into a system-owned folder and serviced by the Store. If the
// self-updater still ran there it would download an NSIS installer the app
// cannot apply, and at best fail silently, at worst leave the machine with two
// WallRavens. The updater must be inert in a Store build, and stay that way as
// main.cjs changes.
//
// Run with: node electron/test/packaging.test.cjs

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { isStoreBuild, STORE_UPDATE_MESSAGE } = require("../packaging.cjs");

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

console.log("store build detection");

check("a normal installed build is not a Store build", () => {
  assert.strictEqual(
    isStoreBuild({ env: {}, execPath: "C:\\Program Files\\WallRaven\\WallRaven.exe" }),
    false,
  );
});

check("process.windowsStore is believed", () => {
  assert.strictEqual(isStoreBuild({ windowsStore: true, env: {} }), true);
});

check("only a true windowsStore counts, not a truthy one", () => {
  // Electron sets the property to a boolean. Anything else is a bug elsewhere
  // and should not silently switch the updater off.
  assert.strictEqual(isStoreBuild({ windowsStore: "false", env: {} }), false);
  assert.strictEqual(isStoreBuild({ windowsStore: 1, env: {} }), false);
});

check("running out of WindowsApps counts even without the property", () => {
  assert.strictEqual(
    isStoreBuild({ env: {}, execPath: "C:\\Program Files\\WindowsApps\\Wallraven_1.2.0_x64__abc\\WallRaven.exe" }),
    true,
  );
});

check("the WindowsApps check is not fooled by a similar folder name", () => {
  assert.strictEqual(
    isStoreBuild({ env: {}, execPath: "C:\\Users\\Steve\\WindowsAppsBackup\\WallRaven.exe" }),
    false,
  );
});

check("the environment override turns Store behaviour on", () => {
  for (const v of ["1", "true", "TRUE", "yes"]) {
    assert.strictEqual(isStoreBuild({ env: { WALLRAVEN_STORE_BUILD: v } }), true, `value ${v}`);
  }
});

check("an off-looking override does not turn it on", () => {
  for (const v of ["", "0", "false", "no"]) {
    assert.strictEqual(isStoreBuild({ env: { WALLRAVEN_STORE_BUILD: v } }), false, `value ${v}`);
  }
});

check("a missing env object does not throw", () => {
  assert.strictEqual(isStoreBuild({}), false);
});

check("there is a message to show the user", () => {
  assert.ok(STORE_UPDATE_MESSAGE.length > 40);
  assert.ok(/Store/.test(STORE_UPDATE_MESSAGE));
});

console.log("the updater honours it");

const main = fs.readFileSync(path.join(__dirname, "..", "main.cjs"), "utf8");

function body(name) {
  // Pull one function body out of main.cjs by brace matching from the opening
  // brace of the body -- not the first brace after the name, because a
  // destructured or defaulted parameter list contains braces of its own.
  const at = main.indexOf(`function ${name}(`);
  assert.ok(at !== -1, `${name} not found in main.cjs`);
  let i = main.indexOf("(", at);
  let depth = 0;
  for (; i < main.length; i++) {
    if (main[i] === "(") depth++;
    else if (main[i] === ")") { depth--; if (depth === 0) { i++; break; } }
  }
  const open = main.indexOf("{", i);
  depth = 0;
  for (let j = open; j < main.length; j++) {
    if (main[j] === "{") depth++;
    else if (main[j] === "}") { depth--; if (depth === 0) return main.slice(open, j + 1); }
  }
  throw new Error(`could not read the body of ${name}`);
}

check("STORE_BUILD is decided once, from the shared helper", () => {
  assert.ok(/require\('\.\/packaging\.cjs'\)/.test(main));
  assert.ok(/const STORE_BUILD = isStoreBuild\(\);/.test(main));
});

for (const name of ["checkForUpdates", "downloadUpdate", "installUpdate", "autoUpdateFlow"]) {
  check(`${name} returns early in a Store build`, () => {
    const b = body(name);
    const guard = b.indexOf("STORE_BUILD");
    assert.ok(guard !== -1, `${name} does not mention STORE_BUILD`);
    // The guard has to come before anything that touches the network or the
    // filesystem, so require it in the first few lines rather than anywhere.
    const before = b.slice(0, guard);
    assert.ok(
      before.split("\n").length <= 4,
      `${name} checks STORE_BUILD too late (${before.split("\n").length} lines in)`,
    );
  });
}

check("the scheduled update checks do not run in a Store build", () => {
  const at = main.indexOf("setInterval(() => checkForUpdates(false)");
  assert.ok(at !== -1, "the 6-hourly check is gone entirely");
  const window = main.slice(Math.max(0, at - 400), at);
  assert.ok(/if \(!STORE_BUILD\) \{/.test(window), "the startup checks are not gated on STORE_BUILD");
});

check("applyAutoStart does nothing in a Store build", () => {
  // Writing a Run key from inside an MSIX package either does nothing or
  // registers a path the shell will not launch. Windows owns start-up there.
  const b = body("applyAutoStart");
  assert.ok(/if \(STORE_BUILD\) return;/.test(b), "applyAutoStart still tries to register start-up");
});

check("running from source never touches the Run key", () => {
  // npm run app uses electron.exe from node_modules. Registering that as the
  // login item would overwrite the installed copy's entry with a path that
  // vanishes on the next npm install.
  const b = body("applyAutoStart");
  assert.ok(/if \(DEV_RUN\) return;/.test(b), "a dev run can still overwrite the installed app's start-up entry");
  assert.ok(/const DEV_RUN = !app\.isPackaged;/.test(main));
});

check("a Store build honours start-minimized without a --hidden argument", () => {
  // A startup task cannot pass arguments, so the setting is all there is.
  assert.ok(
    /startedHidden = process\.argv\.includes\('--hidden'\) \|\| \(STORE_BUILD && !!config\.startMinimized\)/.test(main),
    "a Store build launched at login would open the settings window every time",
  );
});

check("the tray hides Check for updates in a Store build", () => {
  assert.ok(
    /STORE_BUILD \? \[\] : \[\{ label: `Check for updates`/.test(main),
    "the tray item is not gated",
  );
});

check("update:info tells the renderer which kind of build this is", () => {
  const at = main.indexOf("ipcMain.handle('update:info'");
  assert.ok(at !== -1);
  const handler = main.slice(at, at + 400);
  assert.ok(/storeManaged: STORE_BUILD/.test(handler));
  assert.ok(/storeMessage/.test(handler));
});

console.log("running it from source");

check("the double-click launcher calls scripts that exist", () => {
  // This file is Steve's only way in: he does not use a terminal. Renaming a
  // script in package.json without changing it would leave him with a window
  // that opens, prints an npm error and closes.
  const bat = fs.readFileSync(path.join(__dirname, "..", "..", "Run WallRaven.bat"), "utf8");
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf8"));
  for (const name of ["app", "app:clean"]) {
    assert.ok(pkg.scripts[name], `package.json has no "${name}" script`);
    assert.ok(bat.includes(`npm run ${name}`), `the launcher never runs "${name}"`);
  }
  assert.ok(/electron electron\/main\.cjs/.test(pkg.scripts.app), "npm run app no longer starts the app");
  assert.ok(/--user-data-dir/.test(pkg.scripts["app:clean"]), "the clean profile is not separate any more");
});

check("the installer build works off Windows too", () => {
  // NSIS cross-compiles, and the beta was built on Linux because that is where
  // this session can run a build at all. It takes -D on POSIX and /D on
  // Windows, and getting that wrong looks like NSIS being absent.
  const build = fs.readFileSync(path.join(__dirname, "..", "..", "scripts", "build-desktop.mjs"), "utf8");
  assert.ok(/const NSIS_FLAG = process\.platform === "win32" \? "\/" : "-";/.test(build));
  assert.ok(/\$\{NSIS_FLAG\}DOUTFILE=/.test(build), "the output path still assumes Windows flags");
  assert.ok(/\$\{NSIS_FLAG\}DAPP_VERSION=/.test(build));
  assert.ok(/probe\.status === 0/.test(build), "a makensis that runs but fails is treated as found");
});

check("the launcher waits rather than vanishing on an error", () => {
  const bat = fs.readFileSync(path.join(__dirname, "..", "..", "Run WallRaven.bat"), "utf8");
  // Every exit path pauses; a console window that closes instantly takes the
  // error message with it.
  const exits = bat.match(/exit \/b 1/g) || [];
  const pauses = bat.match(/\npause/g) || [];
  assert.ok(exits.length >= 2, "no failure paths");
  assert.ok(pauses.length >= exits.length + 1, "a failure path closes without pausing");
});

console.log("the settings window honours it");

const { HTML: html, JS: js } = require("./sources.cjs");

check("the Updates card has somewhere to put the explanation", () => {
  assert.ok(/id="upd-store-note"/.test(html));
  assert.ok(/id="upd-store-text"/.test(html));
});

check("the card asks the main process rather than guessing", () => {
  assert.ok(/api\.updateInfo\?\.\(\)/.test(js), "nothing calls update:info");
  assert.ok(/meta\.storeManaged/.test(js));
});

check("a Store build never kicks off an update check from the renderer", () => {
  assert.ok(/if \(!storeManaged\) api\.updateCheck/.test(js));
});

check("the Startup row says where the switch actually is", () => {
  assert.ok(/id="startup-store-note"/.test(html));
  assert.ok(/function applyStoreUi\(\)/.test(js));
  assert.ok(/applyStoreUi\(\);/.test(js), "applyStoreUi is defined but never called");
  assert.ok(/auto\.disabled = true/.test(js), "the Run on startup checkbox is still usable");
});

check("the update banner stays hidden in a Store build", () => {
  const at = js.indexOf("async function refreshUpdateBanner()");
  assert.ok(at !== -1);
  const fn = js.slice(at, at + 600);
  assert.ok(/if \(storeManaged\) \{ banner\.style\.display = 'none'; return; \}/.test(fn));
});

console.log("");
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
