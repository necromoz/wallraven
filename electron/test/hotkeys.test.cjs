// Tests for what happens when Windows refuses a global shortcut.
//
// It refuses often: Discord, GeForce Experience and Teams all claim
// combinations in the same range WallRaven suggests, and globalShortcut.register
// then returns false. Every call site used to throw that away inside a
// try/catch, so the shortcut simply did not work and nothing said why. These
// tests run the real functions from main.cjs against a stub Electron.
//
// Run with: node electron/test/hotkeys.test.cjs

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { hasCode } = require("./sources.cjs");

const SRC = fs.readFileSync(path.join(__dirname, "..", "main.cjs"), "utf8").replace(/\r\n/g, "\n");

function extract(name) {
  const start = SRC.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `could not find function ${name} in main.cjs`);
  // Skip the parameter list before looking for the body's opening brace: a
  // destructured or defaulted parameter has braces of its own, and a naive
  // search lands inside it. That has bitten this test suite twice.
  let i = SRC.indexOf("(", start);
  let parens = 0;
  for (; i < SRC.length; i++) {
    if (SRC[i] === "(") parens++;
    else if (SRC[i] === ")") {
      parens--;
      if (parens === 0) {
        i++;
        break;
      }
    }
  }
  i = SRC.indexOf("{", i);
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

// Build a working pair of functions over a stub Electron and a stub renderer.
// `accept` decides which accelerators the operating system hands over.
function build({ config, accept }) {
  const sent = [];
  const noop = () => {};
  const globalShortcut = {
    unregisterAll: noop,
    register: (accel) => {
      if (accept === "throw") throw new Error(`invalid accelerator ${accel}`);
      return accept(accel);
    },
  };
  const factory = new Function(
    "globalShortcut",
    "config",
    "notifySettings",
    "console",
    "fetchAndSetWallpaper",
    "likeCurrent",
    "dislikeCurrent",
    "pickRandomFavorite",
    "setPreviousWallpaper",
    "setNextWallpaper",
    "updateTrayMenu",
    "notifyRenderer",
    `let paused = false;
     let lastHotkeyStatus = { ok: true, registered: [], failed: [] };
     ${extract("registerHotkeys")}
     ${extract("registerHotkeysAndReport")}
     return { registerHotkeys, registerHotkeysAndReport, status: () => lastHotkeyStatus };`,
  );
  const api = factory(
    globalShortcut,
    config,
    (kind, payload) => sent.push({ kind, payload }),
    { warn: noop, log: noop, error: noop },
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
  );
  return { ...api, sent };
}

const HOTKEYS = {
  hotkeysEnabled: true,
  hotkeys: { next: "CmdOrCtrl+Alt+N", like: "CmdOrCtrl+Alt+L", back: "" },
};

console.log("registering");

check("accepted shortcuts are reported as active", () => {
  const { registerHotkeysAndReport, sent } = build({ config: HOTKEYS, accept: () => true });
  const st = registerHotkeysAndReport();
  assert.strictEqual(st.registered.length, 2);
  assert.strictEqual(st.failed.length, 0);
  assert.ok(
    sent.some((m) => m.kind === "hotkeys-status"),
    "the card was never told",
  );
  assert.ok(!sent.some((m) => m.kind === "app-toast"), "it complained about nothing");
});

check("a blank field is not a failure", () => {
  // Blank means "unregistered", which the card says on the tin.
  const { registerHotkeysAndReport } = build({ config: HOTKEYS, accept: () => true });
  const st = registerHotkeysAndReport();
  assert.ok(!st.registered.some((r) => r.key === "back"));
  assert.ok(!st.failed.some((r) => r.key === "back"));
});

check("a shortcut another program owns is reported, by name", () => {
  const { registerHotkeysAndReport, sent } = build({
    config: HOTKEYS,
    accept: (accel) => accel !== "CmdOrCtrl+Alt+N",
  });
  const st = registerHotkeysAndReport();
  assert.deepStrictEqual(
    st.failed.map((f) => f.accel),
    ["CmdOrCtrl+Alt+N"],
  );
  const toast = sent.find((m) => m.kind === "app-toast");
  assert.ok(toast, "no toast was raised");
  assert.ok(/CmdOrCtrl\+Alt\+N/.test(toast.payload.msg), "the toast does not name the shortcut");
  assert.strictEqual(toast.payload.kind, "err");
});

check("an accelerator Electron rejects outright is a failure, not a crash", () => {
  // A typed accelerator can be malformed: Electron throws rather than
  // returning false, and that used to escape into the caller's catch.
  const { registerHotkeysAndReport, sent } = build({ config: HOTKEYS, accept: "throw" });
  const st = registerHotkeysAndReport();
  assert.strictEqual(st.failed.length, 2);
  assert.ok(
    st.failed.every((f) => f.error),
    "the reason was lost",
  );
  assert.ok(sent.some((m) => m.kind === "app-toast"));
});

check("startup reports to the card but does not raise a toast", () => {
  // At launch there is no settings window to toast at, and the card asks for
  // the status when it opens.
  const { registerHotkeysAndReport, sent } = build({
    config: HOTKEYS,
    accept: () => false,
  });
  registerHotkeysAndReport({ announce: false });
  assert.ok(sent.some((m) => m.kind === "hotkeys-status"));
  assert.ok(!sent.some((m) => m.kind === "app-toast"));
});

check("shortcuts switched off means nothing registered and nothing complained about", () => {
  const { registerHotkeysAndReport, sent } = build({
    config: { hotkeysEnabled: false, hotkeys: HOTKEYS.hotkeys },
    accept: () => false,
  });
  const st = registerHotkeysAndReport();
  assert.deepStrictEqual(st.registered, []);
  assert.ok(!sent.some((m) => m.kind === "app-toast"));
});

check("the last status is kept for the card to ask for later", () => {
  const { registerHotkeysAndReport, status } = build({
    config: HOTKEYS,
    accept: (accel) => accel !== "CmdOrCtrl+Alt+L",
  });
  registerHotkeysAndReport();
  assert.deepStrictEqual(
    status().failed.map((f) => f.accel),
    ["CmdOrCtrl+Alt+L"],
  );
});

console.log("the call sites use the reporting version");

check("no caller throws the result away any more", () => {
  assert.ok(
    !/try \{ registerHotkeys\(\); \} catch \{\}/.test(SRC),
    "a call site still swallows the registration result",
  );
  const calls = SRC.match(/registerHotkeysAndReport\(/g) || [];
  assert.ok(calls.length >= 4, `expected every call site plus the handler, found ${calls.length}`);
});

check("there is an IPC handler for the card to ask", () => {
  assert.ok(hasCode(SRC, "ipcMain.handle('hotkeys:status'"));
  assert.ok(hasCode(SRC, "ipcMain.handle('hotkeys:reregister', () => registerHotkeysAndReport())"));
});

check("the settings window shows it", () => {
  const { HTML, JS, PRELOAD } = require("./sources.cjs");
  assert.ok(/id="hk-status"/.test(HTML), "the hotkeys card has nowhere to show this");
  assert.ok(/function renderHotkeyStatus\(\)/.test(JS));
  assert.ok(/api\.onHotkeysStatus/.test(JS), "live updates are not wired");
  // The cards are rebuilt on navigation, so the status has to be re-rendered.
  assert.ok(/renderHotkeyStatus\(\);\n  applyStoreUi\(\);/.test(JS));
  assert.ok(/hotkeysStatus:/.test(PRELOAD) && /onHotkeysStatus:/.test(PRELOAD));
});

console.log();
if (failed) {
  console.error(`${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`${passed} passed`);
