// Tests for the welcome panel and the "what's new" panel.
//
// They are the same panel at different times. A fresh install gets told what
// the app is for; an existing one gets told what was added, and never what was
// fixed, because a list of things that used to be broken is not news to
// somebody who just wanted their wallpaper to change.
//
// Run with: node electron/test/intro.test.cjs

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const { JS, MAIN, read, extractFrom, extractConstFrom, hasCode } = require("./sources.cjs");
const CHANGELOG = read("CHANGELOG.md");

const extract = (name) => extractFrom(JS, name);

const api = new Function(`
  ${extract("parseChangelogVersions")}
  ${extract("chooseIntro")}
  ${extract("renderInline")}
  return { parseChangelogVersions, chooseIntro, renderInline };
`)();

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

console.log("reading the changelog");

const SAMPLE = `# Wallraven changelog

## v1.2.0 — 17 Sep 2026

### New
- **A thing.** It does something.
- **Another thing.**

### Fixed
- **A bug.** It used to hurt.

## v1.1.0 — 16 Sep 2026
- **An old fix.** No sections in this one.
`;

check("versions, and their two kinds of entry, come out separately", () => {
  const out = api.parseChangelogVersions(SAMPLE);
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[0].version, "1.2.0");
  assert.strictEqual(out[0].added.length, 2);
  assert.strictEqual(out[0].fixed.length, 1);
});

check("a version written without sections counts as fixes, not features", () => {
  // Every release before this convention existed is a flat list, and none of
  // it should be announced as new.
  const out = api.parseChangelogVersions(SAMPLE);
  assert.strictEqual(out[1].version, "1.1.0");
  assert.deepStrictEqual(out[1].added, []);
  assert.strictEqual(out[1].fixed.length, 1);
});

check("the real changelog parses, and the build being made is in it", () => {
  const out = api.parseChangelogVersions(CHANGELOG);
  assert.ok(out.length >= 3, `only found ${out.length} versions`);
  const version = fs.readFileSync(path.join(__dirname, "..", "VERSION"), "utf8").trim();
  assert.ok(
    out.some((v) => v.version === version),
    `no changelog entry for ${version}`,
  );
  // A release can be fixes only, and then the panel correctly shows nothing.
  // What must not happen is the sections being absent everywhere, which would
  // mean the convention had quietly been dropped.
  assert.ok(
    out.some((v) => v.added.length > 0),
    "no version anywhere has a New section",
  );
});

check("junk does not throw", () => {
  for (const v of [null, undefined, "", "no headings at all", 42]) {
    assert.doesNotThrow(() => api.parseChangelogVersions(v), `threw on ${String(v)}`);
  }
});

console.log("which panel, if any");

const VERSIONS = [
  { version: "1.2.0", added: ["a", "b"], fixed: ["c"] },
  { version: "1.1.0", added: [], fixed: ["d"] },
];

check("a fresh install gets the welcome", () => {
  assert.deepStrictEqual(api.chooseIntro("1.2.0", "", VERSIONS), { kind: "welcome" });
});

check("an existing install that has never seen a panel gets what's new", () => {
  // loadConfig marks these 'pre': they are not new users and a welcome would
  // be insulting.
  const out = api.chooseIntro("1.2.0", "pre", VERSIONS);
  assert.strictEqual(out.kind, "whatsnew");
  assert.deepStrictEqual(out.added, ["a", "b"]);
});

check("having seen this version, nothing is shown", () => {
  assert.strictEqual(api.chooseIntro("1.2.0", "1.2.0", VERSIONS), null);
});

check("an update with no new features shows nothing rather than an empty box", () => {
  assert.strictEqual(api.chooseIntro("1.1.0", "1.0.0", VERSIONS), null);
  assert.strictEqual(api.chooseIntro("9.9.9", "1.0.0", VERSIONS), null);
});

console.log("the text itself");

check("bold survives and markup does not", () => {
  assert.strictEqual(api.renderInline("**Bold.** plain"), "<strong>Bold.</strong> plain");
  assert.strictEqual(
    api.renderInline("<img src=x onerror=alert(1)>"),
    "&lt;img src=x onerror=alert(1)&gt;",
  );
});

console.log("wiring");

check("an existing config is marked as having seen nothing, not as new", () => {
  assert.ok(
    hasCode(MAIN, "if (saved.lastSeenVersion === undefined) merged.lastSeenVersion = 'pre';"),
  );
  assert.ok(hasCode(MAIN, "lastSeenVersion: '',"), "the default is missing");
});

check("dismissing records the version so it stops coming back", () => {
  const body = extract("showIntroPanel");
  assert.ok(
    hasCode(body, "setConfig({ lastSeenVersion: version })"),
    "dismissing does not remember anything",
  );
  assert.ok(hasCode(body, "panel.style.display = 'none'"));
});

console.log("the first-run tour");

check("a fresh install is sent to the tour, not the banner", () => {
  const body = extract("showIntroPanel");
  assert.ok(
    hasCode(body, "if (choice.kind === 'welcome') { showOnboarding(version); return; }"),
    "the welcome case no longer hands off to the step-by-step tour",
  );
});

check("the tour's own dismissal records the version too", () => {
  const body = extract("finishOnboarding");
  assert.ok(
    hasCode(body, "setConfig({ lastSeenVersion: onboardingVersion })"),
    "finishing the tour does not remember anything, so it would come back",
  );
});

check("the tour ends on an offer to sign in, not buried in the middle", () => {
  const stepsSrc = extractConstFrom(JS, "ONBOARDING_STEPS");
  const steps = new Function(`${stepsSrc}\nreturn ONBOARDING_STEPS;`)();
  assert.ok(steps.length >= 3, "a tour this short isn't really a tour");
  assert.ok(
    steps.slice(0, -1).every((s) => !s.signin),
    "an earlier step also claims to be the sign-in step",
  );
  assert.ok(steps[steps.length - 1].signin, "the last step should be the sign-in offer");
  assert.ok(/sign in/i.test(steps[steps.length - 1].title));
});

console.log();
if (failed) {
  console.error(`${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`${passed} passed`);
