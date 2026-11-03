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
  cacheMB: 120,
  pinnedMB: 10,
  historyCount: 4,
  canBack: true,
  canForward: false,
  paused: false,
};

// A config with enough shape for the window to hydrate from.
function baseConfig() {
  return {
    theme: "glass",
    uiAccent: "#7c5cff",
    cycleMinutes: 30,
    cacheMaxMB: 1024,
    categories: { general: true, anime: false, people: false },
    purity: { sfw: true, sketchy: false, nsfw: false },
    sorting: "random",
    order: "desc",
    topRange: "1M",
    colors: [],
    ratios: "",
    resolutions: "",
    atleastResolution: "",
    query: "",
    playlists: {},
    presets: {},
    likes: [],
    dislikes: [],
    hotkeys: {},
    hotkeysEnabled: true,
    schedule: { enabled: false, rules: [] },
    collapsed: {},
    sectionsOpen: {},
    uiPage: "home",
    uiTabs: {},
    sourceMode: "search",
    folderPaths: [],
  };
}

// Load the window. Returns the dom, the calls the window made into the stub
// API, and anything that went wrong while it started.
function loadWindow() {
  const errors = [];
  const calls = [];
  const config = baseConfig();

  const record =
    (name, value) =>
    (...args) => {
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
          ? record(prop, () => ({
              ok: true,
              items: [],
              categories: [],
              presets: [],
              list: [],
              data: [],
            }))
          : undefined,
    has: () => true,
  });

  // jsdom does not implement a handful of browser APIs the window legitimately
  // uses (scrolling, layout). Those are limits of the harness, not faults in
  // the page, and drowning the real errors in them helps nobody.
  const HARNESS_LIMITS = /Not implemented:|Could not parse CSS|Error: Not implemented/;
  const note = (msg) => {
    if (!HARNESS_LIMITS.test(msg)) errors.push(msg);
  };

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
    assert.deepStrictEqual(
      w.errors,
      [],
      `errors during startup:\n        ${w.errors.join("\n        ")}`,
    );
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

  console.log("the first-run tour");

  check("a fresh install gets the wizard, not the what's new banner", () => {
    // The stub config has no lastSeenVersion, which is what a first run looks
    // like: no config file was ever written.
    const modal = doc.getElementById("onboarding-modal");
    assert.ok(modal, "no onboarding modal in the window");
    assert.notStrictEqual(modal.style.display, "none", "a fresh install sees nothing at all");
    assert.ok(/Welcome/i.test(doc.getElementById("onboarding-title").textContent));
    assert.strictEqual(
      doc.getElementById("intro-panel").style.display,
      "none",
      "the what's new banner showed up too -- a fresh install should only see one of them",
    );
    assert.strictEqual(doc.getElementById("onboarding-back").style.display, "none", "Back on step one");
  });

  doc.getElementById("onboarding-next").click(); // 1 Welcome -> 2 API key
  await settle(30);

  check("the API key step is empty, matching a config with none set yet", () => {
    assert.ok(/API key/i.test(doc.getElementById("onboarding-title").textContent));
    const input = doc.getElementById("onb-apikey");
    assert.ok(input, "no API key field on this step");
    assert.strictEqual(input.value, "");
  });

  doc.getElementById("onb-apikey").value = "a".repeat(32);
  doc.getElementById("onboarding-next").click(); // 2 API key -> 3 filters
  await settle(30);

  check("typing a key and moving on saves it", () => {
    const saved = w.calls.filter((c) => c.name === "setConfig" && c.args[0]?.apiKey);
    assert.ok(saved.length > 0, "the API key was never sent to setConfig");
    assert.strictEqual(saved[saved.length - 1].args[0].apiKey, "a".repeat(32));
  });

  check("the filters step opens pre-filled from the current config", () => {
    assert.ok(/looks for/i.test(doc.getElementById("onboarding-title").textContent));
    // baseConfig() has general/sfw on, everything else off.
    assert.strictEqual(doc.getElementById("onb-cat-general").checked, true);
    assert.strictEqual(doc.getElementById("onb-cat-anime").checked, false);
    assert.strictEqual(doc.getElementById("onb-pur-sfw").checked, true);
    assert.strictEqual(doc.getElementById("onb-pur-nsfw").checked, false);
  });

  doc.getElementById("onb-cat-anime").checked = true;
  doc.getElementById("onboarding-next").click(); // 3 filters -> 4 cycling
  await settle(30);

  check("toggling a filter and moving on saves it", () => {
    const saved = w.calls.filter((c) => c.name === "setConfig" && c.args[0]?.categories);
    assert.ok(saved.length > 0, "the filter change was never sent to setConfig");
    assert.strictEqual(saved[saved.length - 1].args[0].categories.anime, true);
    assert.strictEqual(saved[saved.length - 1].args[0].categories.general, true, "General got lost");
  });

  check("the real Search & filters checkbox picked up the change too", () => {
    // Every card is built once at boot and just shown/hidden by page; the
    // wizard's save re-hydrates the whole form, so the real card (wherever
    // it sits in the DOM right now) should already agree, no restart needed.
    assert.strictEqual(doc.getElementById("cat-anime").checked, true);
  });

  check("the cycling step opens pre-filled too", () => {
    assert.ok(/often it changes/i.test(doc.getElementById("onboarding-title").textContent));
    assert.strictEqual(doc.getElementById("onb-cycle").value, "30");
  });

  doc.getElementById("onb-cycle").value = "45";
  doc.getElementById("onboarding-next").click(); // 4 cycling -> 5 browse
  await settle(30);

  check("changing the cycle minutes and moving on saves it, and the real field agrees", () => {
    const saved = w.calls.filter((c) => c.name === "setConfig" && c.args[0]?.cycleMinutes);
    assert.ok(saved.length > 0, "the cycle minutes change was never sent to setConfig");
    assert.strictEqual(saved[saved.length - 1].args[0].cycleMinutes, 45);
    assert.strictEqual(doc.getElementById("cycleMinutesNum").value, "45");
  });

  const pageHeadTitle = () => doc.querySelector("#page-head h2")?.textContent;
  const activeTabLabel = () => doc.querySelector("#subnav .tab.on")?.textContent;

  check("the rest of the tour actually brings up the real page, not just modal text", () => {
    assert.ok(/new/i.test(doc.getElementById("onboarding-title").textContent), "did not land on the Browse step");
    assert.strictEqual(pageHeadTitle(), "Browse", "Browse step did not navigate there");
  });

  doc.getElementById("onboarding-next").click(); // 5 browse -> 6 history
  await settle(30);
  check("the history step lands on Library > History", () => {
    assert.ok(/already seen/i.test(doc.getElementById("onboarding-title").textContent));
    assert.strictEqual(pageHeadTitle(), "Library");
    assert.strictEqual(activeTabLabel(), "History");
  });

  doc.getElementById("onboarding-next").click(); // 6 history -> 7 favourites
  await settle(30);
  check("the favourites step switches tabs to Favourites", () => {
    assert.ok(/liked and disliked/i.test(doc.getElementById("onboarding-title").textContent));
    assert.strictEqual(activeTabLabel(), "Favourites");
  });

  doc.getElementById("onboarding-next").click(); // 7 favourites -> 8 playlists
  await settle(30);
  check("the playlists step switches tabs to Playlists", () => {
    assert.ok(/playlists/i.test(doc.getElementById("onboarding-title").textContent));
    assert.strictEqual(activeTabLabel(), "Playlists");
  });

  doc.getElementById("onboarding-next").click(); // 8 playlists -> 9 presets
  await settle(30);
  check("the presets step lands on Presets", () => {
    assert.ok(/presets/i.test(doc.getElementById("onboarding-title").textContent));
    assert.strictEqual(pageHeadTitle(), "Presets");
  });

  doc.getElementById("onboarding-next").click(); // 9 presets -> 10 timetable
  await settle(30);
  check("the timetable step lands on Schedule", () => {
    assert.ok(/timetable/i.test(doc.getElementById("onboarding-title").textContent));
    assert.strictEqual(pageHeadTitle(), "Schedule");
  });

  doc.getElementById("onboarding-next").click(); // 10 timetable -> 11 hotkeys
  await settle(30);
  check("the hotkeys step lands on Settings > Keyboard", () => {
    assert.ok(/keyboard shortcuts/i.test(doc.getElementById("onboarding-title").textContent));
    assert.strictEqual(pageHeadTitle(), "Settings");
    assert.strictEqual(activeTabLabel(), "Keyboard");
  });

  doc.getElementById("onboarding-next").click(); // 11 hotkeys -> 12 sign-in
  await settle(30);

  check("it ends on the sign-in offer, on Settings > Account & sync", () => {
    assert.ok(/Sign in/i.test(doc.getElementById("onboarding-title").textContent));
    assert.strictEqual(doc.getElementById("onboarding-next").textContent, "Continue");
    assert.strictEqual(activeTabLabel(), "Account & sync");
    assert.notStrictEqual(
      doc.getElementById("onboarding-back").style.display,
      "none",
      "Back should be back once we've moved off step one",
    );
  });

  // Skip tour, not Continue: declining the sign-in offer still has to end the
  // tour and remember it was seen, the same as clicking through would.
  doc.getElementById("onboarding-skip").click();
  await settle(60);

  check("declining still records the version, so the wizard does not come back", () => {
    assert.strictEqual(doc.getElementById("onboarding-modal").style.display, "none");
    const saved = w.calls.filter(
      (c) => c.name === "setConfig" && c.args[0] && c.args[0].lastSeenVersion,
    );
    assert.ok(saved.length > 0, "nothing was remembered, so it will greet them again");
    assert.ok(
      w.calls.every((c) => c.name !== "accountSignIn"),
      "Skip tour should not have started a sign-in",
    );
  });

  check("declining puts you back where the tour found you, not wherever it last navigated", () => {
    assert.strictEqual(pageHeadTitle(), "Home", "stranded on a tour page instead of restored to Home");
  });

  console.log("replaying the wizard from Settings");

  check("Settings > Updates has a way to run it again", () => {
    w.dom.window.goPage("settings");
    const btn = doc.getElementById("btn-replay-onboarding");
    assert.ok(btn, "no replay button in the Updates card");
    btn.click();
    const modal = doc.getElementById("onboarding-modal");
    assert.notStrictEqual(modal.style.display, "none", "clicking it did not reopen the wizard");
    assert.ok(/Welcome/i.test(doc.getElementById("onboarding-title").textContent), "did not restart at step one");
  });

  doc.getElementById("onboarding-skip").click();
  await settle(30);

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
    assert.deepStrictEqual(
      w.errors,
      [],
      `errors after interaction:\n        ${w.errors.join("\n        ")}`,
    );
  });

  w.done();
  console.log();
  if (failed) {
    console.error(`${failed} failed, ${passed} passed`);
    process.exit(1);
  }
  console.log(`${passed} passed`);
})();
