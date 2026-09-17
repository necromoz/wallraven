// Tests for the timetable card: the sentence under each entry, the ordering,
// and the clash warning.
//
// The card used to be four controls in a row and nothing else. Nothing on
// screen said when an entry stopped, what a blank interval meant, what ticking
// no days did, or which entry was in charge right now. Those are the facts
// that make a timetable readable, and they are all derivable, so they are
// computed and written out.
//
// Run with: node electron/test/schedule-ui.test.cjs

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const HTML = fs
  .readFileSync(path.join(__dirname, "..", "settings.html"), "utf8")
  .replace(/\r\n/g, "\n");

function extract(name) {
  const at = HTML.indexOf(`function ${name}(`);
  assert.ok(at !== -1, `no function ${name} in settings.html`);
  const open = HTML.indexOf("{", HTML.indexOf(")", at));
  let depth = 0;
  for (let i = open; i < HTML.length; i++) {
    if (HTML[i] === "{") depth++;
    else if (HTML[i] === "}") { depth--; if (depth === 0) return HTML.slice(at, i + 1); }
  }
  throw new Error(`unbalanced braces reading ${name}`);
}

function extractConst(name) {
  const m = new RegExp("const " + name + " = ([\\s\\S]*?);\\n", "m").exec(HTML);
  assert.ok(m, `no const ${name}`);
  return `const ${name} = ${m[1]};`;
}

const api = new Function(`
  ${extractConst("DAY_LABELS")}
  ${extractConst("WEEKDAYS")}
  ${extractConst("WEEKEND")}
  ${extract("sameDays")}
  ${extract("describeDays")}
  ${extract("describeSource")}
  ${extract("ruleMinutes")}
  ${extract("sortRules")}
  ${extract("nextRuleAfter")}
  ${extract("describeRule")}
  ${extract("clashingRuleIds")}
  return { describeDays, describeSource, ruleMinutes, sortRules, nextRuleAfter, describeRule, clashingRuleIds };
`)();

let passed = 0;
let failed = 0;
function check(label, fn) {
  try { fn(); passed++; }
  catch (err) { failed++; console.error(`  FAIL  ${label}`); console.error(`        ${err.message}`); }
}

const plain = (html) => String(html).replace(/<[^>]+>/g, "");

console.log("days");

check("no days ticked means every day, which the form never said", () => {
  assert.strictEqual(api.describeDays([]), "every day");
  assert.strictEqual(api.describeDays(undefined), "every day");
  assert.strictEqual(api.describeDays([0, 1, 2, 3, 4, 5, 6]), "every day");
});

check("the common groupings get their own words", () => {
  assert.strictEqual(api.describeDays([1, 2, 3, 4, 5]), "on weekdays");
  assert.strictEqual(api.describeDays([5, 4, 3, 2, 1]), "on weekdays");
  assert.strictEqual(api.describeDays([0, 6]), "at weekends");
});

check("anything else is listed, in week order", () => {
  assert.strictEqual(api.describeDays([3, 1]), "on Mon, Wed");
});

console.log("times");

check("a time becomes minutes, and nonsense becomes null", () => {
  assert.strictEqual(api.ruleMinutes({ startHHMM: "08:30" }), 510);
  assert.strictEqual(api.ruleMinutes({ startHHMM: "00:00" }), 0);
  for (const bad of ["", "24:00", "08:70", "half eight", undefined]) {
    assert.strictEqual(api.ruleMinutes({ startHHMM: bad }), null, `accepted ${bad}`);
  }
});

check("entries are shown in the order they take effect", () => {
  const rules = [{ startHHMM: "18:00" }, { startHHMM: "07:30" }, { startHHMM: "12:00" }];
  assert.deepStrictEqual(api.sortRules(rules).map((r) => r.startHHMM), ["07:30", "12:00", "18:00"]);
});

check("an unreadable time sinks rather than disappearing", () => {
  const rules = [{ startHHMM: "bad" }, { startHHMM: "07:30" }];
  assert.deepStrictEqual(api.sortRules(rules).map((r) => r.startHHMM), ["07:30", "bad"]);
});

console.log("what an entry adds up to");

const CFG = { cycleMinutes: 30 };

check("it says when it stops, which is the next entry", () => {
  const a = { id: "a", startHHMM: "08:00", sourceType: "search" };
  const b = { id: "b", startHHMM: "18:00", sourceType: "search" };
  const text = plain(api.describeRule(a, [a, b], CFG, 30));
  assert.ok(/From 08:00 until 18:00/.test(text), text);
});

check("the last entry of the day says so instead of pretending to end", () => {
  const a = { id: "a", startHHMM: "22:00", sourceType: "search" };
  const text = plain(api.describeRule(a, [a], CFG, 30));
  assert.ok(/all night/.test(text), text);
});

check("a blank interval is spelled out, not left as an empty box", () => {
  const a = { id: "a", startHHMM: "08:00", sourceType: "search" };
  assert.ok(/every 30 minutes \(the usual interval\)/.test(plain(api.describeRule(a, [a], CFG, 30))));
  const b = { id: "b", startHHMM: "08:00", sourceType: "search", intervalMin: 5 };
  assert.ok(/every 5 minutes/.test(plain(api.describeRule(b, [b], CFG, 30))));
});

check("an entry with nothing chosen says so rather than looking finished", () => {
  const a = { id: "a", startHHMM: "08:00", sourceType: "playlist", sourceRef: "" };
  assert.ok(/none chosen yet/.test(plain(api.describeRule(a, [a], CFG, 30))));
  const b = { id: "b", startHHMM: "08:00", sourceType: "playlist", sourceRef: "Calm" };
  assert.ok(/the playlist "Calm"/.test(plain(api.describeRule(b, [b], CFG, 30))));
});

check("an entry on other days does not end this one", () => {
  // A Saturday entry at noon has nothing to do with a weekday entry at 08:00.
  const weekday = { id: "a", startHHMM: "08:00", sourceType: "search", days: [1, 2, 3, 4, 5] };
  const saturday = { id: "b", startHHMM: "12:00", sourceType: "search", days: [6] };
  assert.strictEqual(api.nextRuleAfter(weekday, [weekday, saturday]), null);
  const text = plain(api.describeRule(weekday, [weekday, saturday], CFG, 30));
  assert.ok(/all night/.test(text) && /on weekdays/.test(text), text);
});

check("an every-day entry is bounded by any later entry", () => {
  const all = { id: "a", startHHMM: "08:00", sourceType: "search", days: [] };
  const sat = { id: "b", startHHMM: "12:00", sourceType: "search", days: [6] };
  assert.strictEqual(api.nextRuleAfter(all, [all, sat]), sat);
});

console.log("clashes");

check("two entries at the same time on the same day are flagged", () => {
  const a = { id: "a", startHHMM: "08:00", days: [] };
  const b = { id: "b", startHHMM: "08:00", days: [1] };
  assert.deepStrictEqual([...api.clashingRuleIds([a, b])].sort(), ["a", "b"]);
});

check("the same time on different days is not a clash", () => {
  const a = { id: "a", startHHMM: "08:00", days: [1, 2] };
  const b = { id: "b", startHHMM: "08:00", days: [6] };
  assert.deepStrictEqual([...api.clashingRuleIds([a, b])], []);
});

check("different times never clash", () => {
  const a = { id: "a", startHHMM: "08:00", days: [] };
  const b = { id: "b", startHHMM: "08:01", days: [] };
  assert.deepStrictEqual([...api.clashingRuleIds([a, b])], []);
});

console.log("the card uses all of it");

check("each entry is rendered with its sentence and its day chips", () => {
  const body = extract("renderScheduleRules");
  assert.ok(/describeRule\(r, ordered, config, cycle\)/.test(body), "entries are not described");
  assert.ok(/sortRules\(rules\)/.test(body), "entries are not ordered by time");
  assert.ok(/clashingRuleIds\(ordered\)/.test(body), "clashes are not flagged");
  assert.ok(/day-chip/.test(body), "days are still seven bare checkboxes");
  assert.ok(/sch-day-preset/.test(body), "no weekday or weekend shortcut");
  assert.ok(/on now/.test(body), "nothing marks the entry in force");
});

check("collectSchedule reads the chips it now renders", () => {
  const body = extract("collectSchedule");
  assert.ok(/classList\.contains\('on'\)/.test(body), "it still looks for checked checkboxes");
});

console.log();
if (failed) { console.error(`${failed} failed, ${passed} passed`); process.exit(1); }
console.log(`${passed} passed`);
