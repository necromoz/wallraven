// Tests for the Wallhaven request queue.
//
// This queue deadlocked. Low-priority work (preset thumbnails) waited for
// wallpaper requests to clear from *inside* the queue, having already taken
// its place — and the wallpaper request it was waiting for was stuck behind
// it. The app then sat on "Fetching…" and never changed wallpaper again until
// restarted, with no error anywhere. Opening the preset gallery while a
// rotation was due was enough.
//
// The functions are extracted from main.cjs by name so these run the real
// shipped code rather than a copy that can drift.
//
// Run with: node electron/test/gate.test.cjs

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const SRC = fs.readFileSync(path.join(__dirname, "..", "main.cjs"), "utf8").replace(/\r\n/g, "\n");

function extract(name) {
  const start = SRC.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `could not find function ${name} in main.cjs`);

  // Skip the parameter list before looking for the body. Taking the first "{"
  // after the name would stop at a destructured default like
  // `{ priority = true } = {}` and return half a function.
  let i = SRC.indexOf("(", start);
  let parens = 0;
  for (; i < SRC.length; i++) {
    if (SRC[i] === "(") parens++;
    else if (SRC[i] === ")" && --parens === 0) break;
  }
  const bodyStart = SRC.indexOf("{", i);
  assert.ok(bodyStart !== -1, `could not find the body of ${name}`);

  let depth = 0;
  for (let j = bodyStart; j < SRC.length; j++) {
    if (SRC[j] === "{") depth++;
    else if (SRC[j] === "}" && --depth === 0) return SRC.slice(start, j + 1);
  }
  throw new Error(`unbalanced braces reading ${name}`);
}

/** A fresh queue per test, using the real whGate/whGateLow source. */
function makeGate() {
  return new Function(`
    let WH_CHAIN = Promise.resolve();
    let WH_LAST = 0;
    let WH_COOLDOWN_UNTIL = 0;
    let WH_HIGH_PENDING = 0;
    const WH_MIN_GAP_MS = 5;
    const WH_LOW_MAX_WAIT_MS = 1500;
    function whCoolingDown() { return Date.now() < WH_COOLDOWN_UNTIL; }
    ${extract("whGate")}
    ${extract("whGateLow")}
    return {
      whGate,
      cooldownFor(ms) { WH_COOLDOWN_UNTIL = Date.now() + ms; },
      highPending() { return WH_HIGH_PENDING; },
    };
  `)();
}

let passed = 0;
let failed = 0;

async function check(label, fn) {
  try {
    await fn();
    passed++;
  } catch (err) {
    failed++;
    console.error(`FAIL  ${label}`);
    console.error(`      ${err.message}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms, what) =>
  Promise.race([
    p,
    sleep(ms).then(() => {
      throw new Error(`${what} did not finish within ${ms}ms`);
    }),
  ]);

(async () => {
  console.log("the deadlock");

  await check("a wallpaper change still happens when queued behind a slow thumbnail", async () => {
    // The exact ordering that used to wedge the app: a thumbnail in flight, a
    // second thumbnail queued behind it, and a wallpaper request arriving
    // while the first is still running.
    const gate = makeGate();
    const done = [];

    gate.whGate(
      async () => {
        await sleep(300);
        done.push("thumb1");
      },
      { priority: false },
    );
    gate.whGate(
      async () => {
        done.push("thumb2");
      },
      { priority: false },
    );
    await sleep(60);
    const wallpaper = gate.whGate(async () => {
      done.push("WALLPAPER");
    });

    await withTimeout(wallpaper, 3000, "the wallpaper request");
    assert.ok(done.includes("WALLPAPER"), `wallpaper never ran; got ${done.join(", ")}`);
  });

  await check("the queue keeps working afterwards", async () => {
    const gate = makeGate();
    gate.whGate(
      async () => {
        await sleep(200);
      },
      { priority: false },
    );
    await sleep(40);
    await withTimeout(
      gate.whGate(async () => "first"),
      3000,
      "first",
    );
    const second = await withTimeout(
      gate.whGate(async () => "second"),
      3000,
      "second",
    );
    assert.strictEqual(second, "second");
    assert.strictEqual(gate.highPending(), 0, "the pending counter leaked");
  });

  console.log("ordering");

  await check("wallpaper work goes before thumbnails that have not started", async () => {
    const gate = makeGate();
    const done = [];
    const busy = gate.whGate(async () => {
      await sleep(150);
      done.push("busy");
    });
    const thumb = gate.whGate(
      async () => {
        done.push("thumb");
      },
      { priority: false },
    );
    const wall = gate.whGate(async () => {
      done.push("WALLPAPER");
    });
    await withTimeout(Promise.all([busy, thumb, wall]), 4000, "the queue");
    assert.ok(
      done.indexOf("WALLPAPER") < done.indexOf("thumb"),
      `thumbnail jumped the queue: ${done.join(", ")}`,
    );
  });

  console.log("giving up rather than hanging");

  await check("a thumbnail gives up instead of waiting forever", async () => {
    const gate = makeGate();
    // Keep wallpaper work outstanding for longer than the low-priority
    // deadline, then confirm the thumbnail rejects rather than hanging.
    gate.whGate(async () => {
      await sleep(2000);
    });
    await sleep(20);
    await assert.rejects(
      () =>
        withTimeout(
          gate.whGate(async () => "thumb", { priority: false }),
          3000,
          "the thumbnail",
        ),
      /busy/,
      "expected the thumbnail to give up with 'busy'",
    );
  });

  await check("the counter returns to zero even when a request throws", async () => {
    const gate = makeGate();
    await assert.rejects(
      () =>
        gate.whGate(async () => {
          throw new Error("boom");
        }),
      /boom/,
    );
    assert.strictEqual(gate.highPending(), 0, "a failed request left the counter stuck");
  });

  console.log("rate limiting");

  await check("a cooldown does not wedge the queue", async () => {
    const gate = makeGate();
    gate.cooldownFor(200);
    const wall = await withTimeout(
      gate.whGate(async () => "ok"),
      3000,
      "the wallpaper request",
    );
    assert.strictEqual(wall, "ok");
  });

  console.log();
  if (failed) {
    console.error(`${failed} failed, ${passed} passed`);
    process.exit(1);
  }
  console.log(`${passed} passed`);
})();
