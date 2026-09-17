// The settings window, actually loaded and poked at.
//
// Everything else in this suite reads settings.html as text. That catches a
// control that has gone missing; it does not catch the window throwing on
// startup. It threw on startup in 1.2.0-beta.1: renderHotkeyStatus called
// chk(), which is a local helper inside hydrateInputs and collect, so a
// ReferenceError came out of the first line of wireAllCards -- the first thing
// renderCards does -- and every control in the window lost its wiring. The
// visible symptom was one button, Fade, not working.
//
// So: load the page in jsdom with a stub of the preload API, let it start, and
// check that it started cleanly and that things respond.
//
// Run with: node electron/test/window.test.cjs

const assert = require("assert");
const { JSDOM, VirtualConsole } = require("jsdom");
const { HTML, JS } = require("./sources.cjs");

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

const INFO = {
  current: { id: "abc123", file: "C:/cache/abc123.jpg", resolution: "3840x2160" },
  cacheMB: 120, pinnedMB: 10, historyCount: 4, canBack: true, canForward: false, paused: false,
};

// A config with enough shape for the window to hydrate from.
function baseConfig() {
  return {
    theme: "glass", uiAccent: "#7c5cff", cycleMinutes: 30, cacheMaxMB: 1024,
    categories: { general: true, anime: false, people: false },
    purity: { sfw: true, sketchy: false, nsfw: false },
    sorting: "random", order: "desc", topRange: "1M", colors: [], ratios: "",
    resolutions: "", atleastResolution: "", query: "", playlists: {}, presets: {},
    likes: [], dislikes: [], hotkeys: {}, hotkeysEnabled: true,
    schedule: { enabled: false, rules: [] }, collapsed: {}, sectionsOpen: {},
    uiPage: "home", uiTabs: {}, sourceMode: "search", folderPaths: [],
  };
}

// Load the window. Returns the dom, the calls the window made into the stub
// API, and anything that went wrong while it started.
function loadWindow() {
  const errors = [];
  const calls = [];
  const config = baseConfig();

  const record = (name, value) => (...args) => {
    calls.push({ name, args });
    return Promise.resolve(typeof value === "function" ? value(...args) : value);
  };

  const known = {
    getConfig: record("getConfig", () => JSON.parse(JSON.stringify(config))),
    setConfig: record("setConfig", (patch) => Object.assign(config, patch)),
    info: record("info", INFO),
    history: record("history", []),
    appVersion: record("appVersion", "0.0.0-test"),
    updateInfo: record("updateInfo", { current: "0.0.0-test", info: {}, storeManaged: false }),
    hotkeysStatus: record("hotkeysStatus", { ok: true, registered: [], failed: [] }),
    accountStatus: record("accountStatus", { signedIn: false }),
    setWindowOpacity: record("setWindowOpacity", true),
    searchRun: record("searchRun", { items: [], meta: {} }),
    changelog: record("changelog", "# test"),
    portableInfo: record("portableInfo", { portable: false, dir: "C:/x" }),
    likes: record("likes", []),
  };

  // Anything the window asks for that is not modelled above still answers,
  // with something harmlessly shaped like data. The point is to find code that
  // throws, not to reimplement the main process.
  const api = new Proxy(known, {
    get: (target, prop) =>
      prop in target
        ? target[prop]
        : typeof prop === "string"
          ? record(prop, () => ({ ok: true, items: [], categories: [], presets: [], list: [], data: [] }))
          : undefined,
    has: () => true,
  });

  // jsdom does not implement a handful of browser APIs the window legitimately
  // uses (scrolling, layout). Those are limits of the harness, not faults in
  // the page, and drowning the real errors in them helps nobody.
  const HARNESS_LIMITS = /Not implemented:|Could not parse CSS|Error: Not implemented/;
  const note = (msg) => { if (!HARNESS_LIMITS.test(msg)) errors.push(msg); };

  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (e) => note(String((e && e.message) || e)));
  virtualConsole.on("error", (...a) => note(a.join(" ")));

  const dom = new JSDOM(HTML, {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "file:///settings.html",
    virtualConsole,
  });
  dom.window.api = api;

  const onRejection = (e) => note("unhandled rejection: " + ((e && e.message) || e));
  process.on("unhandledRejection", onRejection);

  // settings.html loads settings.js with a script tag, and jsdom is told not to
  // fetch anything, so the file is read and run here instead. Same code, same
  // order: the tag is at the end of the body, after the markup exists.
  try {
    dom.window.eval(JS);
  } catch (e) {
    errors.push("the window threw while starting: " + e.message);
  }

  return { dom, errors, calls, config, done: () => process.off("unhandledRejection", onRejection) };
}

// Let the window's own promises settle before looking at it.
function settle(ms = 60) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  console.log("the window starts");

  const w = loadWindow();
  await settle(150);
  const doc = w.dom.window.document;

  check("nothing throws while it starts", () => {
    assert.deepStrictEqual(w.errors, [], `errors during startup:\n        ${w.errors.join("\n        ")}`);
  });

  check("the sidebar and the cards are built", () => {
    assert.ok(doc.querySelectorAll("#sidebar .nav-item").length >= 5, "no navigation");
    assert.ok(doc.querySelectorAll("#cards .card").length >= 3, "no cards");
  });

  check("wireAllCards ran, so the controls are live", () => {
    // If anything in wireAllCards throws, every handler after it is lost. Save
    // is wired there and is the one control the window cannot do without.
    const save = doc.getElementById("btn-save");
    assert.ok(save, "no Save button");
    assert.ok(typeof save.onclick === "function", "Save is not wired: wireAllCards threw");
  });

  console.log("fade");

  check("the button is in the sidebar and visible", () => {
    const fade = doc.getElementById("btn-fade");
    assert.ok(fade, "the Fade button is gone");
    assert.strictEqual(fade.hidden, false, "it is still hidden");
    assert.ok(fade.parentElement.className.includes("nav-foot"), "it is not in the sidebar footer");
  });

  check("it survives navigating to another page", () => {
    // renderSidebar clears the sidebar, and this button is moved into it.
    w.dom.window.goPage("settings");
    w.dom.window.goPage("library");
    const fade = doc.getElementById("btn-fade");
    assert.ok(fade, "navigating deleted the Fade button");
    assert.ok(fade.parentElement.className.includes("nav-foot"), "it fell out of the sidebar");
  });

  await (async () => {
    // Hovering for a second fades the window. This is the behaviour the user
    // reported as broken, so test the behaviour rather than the markup.
    const fade = doc.getElementById("btn-fade");
    const before = w.calls.filter((c) => c.name === "setWindowOpacity").length;
    fade.dispatchEvent(new w.dom.window.MouseEvent("mouseenter"));
    await settle(1300);
    const after = w.calls.filter((c) => c.name === "setWindowOpacity");
    check("hovering it actually fades the window", () => {
      assert.ok(after.length > before, "hovering the Fade button did nothing at all");
      assert.ok(after[after.length - 1].args[0] < 0.2, "the window was not faded");
    });
  })();

  console.log("the welcome panel");

  check("a fresh install is greeted", () => {
    // The stub config has no lastSeenVersion, which is what a first run looks
    // like: no config file was ever written.
    const panel = doc.getElementById("intro-panel");
    assert.ok(panel, "no intro panel in the window");
    assert.notStrictEqual(panel.style.display, "none", "a fresh install sees nothing at all");
    assert.ok(/Welcome/i.test(doc.getElementById("intro-title").textContent));
  });

  // Click, let the write settle, then assert: an async body passed to check()
  // would pass regardless of what it threw.
  doc.getElementById("intro-dismiss").click();
  await settle(60);

  check("dismissing it records the version, so it does not come back", () => {
    assert.strictEqual(doc.getElementById("intro-panel").style.display, "none");
    const saved = w.calls.filter((c) => c.name === "setConfig" && c.args[0] && c.args[0].lastSeenVersion);
    assert.ok(saved.length > 0, "nothing was remembered, so it will greet them again");
  });

  console.log("the status lines the cards draw");

  check("the keyboard card can be drawn without a shortcut set", () => {
    // renderHotkeyStatus used to call chk(), a helper local to two other
    // functions, and took the whole window down with it.
    w.dom.window.goPage("settings");
    assert.doesNotThrow(() => w.dom.window.renderHotkeyStatus());
    const el = doc.getElementById("hk-status");
    if (el) assert.ok(el.textContent.trim().length > 0, "the status line is empty");
  });

  check("no errors accumulated while being used", () => {
    assert.deepStrictEqual(w.errors, [], `errors after interaction:\n        ${w.errors.join("\n        ")}`);
  });

  w.done();
  console.log();
  if (failed) {
    console.error(`${failed} failed, ${passed} passed`);
    process.exit(1);
  }
  console.log(`${passed} passed`);
})();
