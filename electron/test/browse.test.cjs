// Tests for the Browse card searching without changing your settings.
//
// Browse used to save the entire settings form before every search, so looking
// up "cyberpunk" overwrote the search the wallpapers rotate on. The only way to
// look at something else was to destroy what you had. The search now carries
// its own query and sort, used once, and nothing is written.
//
// Run with: node electron/test/browse.test.cjs

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const { MAIN: SRC, HTML, JS, extractFrom, hasCode } = require("./sources.cjs");

function extract(name) {
  const start = SRC.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `could not find function ${name} in main.cjs`);
  const open = SRC.indexOf("{", SRC.indexOf(")", start));
  let depth = 0;
  for (let j = open; j < SRC.length; j++) {
    if (SRC[j] === "{") depth++;
    else if (SRC[j] === "}") {
      depth--;
      if (depth === 0) return SRC.slice(start, j + 1);
    }
  }
  throw new Error(`unbalanced braces reading ${name}`);
}

function extractConst(name) {
  const re = new RegExp("const " + name + " = ([\\s\\S]*?);\\n", "m");
  const m = re.exec(SRC);
  assert.ok(m, `could not find const ${name}`);
  return `const ${name} = ${m[1]};`;
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

const browseOverrides = new Function(
  `${extractConst("BROWSE_SORTS")}
   ${extractConst("BROWSE_RANGES")}
   ${extract("browseOverrides")}
   return browseOverrides;`,
)();

console.log("what a browse search is allowed to change");

check("a known sort is accepted", () => {
  assert.deepStrictEqual(browseOverrides({ sorting: "toplist", topRange: "1M" }), {
    sorting: "toplist",
    topRange: "1M",
  });
  assert.deepStrictEqual(browseOverrides({ sorting: "random" }), { sorting: "random" });
});

check("an unknown sort is dropped rather than passed to Wallhaven", () => {
  assert.deepStrictEqual(browseOverrides({ sorting: "best" }), {});
  assert.deepStrictEqual(browseOverrides({ topRange: "10y" }), {});
});

check("nothing else can be overridden from the renderer", () => {
  // Purity and categories decide what the app is willing to show at all.
  // Browse must not be able to widen them for a search, however it is called.
  const out = browseOverrides({
    sorting: "random",
    purity: { sfw: false, sketchy: true, nsfw: true },
    categories: { general: true, anime: true, people: true },
    apiKey: "stolen",
    atleastResolution: "",
  });
  assert.deepStrictEqual(Object.keys(out), ["sorting"]);
});

check("junk input is an empty override, not a crash", () => {
  for (const v of [null, undefined, "", 42, [], "sorting=random"]) {
    assert.deepStrictEqual(browseOverrides(v), {}, `failed on ${String(v)}`);
  }
});

console.log("the handler uses them, and the query");

check("search:run takes a query and overrides", () => {
  assert.ok(hasCode(SRC, "ipcMain.handle('search:run'"), "no search:run handler");
  assert.ok(hasCode(SRC, "query = null, overrides = null"), "the handler still only takes a page");
  assert.ok(
    hasCode(SRC, "typeof query === 'string' ? query : config.query"),
    "an empty query does not fall back to the saved one",
  );
  assert.ok(
    hasCode(SRC, "buildSearchUrl(overs, page"),
    "the overrides are not passed to the URL builder",
  );
});

check("both the single and multi-group paths honour the overrides", () => {
  // The whole handler: from where it starts to the next ipcMain.handle.
  const at = SRC.indexOf('ipcMain.handle("search:run"');
  const handler = SRC.slice(at, SRC.indexOf("ipcMain.handle(", at + 20));
  const uses = handler.match(/buildSearchUrl\(overs,/g) || [];
  assert.strictEqual(
    uses.length,
    2,
    `expected both search paths to use the overrides, found ${uses.length}`,
  );
});

console.log("the card no longer writes your settings");

check("runBrowse does not save the form", () => {
  const body = extractFrom(JS, "runBrowse");
  assert.ok(!/api\.setConfig/.test(body), "browsing still overwrites the saved search");
  assert.ok(/query: q \|\| null/.test(body), "the typed query is not sent");
  assert.ok(/browseSortOverrides\(sortValue\)/.test(body), "the sort is not sent");
});

check("the card has its own search box and sort", () => {
  assert.ok(/id="browseQuery"/.test(HTML));
  assert.ok(/id="browseSort"/.test(HTML));
  assert.ok(/value="toplist:1M"/.test(HTML), "no toplist option to open on");
});

check("what was typed survives the card being rebuilt", () => {
  // Every navigation rebuilds the card from its template, which would
  // otherwise clear the box while the results below stayed on screen.
  const body = extractFrom(JS, "wireBrowse");
  assert.ok(/q\.value = browseState\.query/.test(body));
  assert.ok(/sort\.value = browseState\.sort/.test(body));
});

check("opening Browse loads something instead of an empty grid", () => {
  assert.ok(
    hasCode(JS, "if (id === 'browse' && !browseState.searched)"),
    "goPage does not run the first search",
  );
  assert.ok(
    hasCode(JS, "if (uiPage === 'browse' && !browseState.searched)"),
    "opening straight onto Browse shows nothing",
  );
});

console.log("the AI art control is gone, and the filter is not");

check("no control, and the value is pinned to exclude", () => {
  assert.ok(!/id="aiArtFilter"/.test(HTML), "the control is still there");
  assert.ok(/aiArtFilter: 1,/.test(JS), "the saved value is no longer forced to exclude");
  // The request must still carry it: Wallhaven's default is exclude, but
  // relying on someone else's default for this is not worth the risk.
  assert.ok(hasCode(SRC, "params.set('ai_art_filter', String(cfg.aiArtFilter))"));
});

console.log();
if (failed) {
  console.error(`${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`${passed} passed`);
