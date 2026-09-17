// Structural checks on the settings window.
//
// settings.html is one 200 KB file with no test harness, so these are not
// behavioural tests; they pin down the specific mistakes that have already
// been made in it once, where the code reads as correct and the window is
// quietly wrong.
//
// Run with: node electron/test/settings-ui.test.cjs

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const HTML = fs
  .readFileSync(path.join(__dirname, "..", "settings.html"), "utf8")
  .replace(/\r\n/g, "\n");

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

function fn(name) {
  const at = HTML.indexOf(`function ${name}(`);
  assert.ok(at !== -1, `no function ${name} in settings.html`);
  const open = HTML.indexOf("{", HTML.indexOf(")", at));
  let depth = 0;
  for (let i = open; i < HTML.length; i++) {
    if (HTML[i] === "{") depth++;
    else if (HTML[i] === "}") {
      depth--;
      if (depth === 0) return HTML.slice(at, i + 1);
    }
  }
  throw new Error(`unbalanced braces reading ${name}`);
}

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
  assert.ok(/^let fadeBtnEl = null;$/m.test(HTML), "no module-level reference to keep it alive");
});

check("the button is only wired once, to the node that is kept", () => {
  assert.ok(
    /const fadeBtn = fadeBtnEl \|\| document\.getElementById\('btn-fade'\)/.test(HTML),
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

console.log();
if (failed) {
  console.error(`${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`${passed} passed`);
