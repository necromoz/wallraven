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
  for (const theme of ["raven"]) {
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

check("Now playing is a carousel around the wallpaper on screen", () => {
  assert.ok(/id="coverflow"/.test(HTML), "no carousel stage in the card");
  // #thumb is the desktop's own card, inside the track: every existing redraw
  // writes to it, and it slides like the others while browsing.
  const track = HTML.slice(HTML.indexOf('id="cf-track"'), HTML.indexOf('id="cf-note"'));
  assert.ok(/id="thumb"/.test(track), "the desktop's picture is not in the track");
  // The credit line for the picture follows its reason, in both redraws.
  const calls = JS.split("renderWhy();\n  renderCredits();\n  renderCarousel();").length - 1;
  assert.strictEqual(calls, 2, "renderCarousel and renderCredits are not called beside both redraws");
  assert.ok(
    hasCode(JS, "api.onCarouselChanged?.(() => renderCarousel());"),
    "a prefetch landing never redraws it",
  );
});

check("the carousel cannot be painted by a stale answer", () => {
  const r = extractFrom(JS, "renderCarousel");
  assert.ok(/seq !== carouselSeq/.test(r), "an older reply can overwrite a newer one");
  const b = extractFrom(JS, "buildStrip");
  assert.ok(
    /Array\.isArray\(raw\.back\)/.test(b) && /Array\.isArray\(raw\.forward\)/.test(b),
    "unguarded data shape",
  );
});

check("the carousel's cards are layered by z-index, not by 3D depth", () => {
  // Found testing beta.4: with perspective on the shared track, the cards were
  // one 3D scene sorted by depth, so a card sliding into the centre started
  // behind the old centre and only came in front halfway through.
  const at = CSS.indexOf(".cf-track {");
  const track = CSS.slice(at, CSS.indexOf("}", at));
  assert.ok(!/perspective\s*:/.test(track), "the track has a shared perspective again");
  assert.ok(
    !/preserve-3d/.test(CSS.slice(CSS.indexOf(".coverflow {"))),
    "a preserve-3d context would depth-sort them too",
  );
  const d = extractFrom(JS, "drawCarousel");
  assert.ok(
    /perspective\(\$\{CF_PERSPECTIVE\}px\)/.test(d),
    "cards do not carry their own perspective",
  );
  assert.ok(/el\.style\.zIndex = String\(50 - ad\)/.test(d), "nothing orders the cards");
  const s0 = CSS.indexOf(".coverflow {");
  assert.ok(
    /isolation:\s*isolate/.test(CSS.slice(s0, CSS.indexOf("}", s0))),
    "the stage is not isolated",
  );
});

check("the slide animates only what the compositor can, with one shape of transform", () => {
  // Height and top were animated too, which meant a layout pass every frame.
  const at = CSS.indexOf(".coverflow .cf-item,");
  const rule = CSS.slice(at, CSS.indexOf("}", at));
  const transition = (rule.match(/transition:([^;]+);/) || [])[1] || "";
  assert.ok(transition, "no transition found on the cards");
  assert.ok(
    !/\b(top|height|width|left)\b/.test(transition),
    `layout properties are animated: ${transition}`,
  );
  // Same functions in the same order for the centre and the sides, so each
  // interpolates directly.
  const d = extractFrom(JS, "drawCarousel");
  const t = (d.match(/el\.style\.transform = `([^`]+)`/) || [])[1] || "";
  const fns = t.match(/[a-zA-Z]+\(/g) || [];
  assert.deepStrictEqual(
    fns,
    ["translateX(", "calc(", "perspective(", "translateZ(", "rotateY(", "scale("],
    `transform shape changed: ${t}`,
  );
  assert.ok(
    !/el\.style\.transform = "translateX\(-50%\)";\n\s*\} else/.test(d),
    "the centre still uses a different transform shape",
  );
});

check("hidden really hides the carousel's own pieces", () => {
  // The full size view set display:flex, which beats the hidden attribute, so
  // it could not be closed. The same was true of the bar.
  const rule = CSS.slice(
    CSS.indexOf(".cf-viewer[hidden]"),
    CSS.indexOf("}", CSS.indexOf(".cf-viewer[hidden]")),
  );
  for (const sel of [
    ".cf-viewer[hidden]",
    ".cf-bar[hidden]",
    ".cf-scroll[hidden]",
    ".cf-note[hidden]",
  ]) {
    assert.ok(rule.includes(sel), `${sel} is not forced hidden`);
  }
  assert.ok(/display:\s*none\s*!important/.test(rule), "hidden pieces are not display:none");
  const v = extractFrom(JS, "cfOpenViewer");
  assert.ok(/cf-viewer-close/.test(v), "the full size view has no close button");
});

check("browsing never changes the desktop; only Set as wallpaper does", () => {
  // Every input funnels into cfMove, which must not reach the main process.
  const move = extractFrom(JS, "cfMove");
  assert.ok(!/api\./.test(move), "moving the focus calls into the main process");
  const wiring = JS.slice(
    JS.indexOf("(function wireCarouselInput()"),
    JS.indexOf("api.onCarouselChanged?.("),
  );
  for (const bad of ["api.next(", "api.historyGoto(", "api.historySetFromFile("]) {
    assert.ok(!wiring.includes(bad), `input handling calls ${bad} directly`);
  }
  for (const input of [
    '"wheel"',
    '"keydown"',
    '"pointerdown"',
    '"pointermove"',
    '"pointerup"',
    'e.target.id === "cf-scroll"',
  ]) {
    assert.ok(wiring.includes(input), `no ${input} handling`);
  }
  // A drag is told apart from a click by distance, not by timing.
  assert.ok(
    /Math\.abs\(dx\) > 6/.test(wiring),
    "no drag threshold, so every click risks being a drag",
  );
  const set = extractFrom(JS, "cfSetFocused");
  assert.ok(
    /api\.historyGoto\(c\.index\)/.test(set),
    "an earlier wallpaper is not set through history",
  );
  assert.ok(/api\.next\(\)/.test(set), "the next one is not taken off the queue the normal way");
  assert.ok(/api\.historySetFromFile\(/.test(set), "a later playlist item cannot be set");
  assert.ok(
    /id="cf-set"/.test(HTML) && /id="cf-home"/.test(HTML) && /id="cf-view"/.test(HTML),
    "missing a bar button",
  );
});

check("only the cards on screen hold an image", () => {
  // 25 decoded wallpapers for a strip of thumbnails would be hundreds of MB.
  const d = extractFrom(JS, "drawCarousel");
  assert.ok(
    /ad <= CF_VISIBLE \? cfImageFor\(c, d === 0\) : ""/.test(d),
    "off-stage cards keep their images",
  );
  // Side cards prefer Wallhaven's small thumbnail over the full file.
  const img = extractFrom(JS, "cfImageFor");
  assert.ok(
    img.indexOf("if (c.thumb") < img.lastIndexOf("if (c.file)"),
    "side cards load the full file first",
  );
});

check("the Why line follows the picture being looked at", () => {
  const w = extractFrom(JS, "renderWhy");
  assert.ok(
    /cfFocusedItem\(\)/.test(w),
    "Why keeps describing the desktop's picture while browsing",
  );
});

check("each control exists once", () => {
  // The title bar's like, dislike and arrows were repeated on the Now playing
  // card, and the four buttons across the top of Home repeated the sidebar.
  // The like bug existed in two copies because of it.
  for (const id of ["btn-like", "btn-dislike", "btn-back", "btn-forward", "quick-actions"]) {
    assert.ok(!new RegExp(`id="${id}"`).test(HTML), `#${id} is back`);
  }
  assert.ok(!/HOME_ACTIONS/.test(JS), "the Home shortcut buttons are back");
  for (const id of ["hdr-like", "hdr-dislike", "hdr-prev", "btn-next"]) {
    assert.ok(new RegExp(`id="${id}"`).test(HTML), `the title bar lost #${id}`);
  }
});

check("the pause button says what it will do", () => {
  const r = extractFrom(JS, "renderPlayPause");
  assert.ok(
    /cyclePaused \? "Resume" : "Pause"/.test(r),
    "the button shows the state, not the action",
  );
  assert.ok(!/textContent = [^;]*"(Playing|Paused)"/.test(r), "state words are back on the button");
  assert.ok(
    /classList\.toggle\("on", cyclePaused\)/.test(r),
    "the paused state is no longer shown",
  );
});

check("Save says whether there is anything to save", () => {
  assert.ok(
    /const SAVES_ITSELF = \["theme", "uiAccent"\]/.test(JS),
    "self-saving settings count as unsaved",
  );
  // Moving between pages is not an unsaved change.
  assert.ok(
    /const WINDOW_STATE = \[[^\]]*"uiPage"/.test(JS),
    "changing page marks the form unsaved",
  );
  assert.ok(
    /\.\.\.WINDOW_STATE/.test(extractFrom(JS, "formSnapshot")),
    "window state is compared as a setting",
  );
  const r = extractFrom(JS, "renderSaveState");
  assert.ok(
    /"Save changes" : "Saved"/.test(r) && /b\.disabled = !dirty/.test(r),
    "the button does not show the state",
  );
  const h = extractFrom(JS, "hydrateInputs");
  assert.ok(
    /setTimeout\(markFormSaved, 0\)/.test(h),
    "loading settings does not reset the baseline",
  );
  const at = JS.indexOf('$("#btn-save").onclick');
  assert.ok(/markFormSaved\(\)/.test(JS.slice(at, at + 300)), "saving does not reset the baseline");
});

check("Dislike & skip can be undone", () => {
  const f = extractFrom(JS, "flash");
  assert.ok(/toast-action/.test(f) && /action\.run\(\)/.test(f), "toasts cannot carry an Undo");
  const d = extractFrom(JS, "reactDislikeCurrent");
  assert.ok(
    /label: "Undo"/.test(d) && /api\.undoDislike\(item\)/.test(d),
    "no Undo after a dislike",
  );
  // Captured before the dislike moves the desktop on, or Undo restores the wrong one.
  assert.ok(
    d.indexOf("const item = { ...currentWp }") < d.indexOf("await api.dislike()"),
    "Undo would restore the wrong wallpaper",
  );
});

check("the wheel only moves the carousel when meant to", () => {
  const at = JS.indexOf('"wheel"');
  const w = JS.slice(at, at + 1000);
  assert.ok(
    /if \(!sideways && !e\.shiftKey && document\.activeElement !== stage\) return;/.test(w),
    "the wheel is hijacked whenever the pointer passes over",
  );
  assert.ok(
    /stage\.focus\(\{ preventScroll: true \}\)/.test(JS),
    "clicking the carousel does not give it the wheel",
  );
});

check("keyboard focus on the carousel is visible", () => {
  assert.ok(
    /\.coverflow:focus-visible\s*\{[^}]*outline:\s*2px solid/.test(CSS),
    "no visible focus ring",
  );
  const at = CSS.indexOf(".coverflow {");
  assert.ok(
    !/outline:\s*none/.test(CSS.slice(at, CSS.indexOf("}", at))),
    "the focus outline is switched off again",
  );
});

check("the full size view can be moved through and set from", () => {
  const o = extractFrom(JS, "cfOpenViewer");
  for (const cls of ["cf-viewer-prev", "cf-viewer-next", "cf-viewer-set", "cf-viewer-close"]) {
    assert.ok(o.includes(cls), `the view has no ${cls}`);
  }
  // Clicking the picture or a control must not close it.
  assert.ok(/if \(t === v \|\|/.test(o), "any click closes the view");
  const at = JS.indexOf('document.addEventListener("keydown"');
  const kd = JS.slice(at, at + 700);
  assert.ok(
    /ArrowLeft"\) cfViewerStep\(-1\)/.test(kd) && /ArrowRight"\) cfViewerStep\(1\)/.test(kd),
    "arrows do not move through the view",
  );
  assert.ok(
    /cfSetFocused\(\)/.test(extractFrom(JS, "cfViewerSet")),
    "Set in the view does not use the one setting path",
  );
});

check("small things: dislike colour, icons, names, window title", () => {
  assert.ok(
    /#hdr-dislike\.on,[\s\S]{0,80}background:\s*var\(--danger\)/.test(CSS),
    "a lit dislike looks like a lit like",
  );
  assert.ok(!/>◄<|>►</.test(HTML), "text-glyph arrows are back in the title bar");
  assert.ok(/<title>WallRaven<\/title>/.test(HTML), "the window is still called Settings");
  for (const id of ["hdr-like", "hdr-dislike", "hdr-prev", "btn-next"]) {
    assert.ok(
      new RegExp(`id="${id}"[^>]*aria-label=`).test(HTML_FLAT),
      `#${id} has no accessible name`,
    );
  }
});

console.log();
if (failed) {
  console.error(`${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`${passed} passed`);
