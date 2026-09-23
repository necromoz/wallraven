// Structural checks on the settings window.
//
// settings.html is one 200 KB file with no test harness, so these are not
// behavioural tests; they pin down the specific mistakes that have already
// been made in it once, where the code reads as correct and the window is
// quietly wrong.
//
// Run with: node electron/test/settings-ui.test.cjs

const assert = require("assert");
const { HTML, HTML_FLAT, JS, CSS, extractFrom, hasCode } = require("./sources.cjs");

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
  assert.ok(
    hasCode(body, "host.innerHTML = ''"),
    "this test is out of date: the sidebar is no longer cleared",
  );
  assert.ok(/fadeBtnEl/.test(body), "renderSidebar does not hold on to the button");
  assert.ok(
    !hasCode(body, "const fb = document.getElementById('btn-fade')"),
    "renderSidebar looks the button up again, which is what broke it",
  );
  assert.ok(/^let fadeBtnEl = null;$/m.test(JS), "no module-level reference to keep it alive");
});

check("the button is only wired once, to the node that is kept", () => {
  assert.ok(
    hasCode(JS, "const fadeBtn = fadeBtnEl || document.getElementById('btn-fade')"),
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
  const between = HTML_FLAT.slice(
    HTML_FLAT.indexOf("</header>"),
    HTML_FLAT.indexOf('<div id="shell">'),
  );
  const ids = [...between.matchAll(/<div id="([\w-]+)"/g)].map((m) => m[1]);
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
      new RegExp(`html\\[data-mascot="${theme}"\\] header \\{ position: relative; z-index: 1`).test(
        CSS,
      ) || new RegExp(`html\\[data-mascot="${theme}"\\] #shell`).test(CSS),
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
  assert.ok(
    refreshes.length >= 2,
    "the thumbnail is not refreshed on both paths that change the wallpaper",
  );
});

console.log("controls that used to trap you");

check("Fade has no click action", () => {
  // Clicking pinned the whole window at 6% opacity, including the button, so
  // there was nothing left to aim at and no obvious way back.
  const at = JS.indexOf("Fade-to-peek");
  assert.ok(at !== -1, "the fade wiring is gone");
  const wiring = JS.slice(at, at + 3000);
  assert.ok(!/pinned = !pinned/.test(wiring), "clicking still pins the window invisible");
  assert.ok(!/classList\.toggle\("on", pinned\)/.test(wiring), "clicking still latches the button");
});

check("the appearance controls save themselves", () => {
  // They used to be a preview that only became real on Save, so any other
  // write -- applying a preset, saving one -- brought the stored theme back.
  assert.ok(/function persistAppearance\(/.test(JS), "nothing persists an appearance change");
  assert.ok(hasCode(JS, "persistAppearance({ theme: value })"), "the theme is still preview-only");
  assert.ok(
    hasCode(JS, "persistAppearance({ uiAccent: value })"),
    "the accent is still preview-only",
  );
});

check("the title bar thumbnail is sized from the buttons beside it", () => {
  // Fixed at 46x26 it sat short next to 35px buttons. Stretching means it
  // tracks whatever the theme does to their padding.
  const at = CSS.indexOf("#hdr-thumb {");
  assert.ok(at !== -1);
  const rule = CSS.slice(at, CSS.indexOf("}", at));
  assert.ok(/align-self: stretch/.test(rule), "it has a height of its own again");
  assert.ok(!/height:/.test(rule), "a fixed height will drift from the buttons");
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
  assert.deepStrictEqual(
    missing,
    [],
    `ids referenced but not in any template: ${missing.join(", ")}`,
  );
});

check("every card part names a template that exists", () => {
  // A card with a `parts` list renders each one from tpl-<id>. A part with no
  // template renders as nothing at all, which looks like a missing section.
  const meta = JS.slice(JS.indexOf("const CARD_META = {"), JS.indexOf("// Quick actions on Home"));
  const parts = [...meta.matchAll(/id: ["']([\w-]+)["'],\s*label:/g)].map((m) => m[1]);
  assert.ok(parts.length >= 8, `found ${parts.length} card parts, expected more`);
  for (const id of new Set(parts)) {
    assert.ok(
      new RegExp(`<template id="tpl-${id}">`).test(HTML),
      `no template for card part ${id}`,
    );
  }
});

check("clearing likes is offered next to clearing dislikes, and asks first", () => {
  // The window had a Clear dislikes button and no Clear likes, so a like
  // pressed by accident could only be undone one wallpaper at a time.
  assert.ok(/id="btn-clear-likes"/.test(HTML), "no Clear likes button");
  assert.ok(/id="likeCount"/.test(HTML), "no like counter to fill in");
  assert.ok(hasCode(JS, 'const lc = $("#likeCount");'), "the counter is never hydrated");
  const at = JS.indexOf('$("#btn-clear-likes").onclick');
  assert.ok(at !== -1, "Clear likes is never wired up");
  const handler = JS.slice(at, at + 900);
  assert.ok(/confirm\(/.test(handler), "clearing likes must confirm; it destroys a collection");
  assert.ok(/api\.clearLikes\(\)/.test(handler), "handler never calls clearLikes");
  assert.ok(/likedIds\.clear\(\)/.test(handler), "the history grid keeps its stale hearts");
});

check("the title bar thumbs show whether the current wallpaper is liked", () => {
  // There was no way to tell from the header, so the same wallpaper could be
  // liked twice, which silently cleared the like.
  assert.ok(/function renderHeaderReactions\(\)/.test(JS), "no renderHeaderReactions");
  assert.ok(
    hasCode(JS, 'like.classList.toggle("on", state === "liked")'),
    "the Like thumb never lights up",
  );
  assert.ok(
    hasCode(JS, 'dislike.classList.toggle("on", state === "disliked")'),
    "the Dislike thumb never lights up",
  );
  // .on is the styling the Paused button already uses, so the header reads
  // consistently. If that rule goes, the highlight silently does nothing.
  assert.ok(/\.btn\.icon-btn\.on\s*\{/.test(CSS), "no .btn.icon-btn.on rule to light them with");
  const thumb = extractFrom(JS, "renderHeaderThumb");
  assert.ok(/renderHeaderReactions\(\)/.test(thumb), "the header redraw never refreshes them");
  const change = extractFrom(JS, "changeWallpaperReaction");
  assert.ok(
    /renderHeaderReactions\(\)/.test(change),
    "reacting from the Library leaves the header stale",
  );
});

check("every pair of thumbs toggles through the same path as the Library", () => {
  // The old handlers called api.like() then added the id to likedIds whatever
  // happened, so clearing a like left the button lit. The title bar and the
  // Now playing card had separate copies of that fault.
  const like = extractFrom(JS, "reactLikeCurrent");
  assert.ok(
    /changeWallpaperReaction\(currentWp, "liked"\)/.test(like),
    "Like does not go through changeWallpaperReaction",
  );
  assert.ok(!/likedIds\.add/.test(like), "Like still writes likedIds behind the shared helper");
  const dislike = extractFrom(JS, "reactDislikeCurrent");
  assert.ok(
    /wallpaperState\(currentWp\.id\) === "disliked"/.test(dislike),
    "clearing a dislike is not distinguished from making one",
  );
  assert.ok(/api\.dislike\(\)/.test(dislike), "a fresh dislike must still skip to a replacement");
  for (const [id, fn] of [
    ["hdr-like", "reactLikeCurrent"],
    ["hdr-dislike", "reactDislikeCurrent"],
  ]) {
    assert.ok(
      hasCode(JS, `getElementById("${id}")?.addEventListener("click", ${fn})`),
      `${id} is not wired to ${fn}`,
    );
  }
  assert.ok(
    hasCode(JS, '($("#btn-like").onclick = reactLikeCurrent)'),
    "card Like has its own handler",
  );
  assert.ok(
    hasCode(JS, '($("#btn-dislike").onclick = reactDislikeCurrent)'),
    "card Dislike has its own handler",
  );
});

check("Now playing says why this wallpaper was chosen", () => {
  assert.ok(/<div class="why" id="why" hidden><\/div>/.test(HTML), "no Why line in the card");
  const describe = extractFrom(JS, "describeWhy");
  // It must read the reason recorded at the time, never today's settings.
  assert.ok(/wp && wp\.why/.test(describe), "describeWhy does not read the recorded reason");
  assert.ok(
    !/config\.query|cfg\.query/.test(describe),
    "describeWhy guesses from the live search box",
  );
  for (const mode of ["search", "playlist", "folder", "collection", "cache", "manual"]) {
    assert.ok(describe.includes(`case "${mode}"`), `no wording for the ${mode} source`);
  }
  assert.ok(/since been removed/.test(describe), "a deleted timetable entry is not handled");
  const render = extractFrom(JS, "renderWhy");
  assert.ok(
    /before WallRaven started recording why/.test(render),
    "old history shows nothing at all",
  );
  // Both redraws, or the line goes stale after Back and Forward.
  const calls = JS.split("renderHeaderThumb();\n  renderWhy();").length - 1;
  assert.strictEqual(calls, 2, "renderWhy is not called beside both header redraws");
});

console.log();
if (failed) {
  console.error(`${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`${passed} passed`);
