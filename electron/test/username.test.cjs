// The username cooldown is enforced by a trigger on profiles; the app only has
// to report it truthfully. These check that reporting: the date it shows, and
// that it recognises the trigger's error so it can say when, not "could not save".
//
// The trigger itself was tested against a real Postgres 16 when written
// (claim free, first change free, second blocked, backdating ignored, allowed
// again after 30 days). That needs a database, so it is not repeated here.
//
// Run with: node electron/test/username.test.cjs

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const SRC = fs.readFileSync(path.join(__dirname, "..", "cloud.cjs"), "utf8").replace(/\r\n/g, "\n");
const MIGRATION = fs.readFileSync(
  path.join(__dirname, "..", "..", "supabase", "migrations", "20261006120000_username_change_cooldown.sql"),
  "utf8",
);

function extract(name) {
  const start = SRC.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `could not find function ${name} in cloud.cjs`);
  let depth = 0;
  const from = SRC.indexOf("{", start);
  for (let i = from; i < SRC.length; i++) {
    if (SRC[i] === "{") depth++;
    else if (SRC[i] === "}" && --depth === 0) return SRC.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces reading ${name}`);
}

const days = Number(/const USERNAME_COOLDOWN_DAYS = (\d+);/.exec(SRC)[1]);
const nextUsernameChange = new Function(
  `const USERNAME_COOLDOWN_DAYS = ${days}; ${extract("nextUsernameChange")}; return nextUsernameChange;`,
)();

let passed = 0;
let failed = 0;
function check(label, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.error("FAIL", label, "\n ", e.message);
  }
}

const DAY = 86400000;

check("the app and the database agree on the length of the wait", () => {
  const m = /interval '(\d+) days'/.exec(MIGRATION);
  assert.ok(m, "no interval in the migration");
  assert.strictEqual(Number(m[1]), days);
});

check("the website agrees too", () => {
  const site = fs.readFileSync(path.join(__dirname, "..", "..", "src", "routes", "account.tsx"), "utf8");
  const m = /const USERNAME_COOLDOWN_DAYS = (\d+);/.exec(site);
  assert.ok(m, "account.tsx no longer states the cooldown");
  assert.strictEqual(Number(m[1]), days);
  assert.ok(/username_cooldown until/.test(site), "account.tsx no longer recognises the trigger's error");
});

check("never changed means no wait", () => {
  assert.strictEqual(nextUsernameChange(null), null);
  assert.strictEqual(nextUsernameChange(undefined), null);
  assert.strictEqual(nextUsernameChange("not a date"), null);
});

check("changed yesterday means waiting until 30 days after that", () => {
  const changed = new Date(Date.now() - DAY);
  const next = nextUsernameChange(changed.toISOString());
  assert.strictEqual(Date.parse(next), changed.getTime() + days * DAY);
});

check("changed 31 days ago means free to change", () => {
  assert.strictEqual(nextUsernameChange(new Date(Date.now() - 31 * DAY).toISOString()), null);
});

check("the trigger's error is recognised and its date read cleanly", () => {
  // What PostgREST returns for a RAISE EXCEPTION, as setUsername sees it.
  const body = {
    code: "P0001",
    details: null,
    hint: null,
    message: "username_cooldown until 2026-11-05T15:37:11Z",
  };
  const re = /\/(username_cooldown until [^/]+)\//.exec(SRC);
  assert.ok(re, "setUsername no longer looks for username_cooldown");
  const m = new RegExp(re[1]).exec(JSON.stringify(body));
  assert.ok(m);
  assert.strictEqual(m[1], "2026-11-05T15:37:11Z");
  assert.ok(Number.isFinite(Date.parse(m[1])));
});

check("the trigger message the app looks for is the one the database raises", () => {
  assert.ok(/RAISE EXCEPTION 'username_cooldown until %'/.test(MIGRATION));
});

console.log(`${passed} passed${failed ? `, ${failed} failed` : ""}`);
if (failed) process.exit(1);
