// Structural checks on the settings window.
//
// settings.html is one 200 KB file with no test harness, so these are not
// behavioural tests; they pin down the specific mistakes that have already
// been made in it once, where the code reads as correct and the window is
// quietly wrong.
//
// Run with: node electron/test/settings-ui.test.cjs

const assert = require("assert");
const { HTML, JS, CSS, extractFrom } = require("./sources.cjs");

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

const fn = (name) => extractFrom(JS, name);

console.log("elements that are moved, not recreated");

check("the Fade button survives the sidebar being rebuilt", () => {
  // It is declared in the header markup and moved into the sidebar footer.
  // renderSidebar clears the sidebar first, so looking the button up by id
  // each time meant the first click on any nav item deleted it: Fade vanished
  // until the window was reopened. Holding the node keeps its handlers too.
  const body = fn("renderSidebar");
  assert.ok(/host\.innerHTML = ''/.test(body), "this test is out of date: the sidebar is no longer cleared");
  assert.ok(/fadeBtnEl/.test(body), "renderSidebar does not hold on to the button");
  assert.ok(
    !/const fb = document\.getElementById\('btn-fade'\)/.test(body),
    "renderSidebar looks the button up again, which is what broke it",
  );
  assert.ok(/^let fadeBtnEl = null;$/m.test(JS), "no module-level reference to keep it alive");
});

check("the button is only wired once, to the node that is kept", () => {
  assert.ok(
    /const fadeBtn = fadeBtnEl \|\| document\.getElementById\('btn-fade'\)/.test(JS),
    "the Fade wiring can attach handlers to a node the sidebar has since dropped",
  );
});

console.log("things drawn into cards are redrawn when cards are rebuilt");

check("card-rendered status lines are restored by wireAllCards", () => {
  // renderCards() throws away every card and builds it again from templates on
  // each navigation, so anything written into one has to be put back.
  const body = fn("wireAllCards");
  for (const call of ["renderHotkeyStatus()", "applyStoreUi()"]) {
    assert.ok(body.includes(call), `${call} is not called when the cards are rebuilt`);
  }
});

console.log("nothing between the header and the shell gets painted over");

check("every band above the shell is lifted above the theme backdrop", () => {
  // The raven themes cover the window with a fixed picture and a fixed tint at
  // z-index 0, and lift only the header and the shell above them. A panel
  // between the two keeps its height and loses its contents: the window shows
  // a tall empty band and the sidebar stops meeting the header. beta.2 shipped
  // exactly that.
  // Between the end of the header and the start of the shell: the header is
  // lifted by the themes already, and so is everything inside it.
  const body = HTML.slice(HTML.indexOf("</header>"), HTML.indexOf('<div id="shell">'));
  const ids = [...body.matchAll(/<div id="([\w-]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length >= 2, `expected some bands above the shell, found ${ids.join(", ")}`);
  for (const id of ids) {
    assert.ok(
      new RegExp(`#${id}[^{]*\\{[^}]*z-index: 1`).test(CSS) ||
        new RegExp(`#${id},[^{]*\\{[^}]*z-index: 1`).test(CSS) ||
        new RegExp(`, #${id}[^{]*\\{[^}]*z-index: 1`).test(CSS),
      `#${id} sits between the header and the shell but is not lifted above the theme backdrop`,
    );
  }
});

check("the themes that need it still lift the header and the shell", () => {
  for (const theme of ["raven", "raven-beach", "raven-fire"]) {
    assert.ok(
      new RegExp(`html\\[data-mascot="${theme}"\\] header \\{ position: relative; z-index: 1`).test(CSS) ||
        new RegExp(`html\\[data-mascot="${theme}"\\] #shell`).test(CSS),
      `${theme} no longer lifts its chrome`,
    );
  }
});

console.log("the title bar says what it is acting on");

check("there is a thumbnail of the current wallpaper beside the buttons", () => {
  // Like, dislike and skip act on whatever is on the desktop, which is hidden
  // behind this window while you are pressing them.
  assert.ok(/id="hdr-thumb"/.test(HTML));
  assert.ok(/function renderHeaderThumb\(\)/.test(JS));
  const refreshes = JS.match(/renderHeaderThumb\(\);/g) || [];
  assert.ok(refreshes.length >= 2, "the thumbnail is not refreshed on both paths that change the wallpaper");
});

console.log("no control is lost when templates are moved around");

check("every id the form reads or writes exists in the markup", () => {
  // The settings window is templates plus two functions that walk them by id:
  // hydrateInputs puts the config on screen, collectConfig reads it back. Move
  // a control into a different template and drop it by accident and neither
  // function complains -- the setting simply stops being saved, silently, and
  // the next save writes whatever the default happens to be.
  const ids = new Set();
  for (const name of ["hydrateInputs", "collect"]) {
    const body = fn(name);
    for (const m of body.matchAll(/[$(]?['"]#([A-Za-z][\w-]*)['"]/g)) ids.add(m[1]);
  }
  assert.ok(ids.size > 30, `only found ${ids.size} ids, the extractor is probably broken`);
  const missing = [...ids].filter((id) => !new RegExp(`id="${id}"`).test(HTML));
  assert.deepStrictEqual(missing, [], `ids referenced but not in any template: ${missing.join(", ")}`);
});

check("every card part names a template that exists", () => {
  // A card with a `parts` list renders each one from tpl-<id>. A part with no
  // template renders as nothing at all, which looks like a missing section.
  const meta = JS.slice(JS.indexOf("const CARD_META = {"), JS.indexOf("// Quick actions on Home"));
  const parts = [...meta.matchAll(/\{ id: '([\w-]+)',\s*label:/g)].map((m) => m[1]);
  assert.ok(parts.length >= 8, `found ${parts.length} card parts, expected more`);
  for (const id of new Set(parts)) {
    assert.ok(new RegExp(`<template id="tpl-${id}">`).test(HTML), `no template for card part ${id}`);
  }
});

console.log();
if (failed) {
  console.error(`${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`${passed} passed`);
