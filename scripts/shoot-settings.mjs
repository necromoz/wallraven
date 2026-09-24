#!/usr/bin/env node
//
// Take a picture of the settings window.
//
// Why this exists: three bugs in a row were invisible to every test in the
// suite because they were faults of appearance, not of logic. The worst of
// them shipped: in a raven theme, a panel between the header and the shell was
// painted over by the theme's own backdrop, so the window showed a tall empty
// band and the sidebar stopped meeting the header. Nothing that reads the file
// as text, and nothing that runs it in jsdom, can see that. A browser can.
//
// It loads electron/settings.html in Chromium with a stub of the preload API,
// so no Electron and no main process are involved.
//
//   node scripts/shoot-settings.mjs                       Home, raven-beach
//   node scripts/shoot-settings.mjs --page schedule       another page
//   node scripts/shoot-settings.mjs --theme glass --out /tmp/x.png
//
// Needs Playwright and a Chromium build. Neither is a dependency of this
// project, because they are only useful for this:
//
//   npm i -D playwright
//   npx playwright install chromium
//
// or point it at a Chromium you already have:
//
//   CHROMIUM=/path/to/chrome node scripts/shoot-settings.mjs

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ELECTRON_DIR = path.join(ROOT, "electron");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const page = arg("page", "home");
const theme = arg("theme", "raven-beach");
const lastSeen = arg("last-seen", "1.0.0");
const out = arg("out", path.join(ROOT, `settings-${page}.png`));

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error(
    "playwright is not installed. npm i -D playwright, then npx playwright install chromium",
  );
  process.exit(1);
}

// Enough config for the window to hydrate from, with a timetable in it because
// that is the card most worth looking at.
const CONFIG = {
  theme,
  uiAccent: "#7c5cff",
  cycleMinutes: 30,
  cacheMaxMB: 20480,
  categories: { general: true, anime: true, people: false },
  purity: { sfw: true, sketchy: false, nsfw: false },
  sorting: "random",
  order: "desc",
  topRange: "1M",
  colors: [],
  ratios: "",
  resolutions: "",
  atleastResolution: "",
  query: "",
  presets: {},
  playlists: { Evening: { items: [], createdAt: Date.now() } },
  likes: [],
  dislikes: [],
  hotkeys: {},
  hotkeysEnabled: true,
  schedule: {
    enabled: true,
    rules: [
      { id: "a", startHHMM: "08:00", sourceType: "search", days: [1, 2, 3, 4, 5] },
      {
        id: "b",
        startHHMM: "18:00",
        sourceType: "playlist",
        sourceRef: "Evening",
        intervalMin: 10,
        days: [],
      },
    ],
  },
  collapsed: {},
  sectionsOpen: {},
  uiPage: page,
  uiTabs: {},
  sourceMode: "search",
  folderPaths: [],
  lastSeenVersion: lastSeen,
};

// Sample wallpapers for the carousel: the site's own feature images, so the
// shot looks like a real library rather than one icon repeated.
const SAMPLE = (n) => path.join(ROOT, "src", "assets", `feat-${String(n).padStart(2, "0")}.jpg`);
const sampleWhy = { mode: "search", ref: "misty forest", preset: "Moody", rule: "a" };
const CAROUSEL = {
  back: [3, 4, 5].map((n, k) => ({
    id: `back${k}`,
    file: SAMPLE(n),
    resolution: "3840x2160",
    why: sampleWhy,
    reachable: true,
    index: 197 - k,
    kind: "history",
  })),
  forward: [6, 8].map((n, k) => ({
    id: `next${k}`,
    file: SAMPLE(n),
    resolution: "3840x2160",
    why: sampleWhy,
    reachable: true,
    kind: "upcoming",
  })),
  note: "",
};

const INFO = {
  current: {
    id: "gwq6me",
    file: SAMPLE(1),
    resolution: "5126x2883",
    why: { ...sampleWhy, fallback: "without aspect ratio" },
  },
  cacheMB: 5058,
  pinnedMB: 33,
  historyCount: 200,
  canBack: true,
  canForward: false,
  paused: false,
};

const changelog = fs.readFileSync(path.join(ELECTRON_DIR, "CHANGELOG.md"), "utf8");

const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {},
);
const tab = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

await tab.addInitScript(
  ({ config, info, changelogText, carousel }) => {
    const reply =
      (value) =>
      (...args) =>
        Promise.resolve(typeof value === "function" ? value(...args) : value);
    const known = {
      getConfig: reply(() => JSON.parse(JSON.stringify(config))),
      setConfig: reply((patch) => Object.assign(config, patch)),
      info: reply(info),
      history: reply([]),
      appVersion: reply("0.0.0-shot"),
      updateInfo: reply({ current: "0.0.0-shot", info: {}, storeManaged: false }),
      hotkeysStatus: reply({ ok: true, registered: [], failed: [] }),
      accountStatus: reply({ signedIn: false }),
      setWindowOpacity: reply(true),
      searchRun: reply({ items: [], meta: {} }),
      changelog: reply(changelogText),
      portableInfo: reply({ portable: false, dir: "C:/Program Files/WallRaven" }),
      likes: reply([]),
      carousel: reply(carousel),
      historyGoto: reply(info),
      schedulePreview: reply({ activeRuleId: "a", effectiveIntervalMin: 30, enabled: true }),
    };
    // Anything not modelled answers with something harmlessly shaped like data.
    window.api = new Proxy(known, {
      get: (t, p) =>
        p in t
          ? t[p]
          : typeof p === "string"
            ? reply({ ok: true, items: [], categories: [], presets: [], list: [], data: [] })
            : undefined,
      has: () => true,
    });
  },
  { config: CONFIG, info: INFO, changelogText: changelog, carousel: CAROUSEL },
);

await tab.goto(`file://${path.join(ELECTRON_DIR, "settings.html")}`);
await tab.waitForTimeout(1200);
await tab.screenshot({ path: out });
console.log(`wrote ${out}`);
await browser.close();
