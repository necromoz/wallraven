// Wallhaven Tray - Electron main process
const { app, Tray, Menu, BrowserWindow, ipcMain, nativeImage, shell, Notification, globalShortcut, dialog, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { spawn } = require('child_process');
const { URL } = require('url');
const cloud = require('./cloud.cjs');

// Windows groups taskbar buttons (and pinned shortcuts) by AppUserModelID. Without
// a stable one, Windows falls back to the Electron runtime identity, which is why a
// pinned WallRaven could show the default Electron icon.
app.setName('WallRaven');
if (process.platform === 'win32') {
  try { app.setAppUserModelId('com.wallraven.app'); } catch {}
}


// ---------- Portable mode ----------
// If a `portable.flag` file sits next to the executable, redirect all app
// data (config, cache, history) into `./data/` relative to the exe. This
// keeps a Wallraven install USB-drive-friendly and lets multiple copies
// coexist without stepping on each other.
const PORTABLE_FLAG = path.join(path.dirname(process.execPath), 'portable.flag');
const IS_PORTABLE = fs.existsSync(PORTABLE_FLAG);
if (IS_PORTABLE) {
  const portableDir = path.join(path.dirname(process.execPath), 'data');
  try { fs.mkdirSync(portableDir, { recursive: true }); } catch {}
  app.setPath('userData', portableDir);
} else {
  // Pin the data directory to a stable, brand-correct folder. Earlier builds
  // derived it from the package name (`wallhaven-tray`), which meant a rename
  // or repackage could silently strand config, history and the cache. We now
  // always use <Roaming>/Wallraven and migrate any legacy folder into it once.
  try {
    const parent = path.dirname(app.getPath('userData'));
    const stable = path.join(parent, 'Wallraven');
    const legacyNames = ['wallhaven-tray', 'wallraven', 'Wallhaven Tray'];
    if (!fs.existsSync(stable)) {
      let migrated = false;
      for (const name of legacyNames) {
        const legacy = path.join(parent, name);
        if (legacy === stable || !fs.existsSync(legacy)) continue;
        try { fs.renameSync(legacy, stable); migrated = true; break; } catch {}
        // Rename can fail (different volume / locked file) — fall back to copy.
        try { fs.cpSync(legacy, stable, { recursive: true }); migrated = true; break; } catch {}
      }
      if (!migrated) fs.mkdirSync(stable, { recursive: true });
    }
    app.setPath('userData', stable);
  } catch (e) { console.warn('data dir pin failed', e); }
}

const DATA_DIR = path.join(app.getPath('userData'));
const DEFAULT_CACHE_DIR = path.join(DATA_DIR, 'cache');
// Mutable: the user can relocate the cache from Settings (config.cacheDir).
let CACHE_DIR = DEFAULT_CACHE_DIR;
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const HISTORY_PATH = path.join(DATA_DIR, 'history.json');
const VERSION_PATH = path.join(__dirname, 'VERSION');
const ICON_PATH = path.join(__dirname, 'icon.png');
const ICO_PATH = path.join(__dirname, 'icon.ico');
const TRAY_ICON_PATH = path.join(__dirname, 'tray.png');
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif']);

try {
  const bundledVersion = fs.readFileSync(VERSION_PATH, 'utf8').trim();
  if (bundledVersion) app.setVersion(bundledVersion);
} catch {}

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });


const DEFAULT_CONFIG = {
  apiKey: '',
  query: '',
  categories: { general: true, anime: false, people: false },
  purity: { sfw: true, sketchy: false, nsfw: false },
  sorting: 'random',           // date_added, relevance, random, views, favorites, toplist
  order: 'desc',
  topRange: '1M',              // 1d 3d 1w 1M 3M 6M 1y
  minResolution: '',           // e.g. 1920x1080
  resolutions: '',             // exact list comma-separated, optional
  ratios: '__current__',       // fresh installs default to current screen aspect ratio only
  atleastResolution: '__current__',
  colors: [],                  // wallhaven palette hex (no #)
  aiArtFilter: 1,              // 1 = exclude AI, 0 = include
  cycleMinutes: 30,
  cacheMaxMB: 1024,
  autoStart: true,
  startMinimized: false,
  uiAccent: '#7c5cff',
  theme: 'glass',
  notifyOnChange: false,
  whUsername: '',
  sourceMode: 'search',  // 'search' | 'collection'
  collectionId: null,
  cardOrder: ['current','history','statistics','search','browse','favourites','presets','community','playlists','library','cycle','schedule','app','apikey','cache','hotkeys','account','updates','feedback'],
  collapsed: {},
  sectionsOpen: {},       // 'card:section' -> open/closed for sections inside a card
  uiPage: 'home',         // active destination in the app shell
  uiTabs: {},             // page id -> active sub-tab
  playlists: {},          // { [name]: { items: [{id,url,file,thumb,resolution,file_type}], createdAt } }
  activePlaylist: '',     // name of playlist used when sourceMode === 'playlist'
  playlistIndex: 0,       // sequential cursor into active playlist
  // v0.2.0 additions
  fitMode: 'fill',        // fill | fit | stretch | tile | center | span

  likes: [],              // wallhaven ids the user liked
  dislikes: [],           // wallhaven ids excluded from future rotation
  dislikedItems: [],      // wallpaper details used by the Disliked gallery
  blacklistTagIds: [],    // wallhaven tag ids appended as -id:N to every search
  schedule: {             // timetable engine
    enabled: false,
    rules: [],            // [{ id, startHHMM:'08:00', days:[0..6], sourceType:'search'|'playlist'|'collection'|'preset', sourceRef:'', intervalMin:null }]
  },
  updateInfo: { latestVersion: '', url: '', checkedAt: 0, dismissed: '' },
  // Pass 2 additions
  monitorMode: 'same',    // same | span | different (per-monitor unique)
  hotkeysEnabled: true,
  hotkeys: {
    next:           'CommandOrControl+Alt+N',
    like:           'CommandOrControl+Alt+L',
    dislike:        'CommandOrControl+Alt+D',
    pauseSchedule:  'CommandOrControl+Alt+P',
    randomFav:      'CommandOrControl+Alt+W',
    back:           'CommandOrControl+Alt+Left',
    forward:        'CommandOrControl+Alt+Right',
  },
  playlistTagFilters: {}, // { [playlistName]: 'tag1,tag2' } — remembered UI filter
  matchLockScreen: false, // when true, set Windows lock screen to the same image
  pauseOnFullscreen: false, // skip rotations while a fullscreen app/game is in the foreground
  pauseFullscreenMode: 'all', // 'all' = any fullscreen window | 'list' = only the apps below
  pauseFullscreenApps: [],    // process names, e.g. ['cs2','vlc'] (case-insensitive, .exe optional)
  autoDownloadUpdates: false, // download new installers in the background as soon as they appear
  autoInstallUpdates: true,   // Teams-style: silently install a new version on launch and restart


  // v0.4.0 — cloud account sync
  cloudSyncEnabled: true, // auto push/pull while signed in
  lastSyncedAt: 0,
  _syncStamps: {},        // { settings|presets|playlists|likes: epochMs of last local change }

  // v0.4.3 — relocatable cache + local folder rotation
  cacheDir: '',            // '' = default (<data dir>/cache)
  folderPaths: [],         // folders to rotate through when sourceMode === 'folder'
  folderRecursive: true,   // include sub-folders
  folderOrder: 'random',   // 'random' | 'sequential' (alphabetical by path)
  folderIndex: 0,          // cursor for sequential folder playback
  // v0.5.0 — resilience, navigation, insights
  offlineCachedOnly: true,       // auto-fallback to cached wallpapers when the network is down
  offlineCachedOnlyManual: false,// user override: always cycle cached wallpapers (metered/travel)
  prefetchEnabled: true,         // pre-download the next candidate for instant swaps
  stats: { shownTotal: 0, shownMonth: 0, shownMonthKey: '', cacheHits: 0, downloads: 0, fallbacks: 0, sources: {} },
};




let config = loadConfig();
applyCacheDir();
let history = loadHistory();
// navPos: cursor into history.items for browser-style back/forward nav.
// After any new rotation it snaps to the last item (forward stack cleared).
let navPos = history.items.length ? history.items.length - 1 : -1;

let tray = null;
let settingsWindow = null;
let cycleTimer = null;
let isFetching = false;
let paused = false;
// v0.5.0 runtime state
let offlineNotified = false;          // only toast on online/offline *change*
const prefetched = [];                 // [{ item, file }] ready-to-apply candidates
let prefetchTimer = null;

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
    }
  } catch (e) { console.error('config load', e); }
  return { ...DEFAULT_CONFIG };
}
// Point CACHE_DIR at the user-chosen folder (config.cacheDir) when it is set
// and usable; otherwise fall back to the default inside the data dir. Called
// at startup and whenever the setting changes.
function applyCacheDir() {
  const wanted = String(config.cacheDir || '').trim();
  const target = wanted || DEFAULT_CACHE_DIR;
  try {
    fs.mkdirSync(target, { recursive: true });
    fs.accessSync(target, fs.constants.W_OK);
    CACHE_DIR = target;
  } catch (e) {
    console.warn('cache dir unusable, using default', target, e);
    CACHE_DIR = DEFAULT_CACHE_DIR;
    try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch {}
  }
  return CACHE_DIR;
}

let lastSavedConfig = null;
function saveConfig() {
  // Stamp any syncable section that changed since the last write, so likes,
  // playlists and presets edited outside config:set still sync.
  try {
    if (lastSavedConfig) stampChangedSections(lastSavedConfig, config);
    lastSavedConfig = JSON.parse(JSON.stringify(config));
  } catch {}
  persistConfigQuiet();
  try { queueCloudPush(); } catch {}
}
// Settings are written on nearly every state change (each wallpaper shown
// bumps stats). Coalesce those into one write shortly after the last change
// so the UI thread isn't doing a blocking disk write per event; always flush
// before quitting so nothing is lost.
let CONFIG_WRITE_TIMER = null;
function writeConfigNow() {
  if (CONFIG_WRITE_TIMER) { clearTimeout(CONFIG_WRITE_TIMER); CONFIG_WRITE_TIMER = null; }
  try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2)); } catch (e) { console.error('config save', e); }
}
function persistConfigQuiet() {
  if (CONFIG_WRITE_TIMER) return;
  CONFIG_WRITE_TIMER = setTimeout(() => { CONFIG_WRITE_TIMER = null; writeConfigNow(); }, 500);
}
function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_PATH)) return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
  } catch {}
  return { items: [], currentId: null };
}
function saveHistory() {
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
}

// ---------- Wallhaven API ----------
// Query syntax (industry-standard split): a top-level comma separates
// independent OR-groups (Wallhaven's API has no native OR operator, so
// each group runs as its own request and results are unioned). Within a
// group, `+` and space act as AND on tags — that's Wallhaven's own
// operator, so users can freely write things like `zzz +girls`. Any
// leading/trailing whitespace around commas is ignored.
function splitQueryGroups(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
function buildSearchUrl(overrides = {}, page = 1, queryOverride = null) {
  const cfg = { ...config, ...overrides };
  const params = new URLSearchParams();
  // Append tag-id blacklist as `-id:N` tokens to the free-text query so
  // Wallhaven excludes them at the source (much cheaper than filtering
  // after download). User-typed q wins on syntax; we only append.
  const blacklist = (cfg.blacklistTagIds || []).map((id) => `-id:${id}`).join(' ');
  const baseQuery = queryOverride != null ? queryOverride : (cfg.query || '');
  const q = [baseQuery, blacklist].filter(Boolean).join(' ').trim();
  if (q) params.set('q', q);
  const cat = `${cfg.categories.general ? 1 : 0}${cfg.categories.anime ? 1 : 0}${cfg.categories.people ? 1 : 0}`;
  params.set('categories', cat === '000' ? '111' : cat);
  const pur = `${cfg.purity.sfw ? 1 : 0}${cfg.purity.sketchy ? 1 : 0}${cfg.purity.nsfw ? 1 : 0}`;
  params.set('purity', pur === '000' ? '100' : pur);
  params.set('sorting', cfg.sorting);
  params.set('order', cfg.order);
  if (cfg.sorting === 'toplist') params.set('topRange', cfg.topRange);
  const atleast = cfg.atleastResolution && cfg.atleastResolution !== '__current__' ? cfg.atleastResolution : '';
  if (atleast) params.set('atleast', atleast);
  if (cfg.resolutions) params.set('resolutions', cfg.resolutions);
  const ratios = (cfg.ratios || '').split(',').map((s) => s.trim()).filter((v) => v && v !== '__current__').join(',');
  if (ratios) params.set('ratios', ratios);
  if (cfg.colors && cfg.colors.length) params.set('colors', cfg.colors.join(','));
  params.set('ai_art_filter', String(cfg.aiArtFilter));
  if (cfg.apiKey) params.set('apikey', cfg.apiKey);
  params.set('page', String(page));
  return `https://wallhaven.cc/api/v1/search?${params.toString()}`;
}

// Progressive fallbacks if filters are too narrow. Each step drops one
// constraint while preserving the user's safety (purity) settings.
function fallbackChain() {
  return [
    { label: 'your filters', overrides: {} },
    { label: 'without color filter', overrides: { colors: [] } },
    { label: 'without aspect ratio', overrides: { colors: [], ratios: '' } },
    { label: 'without search term', overrides: { colors: [], ratios: '', query: '' } },
    { label: 'top wallpapers at your resolution', overrides: { colors: [], ratios: '', query: '', sorting: 'toplist', topRange: '1M' } },
    { label: 'without resolution requirement', overrides: { colors: [], ratios: '', atleastResolution: '', resolutions: '', query: '' } },
  ];
}

// Fetch one page of results using the given overrides+query, picking a
// random page to keep the pool fresh even when the same query is called
// repeatedly (fixes "same picture over and over" for narrow queries).
async function fetchOneGroup(overrides, query) {
  const firstUrl = buildSearchUrl(overrides, 1, query);
  const first = await httpsGetJSON(firstUrl);
  const lastPage = (first && first.meta && first.meta.last_page) || 1;
  if (lastPage <= 1) return (first && first.data) || [];
  const page = 1 + Math.floor(Math.random() * Math.min(lastPage, 25));
  if (page === 1) return (first && first.data) || [];
  try {
    const data = await httpsGetJSON(buildSearchUrl(overrides, page, query));
    return (data && data.data) || [];
  } catch {
    return (first && first.data) || [];
  }
}

async function searchWithFallback() {
  const attempts = [];
  // Split user query into OR-groups on top-level commas. For cycle mode
  // we pick ONE random group per call — this gives real variety across
  // "wuthering waves, cars" instead of stapling both terms together.
  const groups = splitQueryGroups(config.query);
  const pickQuery = () => (groups.length > 1 ? groups[Math.floor(Math.random() * groups.length)] : (config.query || ''));
  for (const step of fallbackChain()) {
    try {
      // If the step already blanks the query, one attempt is enough.
      const q = step.overrides.query === '' ? '' : pickQuery();
      const items = await fetchOneGroup(step.overrides, q);
      if (items.length) return { items, usedFallback: step.label !== 'your filters' ? step.label : null };
      attempts.push(`${step.label}: 0 results`);
    } catch (e) {
      // Rate limited: walking the rest of the chain just makes it worse and
      // produces a wall of "Too Many Attempts". Bail out with one clear line.
      if (e && e.status === 429) {
        throw new Error('Wallhaven is rate-limiting us (HTTP 429). Waiting a moment before trying again — adding your Wallhaven API key in Advanced raises the limit.');
      }
      attempts.push(`${step.label}: ${String(e.message || e).split('\n')[0].slice(0, 80)}`);
    }
  }
  throw new Error('No wallpapers found. Tried: ' + attempts.join('; '));

}

// ---- Wallhaven request gate -------------------------------------------------
// Wallhaven allows ~45 requests/minute per IP. Everything that talks to its API
// (wallpaper fetches, fallback chains, collections, preset thumbnails) shares
// this single gate so background work can never starve an actual wallpaper
// change. Thumbnails are low priority: they yield to real work and stop
// entirely while we're rate-limited.
const WH_MIN_GAP_MS = 1500;
let WH_CHAIN = Promise.resolve();
let WH_LAST = 0;
let WH_COOLDOWN_UNTIL = 0;   // set when Wallhaven returns 429
let WH_HIGH_PENDING = 0;     // number of queued/among-flight priority requests

function whCoolingDown() { return Date.now() < WH_COOLDOWN_UNTIL; }

function whGate(fn, { priority = true } = {}) {
  if (priority) WH_HIGH_PENDING++;
  const run = WH_CHAIN.then(async () => {
    try {
      if (!priority) {
        // let any real wallpaper work through first, and sit out cooldowns
        while (WH_HIGH_PENDING > 0) await new Promise(r => setTimeout(r, 400));
        if (whCoolingDown()) throw new Error('rate_limited');
      } else if (whCoolingDown()) {
        await new Promise(r => setTimeout(r, Math.min(15000, WH_COOLDOWN_UNTIL - Date.now())));
      }
      const gap = priority ? WH_MIN_GAP_MS : WH_MIN_GAP_MS * 2;
      const wait = Math.max(0, gap - (Date.now() - WH_LAST));
      if (wait) await new Promise(r => setTimeout(r, wait));
      WH_LAST = Date.now();
      return await fn();
    } finally {
      if (priority) WH_HIGH_PENDING--;
    }
  });
  WH_CHAIN = run.then(() => {}, () => {});
  return run;
}

function rawGetJSON(url, depth = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Wallraven/1.0', 'Accept': 'application/json' } }, (res) => {
      const loc = res.headers && res.headers.location;
      if (res.statusCode >= 300 && res.statusCode < 400 && loc && depth < 5) {
        res.resume();
        return rawGetJSON(new URL(loc, url).toString(), depth + 1).then(resolve, reject);
      }
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        if (res.statusCode === 429) {
          WH_COOLDOWN_UNTIL = Date.now() + 45000;
          const err = new Error('HTTP 429: rate limited by Wallhaven');
          err.status = 429;
          return reject(err);
        }
        if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function httpsGetJSON(url, opts = {}) {
  const isWh = /(^|\/\/)([a-z0-9-]+\.)?wallhaven\.cc\//i.test(String(url));
  if (!isWh) return rawGetJSON(url);
  const priority = opts.priority !== false;
  return whGate(async () => {
    let lastErr;
    const tries = priority ? 3 : 1;
    for (let i = 0; i < tries; i++) {
      try { return await rawGetJSON(url); }
      catch (e) {
        lastErr = e;
        if (e && e.status === 429 && i < tries - 1) {
          await new Promise(r => setTimeout(r, 4000 * (i + 1)));
          continue;
        }
        throw e;
      }
    }
    throw lastErr;
  }, { priority });
}


// A download that never finishes used to wedge the whole rotation: the fetch
// lock stayed held and every later "next wallpaper" silently did nothing until
// the app restarted. Every request now has connect + stall timeouts.
function downloadFile(url, dest, depth = 0) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (e) => {
      if (settled) return; settled = true;
      try { fs.unlinkSync(dest); } catch {}
      reject(e);
    };
    const req = https.get(url, {
      headers: { 'User-Agent': 'Wallraven/1.0', 'Referer': 'https://wallhaven.cc/' },
      timeout: 15000,
    }, (res) => {
      const loc = res.headers && res.headers.location;
      if (res.statusCode >= 300 && res.statusCode < 400 && loc && depth < 5) {
        res.resume();
        return downloadFile(new URL(loc, url).toString(), dest, depth + 1).then(
          (v) => { if (!settled) { settled = true; resolve(v); } },
          fail,
        );
      }
      if (res.statusCode >= 400) { res.resume(); req.destroy(); return fail(new Error(`HTTP ${res.statusCode}`)); }
      // Hard ceiling on the whole transfer, plus a stall guard between chunks.
      const overall = setTimeout(() => { req.destroy(); fail(new Error('download timed out')); }, 90000);
      let stall = setTimeout(() => { req.destroy(); fail(new Error('download stalled')); }, 20000);
      res.on('data', () => {
        clearTimeout(stall);
        stall = setTimeout(() => { req.destroy(); fail(new Error('download stalled')); }, 20000);
      });
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => {
        clearTimeout(overall); clearTimeout(stall);
        file.close(() => { if (!settled) { settled = true; resolve(dest); } });
      });
      file.on('error', (e) => { clearTimeout(overall); clearTimeout(stall); fail(e); });
      res.on('error', (e) => { clearTimeout(overall); clearTimeout(stall); fail(e); });
    });
    req.on('timeout', () => { req.destroy(); fail(new Error('connection timed out')); });
    req.on('error', fail);
  });
}


// ---------- Cache management ----------
function getPinnedFiles() {
  const set = new Set();
  const pls = config.playlists || {};
  for (const name of Object.keys(pls)) {
    const items = (pls[name] && pls[name].items) || [];
    for (const it of items) if (it && it.file) set.add(it.file);
  }
  return set;
}
// Prune the cache down to the configured size limit, oldest file first.
// Pass { dryRun: true } to get the exact plan without deleting anything —
// used by the "Test cache cleanup" button in Settings.
function pruneCache({ dryRun = false, limitMB = null } = {}) {
  const limit = limitMB == null ? config.cacheMaxMB : limitMB;
  const maxBytes = limit * 1024 * 1024;
  const pinned = getPinnedFiles();
  const files = fs.readdirSync(CACHE_DIR)
    .map((f) => {
      const p = path.join(CACHE_DIR, f);
      let s; try { s = fs.statSync(p); } catch { return null; }
      return { p, name: f, size: s.size, mtime: s.mtimeMs };
    })
    .filter(Boolean)
    .sort((a, b) => a.mtime - b.mtime);
  let total = files.reduce((a, b) => a + b.size, 0);
  const before = total;
  const removed = [];
  const skipped = [];
  for (const f of files) {
    if (total <= maxBytes) break;
    if (history.currentId && path.basename(f.p).startsWith(history.currentId + '.')) {
      skipped.push({ name: f.name, sizeMB: f.size / 1048576, reason: 'current wallpaper' });
      continue;
    }
    if (pinned.has(f.p)) {
      skipped.push({ name: f.name, sizeMB: f.size / 1048576, reason: 'pinned in a playlist' });
      continue;
    }
    if (!dryRun) { try { fs.unlinkSync(f.p); } catch { continue; } }
    total -= f.size;
    removed.push({ name: f.name, sizeMB: f.size / 1048576, mtime: f.mtime });
  }
  if (!dryRun) invalidateCacheStats();
  return {

    dryRun,
    limitMB: limit,
    fileCount: files.length,
    beforeMB: before / 1048576,
    afterMB: total / 1048576,
    removed,
    skipped,
  };
}

// Walking the whole cache folder (readdir + stat per file) is cheap once but
// several screens ask for it in quick succession. A short-lived memo keeps the
// numbers current while collapsing those bursts into one disk pass.
let statsMemo = { at: 0, value: null };
function cacheStats({ fresh = false } = {}) {
  if (!fresh && statsMemo.value && Date.now() - statsMemo.at < 3000) return statsMemo.value;
  const pinned = getPinnedFiles();
  let total = 0, pinnedBytes = 0;
  for (const f of fs.readdirSync(CACHE_DIR)) {
    try {
      const p = path.join(CACHE_DIR, f);
      const s = fs.statSync(p).size;
      total += s;
      if (pinned.has(p)) pinnedBytes += s;
    } catch {}
  }
  const value = { totalMB: total / (1024 * 1024), pinnedMB: pinnedBytes / (1024 * 1024) };
  statsMemo = { at: Date.now(), value };
  return value;
}
function invalidateCacheStats() { statsMemo = { at: 0, value: null }; }
function cacheSizeMB() { return cacheStats().totalMB; }


// ---------- Wallpaper setter (Windows) ----------
// Windows WallpaperStyle registry values per fit mode.
const FIT_MODE_STYLES = {
  fill:    { style: '10', tile: '0' },
  fit:     { style: '6',  tile: '0' },
  stretch: { style: '2',  tile: '0' },
  tile:    { style: '0',  tile: '1' },
  center:  { style: '0',  tile: '0' },
  span:    { style: '22', tile: '0' },
};
// ---------- Hardened PowerShell runner ----------
// Every PowerShell call MUST go through this. Previously each helper spawned
// powershell.exe, left stdout unread and had no timeout — so any script that
// filled its 64 KB stdout pipe, or blocked on a WinRT/COM call, became a
// permanent ~60 MB zombie. Repeated once per wallpaper change that ate every
// byte of RAM on long-running sessions. This runner:
//   - drains both stdout and stderr (never lets a pipe fill up)
//   - caps what it keeps in memory
//   - closes stdin so nothing can wait on input
//   - always kills the process tree on timeout
//   - tracks live children so quitting never leaves one behind
const LIVE_CHILDREN = new Set();
const PS_MAX_BUFFER = 64 * 1024;

function killTree(child) {
  if (!child || child.killed || child.exitCode !== null) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
        .on('error', () => { try { child.kill('SIGKILL'); } catch {} });
    } else {
      child.kill('SIGKILL');
    }
  } catch {
    try { child.kill('SIGKILL'); } catch {}
  }
}

// Resolves { code, out, err } — never rejects, never hangs.
function runPowerShell(script, { timeout = 20000, label = 'powershell' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    let out = '';
    let err = '';
    let timer = null;
    let child = null;

    const finish = (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (child) {
        LIVE_CHILDREN.delete(child);
        try { child.stdout?.removeAllListeners(); child.stderr?.removeAllListeners(); child.removeAllListeners(); } catch {}
        if (code === null) killTree(child);
      }
      resolve({ code, out, err });
    };

    const cap = (buf, chunk) => (buf.length >= PS_MAX_BUFFER ? buf : buf + chunk.toString());

    try {
      child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      err = e.message;
      return finish(-1);
    }

    LIVE_CHILDREN.add(child);
    child.stdout.on('data', (d) => { out = cap(out, d); });
    child.stderr.on('data', (d) => { err = cap(err, d); });
    child.on('error', (e) => { err = err || e.message; finish(-1); });
    child.on('close', (code) => finish(code));

    timer = setTimeout(() => {
      console.warn(`[${label}] timed out after ${timeout}ms — killing process tree`);
      finish(null); // null code => timed out; finish() kills the tree
    }, timeout);
  });
}

// Kill any straggler on shutdown so we never leak a process past our lifetime.
app.on('will-quit', () => { try { writeConfigNow(); } catch {} });
app.on('will-quit', () => { for (const c of LIVE_CHILDREN) killTree(c); LIVE_CHILDREN.clear(); });

function setWindowsWallpaper(filePath) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') {
      console.log('[dev] would set wallpaper to', filePath);
      return resolve();
    }
    const escaped = filePath.replace(/'/g, "''");
    const mode = FIT_MODE_STYLES[config.fitMode] || FIT_MODE_STYLES.fill;
    const ps = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Wp {
  [DllImport("user32.dll", CharSet=CharSet.Auto, SetLastError=true)]
  public static extern int SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni);
}
"@
Set-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name WallpaperStyle -Value '${mode.style}'
Set-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name TileWallpaper  -Value '${mode.tile}'
[Wp]::SystemParametersInfo(20, 0, '${escaped}', 3) | Out-Null
`;
    runPowerShell(ps, { timeout: 20000, label: 'wallpaper' }).then(({ code, err }) => {
      if (code === 0) resolve();
      else reject(new Error(err || (code === null ? 'wallpaper set timed out' : `powershell exit ${code}`)));
    });
  });
}


// Set the Windows 10/11 lock screen image via the WinRT
// Windows.System.UserProfile.LockScreen API. Works per-user without admin.
function setWindowsLockScreen(filePath) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      console.log('[dev] would set lockscreen to', filePath);
      return resolve();
    }
    const escaped = filePath.replace(/'/g, "''");
    const ps = `
$ErrorActionPreference = 'Stop'
try {
  [Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime] | Out-Null
  [Windows.System.UserProfile.LockScreen,Windows.System.UserProfile,ContentType=WindowsRuntime] | Out-Null
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $methods = [System.WindowsRuntimeSystemExtensions].GetMethods()
  $asTaskOp = $methods | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' } | Select-Object -First 1
  $asTaskAction = $methods | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' } | Select-Object -First 1
  $op = [Windows.Storage.StorageFile]::GetFileFromPathAsync('${escaped}')
  $t = $asTaskOp.MakeGenericMethod([Windows.Storage.StorageFile]).Invoke($null, @($op))
  if (-not $t.Wait(10000)) { throw 'timed out opening file' }
  $file = $t.Result
  $action = [Windows.System.UserProfile.LockScreen]::SetImageFileAsync($file)
  $t2 = $asTaskAction.Invoke($null, @($action))
  if (-not $t2.Wait(10000)) { throw 'timed out setting lock screen' }
  exit 0
} catch { Write-Error $_; exit 1 }
`;
    runPowerShell(ps, { timeout: 25000, label: 'lockscreen' }).then(({ code, err }) => {
      if (code !== 0) console.warn('[lockscreen] failed:', (err || '').trim() || (code === null ? 'timed out' : `exit ${code}`));
      resolve(); // best-effort — never block wallpaper flow
    });
  });
}



// Per-monitor wallpaper via IDesktopWallpaper COM (Windows 8+). Accepts an
// array of file paths; if fewer than the monitor count, the list wraps.
function setWindowsWallpaperPerMonitor(filePaths) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') {
      console.log('[dev] would set per-monitor wallpapers', filePaths);
      return resolve();
    }
    if (!filePaths || !filePaths.length) return reject(new Error('No files'));
    const arr = filePaths.map(p => `'${p.replace(/'/g, "''")}'`).join(',');
    const ps = `
$sig = @"
[ComImport, Guid("B92B56A9-8B55-4E14-9A89-0199BBB6F93B"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IDesktopWallpaper {
  void SetWallpaper(string monitorID, string wallpaper);
  [return: MarshalAs(UnmanagedType.LPWStr)] string GetWallpaper(string monitorID);
  [return: MarshalAs(UnmanagedType.LPWStr)] string GetMonitorDevicePathAt(uint monitorIndex);
  uint GetMonitorDevicePathCount();
}
"@
Add-Type -MemberDefinition @"
[DllImport("ole32.dll")] public static extern int CoCreateInstance(ref System.Guid rclsid, System.IntPtr pUnkOuter, uint dwClsContext, ref System.Guid riid, out System.IntPtr ppv);
"@ -Name Ole -Namespace WR
Add-Type -TypeDefinition $sig -ReferencedAssemblies System.Runtime.InteropServices
$clsid = [System.Guid]::Parse('C2CF3110-460E-4fc1-B9D0-8A1C0C9CC4BD')
$iid   = [System.Guid]::Parse('B92B56A9-8B55-4E14-9A89-0199BBB6F93B')
$ptr = [System.IntPtr]::Zero
[void][WR.Ole]::CoCreateInstance([ref]$clsid, [System.IntPtr]::Zero, 4, [ref]$iid, [ref]$ptr)
$wp = [System.Runtime.InteropServices.Marshal]::GetObjectForIUnknown($ptr)
$files = @(${arr})
$count = $wp.GetMonitorDevicePathCount()
for ($i=0; $i -lt $count; $i++) {
  $mid = $wp.GetMonitorDevicePathAt([uint32]$i)
  $f = $files[$i % $files.Length]
  $wp.SetWallpaper($mid, $f)
}
`;
    runPowerShell(ps, { timeout: 25000, label: 'wallpaper-multi' }).then(({ code, err }) => {
      if (code === 0) resolve();
      else reject(new Error(err || (code === null ? 'per-monitor set timed out' : `powershell exit ${code}`)));
    });

  });
}

// Recursively enumerate image files inside a folder.
function scanFolderImages(dir, maxItems = 5000) {
  const out = [];
  const walk = (d) => {
    if (out.length >= maxItems) return;
    let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (out.length >= maxItems) return;
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && IMAGE_EXTS.has(path.extname(e.name).toLowerCase())) out.push(full);
    }
  };
  walk(dir);
  return out;
}

// ---------- Main cycle ----------

// ---------- Fullscreen app detection ----------
// Inspects the foreground window and reports whether it covers a whole
// monitor, plus the owning process/window names so rotations can be paused
// for *specific* apps only. Best-effort: any failure reports not-fullscreen.
function probeForegroundWindow() {
  return new Promise((resolve) => {
    const none = { fullscreen: false, process: '', title: '' };
    if (process.platform !== 'win32') return resolve(none);
    const ps = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class FgW {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll")] public static extern IntPtr GetDesktopWindow();
  [DllImport("user32.dll")] public static extern IntPtr GetShellWindow();
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern int GetClassName(IntPtr hWnd, System.Text.StringBuilder s, int max);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
}
"@
$h = [FgW]::GetForegroundWindow()
if ($h -eq [IntPtr]::Zero -or $h -eq [FgW]::GetDesktopWindow() -or $h -eq [FgW]::GetShellWindow()) { 'no||'; exit }
$sb = New-Object System.Text.StringBuilder 256
[void][FgW]::GetClassName($h, $sb, 256)
$cls = $sb.ToString()
if ($cls -eq 'Progman' -or $cls -eq 'WorkerW' -or $cls -eq 'Shell_TrayWnd') { 'no||'; exit }
$procId = [uint32]0
[void][FgW]::GetWindowThreadProcessId($h, [ref]$procId)
$pname = ''
$ptitle = ''
try { $p = Get-Process -Id $procId -ErrorAction Stop; $pname = $p.ProcessName; $ptitle = $p.MainWindowTitle } catch {}
$r = New-Object FgW+RECT
$full = 'no'
if ([FgW]::GetWindowRect($h, [ref]$r)) {
  Add-Type -AssemblyName System.Windows.Forms
  $scr = [System.Windows.Forms.Screen]::FromHandle($h).Bounds
  if ($r.Left -le $scr.Left -and $r.Top -le $scr.Top -and $r.Right -ge $scr.Right -and $r.Bottom -ge $scr.Bottom) { $full = 'yes' }
}
"$full|$pname|$ptitle"
`;
    runPowerShell(ps, { timeout: 6000, label: 'fgwindow' }).then(({ code, out }) => {
      if (code !== 0) return resolve(none);
      const line = out.split(/\r?\n/).map(s => s.trim()).filter(Boolean).pop() || '';
      const [full, pname, title] = line.split('|');
      resolve({ fullscreen: /yes/i.test(full || ''), process: (pname || '').trim(), title: (title || '').trim() });
    });

  });
}

const normalizeAppName = (s) => String(s || '').trim().toLowerCase().replace(/\.exe$/, '');

// Should we defer an automatic rotation right now?
async function shouldDeferForFullscreen() {
  if (!config.pauseOnFullscreen) return null;
  const info = await probeForegroundWindow();
  if (!info.fullscreen) return null;
  const mode = config.pauseFullscreenMode || 'all';
  if (mode === 'all') return info;
  const list = (config.pauseFullscreenApps || []).map(normalizeAppName).filter(Boolean);
  if (!list.length) return null;
  return list.includes(normalizeAppName(info.process)) ? info : null;
}

// ---------- v0.5.0: offline probe, cached-only fallback, prefetch, stats, nav ----------
// Cheap connectivity probe: a short (3s) request to the Wallhaven API. We
// only care whether we can reach the network, so any non-5xx counts as online.
function checkOnline() {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    try {
      const req = https.get('https://wallhaven.cc/api/v1/wallpapers/1', { headers: { 'User-Agent': 'WallhavenTray/1.0' }, timeout: 3000 }, (res) => {
        finish(res.statusCode < 500);
        res.resume();
      });
      req.on('timeout', () => { req.destroy(); finish(false); });
      req.on('error', () => finish(false));
    } catch { finish(false); }
  });
}

// Should the next rotation skip the network entirely?
async function useCachedOnly() {
  if (config.offlineCachedOnlyManual) return true;
  if (!config.offlineCachedOnly) return false;
  const online = await checkOnline();
  const changed = online === offlineNotified; // notify on *change* only
  offlineNotified = !online;
  if (changed) {
    notifySettings('app-toast', { msg: online ? 'Back online' : 'Offline — cycling cached wallpapers', kind: online ? 'ok' : 'err' });
  }
  return !online;
}

// Pick a random cached image (excluding the current one) for offline/metered mode.
function pickCachedWallpaper() {
  let files = [];
  try {
    files = fs.readdirSync(CACHE_DIR)
      .filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
      .map((f) => path.join(CACHE_DIR, f));
  } catch {}
  const cur = (navPos >= 0 && navPos < history.items.length) ? history.items[navPos] : null;
  if (cur) files = files.filter((p) => p !== cur.file);
  if (!files.length) return null;
  return files[Math.floor(Math.random() * files.length)];
}

// Statistics: lightweight counters persisted in config.stats (machine-local).
function currentMonthKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function bumpStats({ cached = false, fallback = false, source = null }) {
  const s = (config.stats = config.stats || { shownTotal: 0, shownMonth: 0, shownMonthKey: '', cacheHits: 0, downloads: 0, fallbacks: 0, sources: {} });
  if (s.shownMonthKey !== currentMonthKey()) { s.shownMonthKey = currentMonthKey(); s.shownMonth = 0; }
  s.shownTotal = (Number(s.shownTotal) || 0) + 1;
  s.shownMonth = (Number(s.shownMonth) || 0) + 1;
  if (cached) s.cacheHits = (Number(s.cacheHits) || 0) + 1; else s.downloads = (Number(s.downloads) || 0) + 1;
  if (fallback) s.fallbacks = (Number(s.fallbacks) || 0) + 1;
  if (source) s.sources = { ...(s.sources || {}), [source]: (Number(s.sources?.[source]) || 0) + 1 };
  persistConfigQuiet();
}

// Prefetch: pre-warm the next candidate so the next swap is instant. Runs the
// same search selection, downloads to the cache, and stashes metadata. The
// next rotation prefers a ready candidate. Best-effort, silent on failure.
function schedulePrefetch() {
  clearTimeout(prefetchTimer);
  if (!config.prefetchEnabled) return;
  if (config.sourceMode !== 'search') return;
  prefetchTimer = setTimeout(doPrefetch, 10000);
}
async function doPrefetch() {
  try {
    if (await shouldDeferForFullscreen()) return;            // don't compete with a game
    if (await useCachedOnly()) return;                       // offline — nothing to prefetch
    const res = await searchWithFallback();
    const recentIds = new Set(history.items.slice(-30).map((i) => i.id));
    const disliked = new Set((config.dislikes || []).map(String));
    const pool = (res.items || []).filter((w) => !recentIds.has(w.id) && !disliked.has(String(w.id)));
    if (!pool.length) return;
    const choice = pool[Math.floor(Math.random() * pool.length)];
    const ext = choice.file_type && choice.file_type.includes('png') ? 'png' : 'jpg';
    const dest = path.join(CACHE_DIR, `${choice.id}.${ext}`);
    if (fs.existsSync(dest)) return;
    await downloadFile(choice.path, dest);
    prefetched.push({ item: choice, file: dest });
    while (prefetched.length > 5) prefetched.shift();   // never let candidates pile up

  } catch (e) { console.warn('prefetch failed', e.message); }
}
function takePrefetched() {
  while (prefetched.length) {
    const pre = prefetched.shift();
    if (pre && pre.file && fs.existsSync(pre.file)) return pre;
  }
  return null;
}

// Browser-style back/forward over the history timeline. Navigation never
// appends to history — it just moves a cursor and re-applies the file.
async function navigateHistory(dir) {
  if (!history.items.length) return;
  const last = history.items.length - 1;
  if (dir === 'back') navPos = Math.max(0, navPos - 1);
  else navPos = Math.min(last, navPos + 1);
  const item = history.items[navPos];
  if (!item || !item.file || !fs.existsSync(item.file)) { notifyRenderer(); updateTrayMenu(); return; }
  try {
    await applyWallpaper(item.file, null);
    history.currentId = item.id;
    saveHistory();
    updateTrayMenu();
    if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.webContents.send('wallpaper-changed', currentInfo());
  } catch (e) { console.error('nav error', e); }
}


// Which source can we actually serve right now? Falls back to 'search' when the
// configured source has nothing usable behind it, telling the user once.
let lastHealReason = null;
function resolveSourceMode() {
  const want = config.sourceMode || 'search';
  let reason = null;
  if (want === 'playlist') {
    const items = config.playlists?.[config.activePlaylist]?.items || [];
    const usable = items.filter((it) => it && it.file && fs.existsSync(it.file));
    if (!config.activePlaylist || !usable.length) {
      reason = `Playlist “${config.activePlaylist || 'none selected'}” has no available images — using your search instead`;
    }
  } else if (want === 'folder') {
    let files = [];
    try { files = localFolderFiles(); } catch {}
    if (!(config.folderPaths || []).length || !files.length) {
      reason = 'No images found in your wallpaper folders — using your search instead';
    }
  } else if (want === 'collection') {
    if (!config.collectionId || !config.whUsername || !config.apiKey) {
      reason = 'Your Wallhaven collection needs your username and API key — using your search instead';
    }
  }
  if (reason) {
    if (reason !== lastHealReason) {
      lastHealReason = reason;
      try { notifySettings('app-toast', { msg: reason, kind: 'err' }); } catch {}
      console.warn('[wallraven] source healed to search:', reason);
    }
    return 'search';
  }
  lastHealReason = null;
  return want;
}

async function fetchAndSetWallpaper(manual = false) {
  // A user-triggered change must never be dropped just because a background
  // rotation is mid-flight — wait for it, then run. Automatic ticks still skip.
  if (isFetching) {
    if (!manual) return;
    const waitedOut = await new Promise((resolve) => {
      const started = Date.now();
      const iv = setInterval(() => {
        if (!isFetching) { clearInterval(iv); resolve(false); }
        else if (Date.now() - started > 30000) { clearInterval(iv); resolve(true); }
      }, 150);
    });
    // Safety valve: a lock held this long means something hung — take it over
    // rather than leaving the app stuck on one wallpaper until it restarts.
    if (waitedOut) { console.warn('[wallraven] fetch lock held too long — taking over'); isFetching = false; }
  }

  if (paused && !manual) return;
  // Defer automatic rotations while a fullscreen app/game is in the foreground.
  if (!manual) {
    try {
      const deferFor = await shouldDeferForFullscreen();
      if (deferFor) {
        console.log('[wallraven] rotation deferred: fullscreen app active', deferFor.process);
        return;

      }
    } catch {}
  }
  isFetching = true;
  updateTrayMenu();
  let servedFromCache = false;     // stats: true when no network download was needed
  // Validate the chosen source before using it. A source can go stale at any
  // time (a playlist whose files were deleted, a folder on a removed drive, a
  // collection imported from someone else's preset). Rather than throwing on
  // every tick and looking frozen, we heal back to a plain search and say so.
  const mode = resolveSourceMode();
  let sourceLabel = mode;
  try {
    // Offline / cached-only: skip the network entirely and pick from cache.
    // Applies to networked sources (search + collection); local playlist/folder
    // modes never touch the network so they run their normal path below.
    if ((mode === 'search' || mode === 'collection') && (await useCachedOnly())) {
      const cachedFile = pickCachedWallpaper();
      if (cachedFile) {
        await applyWallpaper(cachedFile, null);
        const id = path.basename(cachedFile, path.extname(cachedFile));
        history.items.push({ id, url: '', file: cachedFile, ts: Date.now(), resolution: '' });
        history.currentId = id;
        if (history.items.length > 200) history.items = history.items.slice(-200);
        navPos = history.items.length - 1;
        saveHistory();
        servedFromCache = true;
        sourceLabel = 'offline-cache';
        bumpStats({ cached: true, source: sourceLabel });
        if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.webContents.send('wallpaper-changed', currentInfo());
        return;
      }
      // No cached file available — fall through to a real attempt (may still fail).
    }
    let items, usedFallback = null, playlistChoice = null;
    if (mode === 'playlist') {
      // Sequential playback of a local playlist. Skip missing files.
      const pl = config.playlists[config.activePlaylist];
      const list = pl.items.filter(it => it && it.file && fs.existsSync(it.file));
      let idx = Number(config.playlistIndex) || 0;
      if (!manual || idx >= list.length) idx = idx % list.length;
      playlistChoice = list[idx % list.length];
      config.playlistIndex = (idx + 1) % list.length;
      saveConfig();
    } else if (mode === 'folder') {
      // Rotate straight through local folders — no playlist required.
      const files = localFolderFiles();
      let file;
      if ((config.folderOrder || 'random') === 'sequential') {
        const idx = (Number(config.folderIndex) || 0) % files.length;
        file = files[idx];
        config.folderIndex = (idx + 1) % files.length;
      } else {
        const recent = new Set(history.items.slice(-Math.min(30, Math.max(0, files.length - 1))).map(i => i.file));
        const pool = files.filter(f => !recent.has(f));
        const src = pool.length ? pool : files;
        file = src[Math.floor(Math.random() * src.length)];
      }
      playlistChoice = {
        id: 'local:' + Buffer.from(file).toString('base64').slice(0, 24),
        url: '', file, resolution: '', local: true,
      };
      saveConfig();
    } else if (mode === 'collection') {
      // Fetch from user's Wallhaven collection. If it's empty or the request
      // fails we quietly fall back to a search rather than stalling.
      try {
        const baseUrl = `https://wallhaven.cc/api/v1/collections/${encodeURIComponent(config.whUsername)}/${config.collectionId}?apikey=${encodeURIComponent(config.apiKey)}`;
        const first = await httpsGetJSON(baseUrl + '&page=1');
        const lastPage = first?.meta?.last_page || 1;
        let data = first;
        if (lastPage > 1) {
          const page = 1 + Math.floor(Math.random() * lastPage);
          if (page !== 1) { try { data = await httpsGetJSON(baseUrl + '&page=' + page); } catch { data = first; } }
        }
        items = data?.data || [];
        if (!items.length) throw new Error('Collection is empty');
      } catch (e) {
        try { notifySettings('app-toast', { msg: 'Your Wallhaven collection returned nothing — using your search instead', kind: 'err' }); } catch {}
        const res = await searchWithFallback();
        items = res.items; usedFallback = res.usedFallback; sourceLabel = 'search';
      }
    } else {
      // Prefer a prefetched candidate so the swap is instant (no download).
      const pre = takePrefetched();
      if (pre) {
        items = [pre.item];
      } else {
        const res = await searchWithFallback();
        items = res.items; usedFallback = res.usedFallback;
      }
    }
    let choice, dest;
    if (playlistChoice) {
      choice = playlistChoice;
      dest = playlistChoice.file;
      servedFromCache = true;          // local file — no download needed
    } else {
      const recentIds = new Set(history.items.slice(-30).map((i) => i.id));
      const disliked = new Set((config.dislikes || []).map(String));
      const pool = items.filter((w) => !recentIds.has(w.id) && !disliked.has(String(w.id)));
      const src = pool.length ? pool : items.filter((w) => !disliked.has(String(w.id)));
      if (!src.length) throw new Error('All results were disliked — clear dislikes or widen filters');
      choice = src[Math.floor(Math.random() * src.length)];
      const ext = choice.file_type && choice.file_type.includes('png') ? 'png' : 'jpg';
      dest = path.join(CACHE_DIR, `${choice.id}.${ext}`);
      if (!fs.existsSync(dest)) {
        try { await downloadFile(choice.path, dest); }
        catch { await new Promise(r => setTimeout(r, 1500)); await downloadFile(choice.path, dest); }
      } else {
        servedFromCache = true;        // already cached — no download this rotation
      }
    }
    await applyWallpaper(dest, playlistChoice ? choice : null);
    history.items.push({ id: choice.id, url: choice.url, file: dest, ts: Date.now(), resolution: choice.resolution });
    history.currentId = choice.id;
    if (history.items.length > 200) history.items = history.items.slice(-200);
    navPos = history.items.length - 1;   // a new rotation clears the forward stack
    saveHistory();
    pruneCache();
    bumpStats({ cached: servedFromCache, fallback: !!usedFallback, source: sourceLabel });
    schedulePrefetch();
    if (config.notifyOnChange && Notification.isSupported()) {
      const body = usedFallback ? `${choice.resolution} • fell back to ${usedFallback}` : `${choice.resolution} • ${choice.id}`;
      new Notification({ title: 'Wallpaper updated', body, icon: ICON_PATH }).show();
    }
    if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.webContents.send('wallpaper-changed', currentInfo());
  } catch (e) {
    console.error('cycle error', e);
    // Never fail silently — a stuck wallpaper with no explanation looks broken.
    try { notifySettings('app-toast', { msg: 'Couldn’t change wallpaper: ' + e.message, kind: 'err' }); } catch {}
    if (manual && Notification.isSupported()) {
      new Notification({ title: 'WallRaven', body: 'Error: ' + e.message, icon: ICON_PATH }).show();
    }
  } finally {
    isFetching = false;
    updateTrayMenu();
  }
}

// Pick the right wallpaper application path based on the monitor mode.
// - 'same' / 'span': one image on all monitors (Windows honors the fitMode `span` style for spanning)
// - 'different': one image per monitor, sourced from the active playlist so
//   the user has predictable control over what shows where.
async function applyWallpaper(primaryPath, currentPlaylistItem) {
  const mode = config.monitorMode || 'same';
  let result;
  if (mode !== 'different' || process.platform !== 'win32') {
    result = await setWindowsWallpaper(primaryPath);

  } else {
    const monitorCount = (() => {
      try { return screen.getAllDisplays().length; } catch { return 1; }
    })();
    if (monitorCount < 2) {
      result = await setWindowsWallpaper(primaryPath);
    } else {
      const pl = config.activePlaylist && config.playlists?.[config.activePlaylist];
      let files = [primaryPath];
      if (pl && pl.items && pl.items.length >= 2) {
        const list = pl.items.filter(it => it && it.file && fs.existsSync(it.file));
        if (list.length >= 2) {
          const startIdx = ((Number(config.playlistIndex) || 0) - 1 + list.length) % list.length;
          files = [];
          for (let i = 0; i < monitorCount; i++) files.push(list[(startIdx + i) % list.length].file);
        }
      }
      result = await setWindowsWallpaperPerMonitor(files);
    }
  }

  // Best-effort: mirror to lock screen when enabled.
  if (config.matchLockScreen) {
    try { await setWindowsLockScreen(primaryPath); } catch (e) { console.warn('lockscreen err', e); }
  }
  return result;
}


// Back/forward over the history timeline. Kept as setPreviousWallpaper() so
// existing tray/hotkey callers keep working; forward is exposed separately.
async function setPreviousWallpaper() { return navigateHistory('back'); }
async function setNextWallpaper() { return navigateHistory('forward'); }

function currentInfo() {
  const last = history.items[history.items.length - 1];
  const st = cacheStats();
  // "current" reflects the navigated-to item when the user has gone back.
  const cur = (navPos >= 0 && navPos < history.items.length) ? history.items[navPos] : last;
  return {
    current: cur || null,
    cacheMB: st.totalMB, pinnedMB: st.pinnedMB, historyCount: history.items.length,
    canBack: navPos > 0,
    canForward: navPos >= 0 && navPos < history.items.length - 1,
    paused,
  };
}

function scheduleCycle() {
  if (cycleTimer) clearInterval(cycleTimer);
  const ms = Math.max(1, effectiveCycleMinutes()) * 60 * 1000;
  cycleTimer = setInterval(() => fetchAndSetWallpaper(false), ms);
}

// ---------- Timetable / Schedule engine ----------
// Every 60s we look up "which rule is active right now" (latest rule for
// today's weekday whose startHHMM is ≤ now). When the active rule changes
// we swap source (playlist, preset, collection, or plain search) and
// immediately reschedule the rotation using the rule's interval so the
// user sees the switch straight away.
let scheduleTimer = null;
let lastAppliedRuleId = null;
function parseHHMM(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  return Math.min(23, Math.max(0, Number(m[1]))) * 60 + Math.min(59, Math.max(0, Number(m[2])));
}
function activeScheduleRule(now = new Date()) {
  const sch = config.schedule || {};
  if (!sch.enabled || !Array.isArray(sch.rules) || !sch.rules.length) return null;
  const dow = now.getDay(); // 0=Sun..6=Sat
  const mins = now.getHours() * 60 + now.getMinutes();
  const todays = sch.rules
    .filter(r => !r.days || !r.days.length || r.days.includes(dow))
    .map(r => ({ ...r, _mins: parseHHMM(r.startHHMM) }))
    .filter(r => r._mins != null && r._mins <= mins)
    .sort((a, b) => a._mins - b._mins);
  return todays.length ? todays[todays.length - 1] : null;
}
function applyScheduleRule(rule) {
  if (!rule) return;
  let dirty = false;
  // Only switch to a playlist/collection source when it actually exists here —
  // rules can arrive from an imported preset and reference someone else's data.
  const havePlaylist = !!(rule.sourceRef && config.playlists?.[rule.sourceRef]?.items?.length);
  const haveCollection = !!(rule.sourceRef && config.whUsername && config.apiKey);
  const wantMode = rule.sourceType === 'playlist' ? (havePlaylist ? 'playlist' : 'search')
                  : rule.sourceType === 'collection' ? (haveCollection ? 'collection' : 'search')
                  : 'search';
  if (config.sourceMode !== wantMode) { config.sourceMode = wantMode; dirty = true; }
  if (rule.sourceType === 'playlist' && havePlaylist && config.activePlaylist !== rule.sourceRef) {
    config.activePlaylist = rule.sourceRef; config.playlistIndex = 0; dirty = true;
  }
  if (rule.sourceType === 'collection' && haveCollection && String(config.collectionId) !== String(rule.sourceRef)) {
    config.collectionId = Number(rule.sourceRef) || rule.sourceRef; dirty = true;
  }
  if (rule.sourceType === 'preset' && rule.sourceRef && config.presets?.[rule.sourceRef]) {
    // A preset must never rewrite the timetable that's driving it, or we'd get
    // rules replacing rules mid-tick.
    const p = { ...config.presets[rule.sourceRef] };
    delete p.schedule;
    Object.assign(config, p);
    dirty = true;
  }
  if (dirty) saveConfig();
}
function effectiveCycleMinutes() {
  const rule = activeScheduleRule();
  if (rule && Number(rule.intervalMin) > 0) return Number(rule.intervalMin);
  return Number(config.cycleMinutes) || 30;
}
function startScheduleTicker() {
  if (scheduleTimer) clearInterval(scheduleTimer);
  const tick = () => {
    if (paused) return;
    const rule = activeScheduleRule();
    const id = rule ? rule.id : null;
    if (id !== lastAppliedRuleId) {
      lastAppliedRuleId = id;
      if (rule) {
        applyScheduleRule(rule);
        scheduleCycle();
        fetchAndSetWallpaper(false);
        updateTrayMenu();
      }
    }
  };
  scheduleTimer = setInterval(tick, 60 * 1000);
  // Prime immediately so a rule applies on startup.
  setTimeout(tick, 500);
}

// ---------- Like / Dislike ----------
function ensureLikedPlaylist() {
  if (!config.playlists) config.playlists = {};
  if (!config.playlists['Liked']) config.playlists['Liked'] = { items: [], createdAt: Date.now() };
  return config.playlists['Liked'];
}
function normaliseReactionItem(item) {
  if (!item || !item.id) return null;
  return {
    id: String(item.id), url: item.url || '', file: item.file || '', thumb: item.thumb || '',
    resolution: item.resolution || '', file_type: item.file_type || '',
  };
}
function setWallpaperReaction(item, nextState) {
  const clean = normaliseReactionItem(item);
  if (!clean || !['liked', 'disliked', 'neutral'].includes(nextState)) {
    return { ok: false, reason: 'Invalid wallpaper reaction' };
  }
  const id = clean.id;
  if (!Array.isArray(config.likes)) config.likes = [];
  if (!Array.isArray(config.dislikes)) config.dislikes = [];
  if (!Array.isArray(config.dislikedItems)) config.dislikedItems = [];
  const liked = ensureLikedPlaylist();
  config.likes = config.likes.filter((value) => String(value) !== id);
  config.dislikes = config.dislikes.filter((value) => String(value) !== id);
  liked.items = liked.items.filter((value) => String(value.id) !== id);
  config.dislikedItems = config.dislikedItems.filter((value) => String(value.id) !== id);
  if (nextState === 'liked') {
    config.likes.push(id);
    liked.items.push(clean);
  } else if (nextState === 'disliked') {
    config.dislikes.push(id);
    config.dislikedItems.push(clean);
  }
  saveConfig();
  updateTrayMenu();
  notifyRenderer();
  return { ok: true, id, state: nextState };
}
function likeCurrent() {
  const last = history.items[history.items.length - 1];
  if (!last) return { ok: false, reason: 'No current wallpaper' };
  const active = (config.likes || []).some((id) => String(id) === String(last.id));
  return setWallpaperReaction(last, active ? 'neutral' : 'liked');
}
// Toggle "liked" for any wallpaper, not just the current one (used by the
// Recently shown grid). Returns the new state so the UI can update in place.
function toggleLikeItem(item) {
  const id = item && item.id;
  if (!id) return { ok: false, reason: 'No wallpaper' };
  if (!Array.isArray(config.likes)) config.likes = [];
  const pl = ensureLikedPlaylist();
  const isLiked = config.likes.includes(id);
  if (isLiked) {
    config.likes = config.likes.filter(i => i !== id);
    pl.items = pl.items.filter(i => i.id !== id);
  } else {
    config.likes.push(id);
    if (!pl.items.some(i => i.id === id)) {
      pl.items.push({
        id, url: item.url || '', file: item.file || '', thumb: item.thumb || '',
        resolution: item.resolution || '', file_type: '',
      });
    }
  }
  saveConfig();
  updateTrayMenu();
  return { ok: true, id, liked: !isLiked };
}
function dislikeCurrent() {
  const last = history.items[history.items.length - 1];
  if (!last) return { ok: false, reason: 'No current wallpaper' };
  const active = (config.dislikes || []).some((id) => String(id) === String(last.id));
  const result = setWallpaperReaction(last, active ? 'neutral' : 'disliked');
  if (!active) fetchAndSetWallpaper(true); // immediately pick a replacement
  return result;
}

// ---------- Auto-update ----------
// Primary source: a small JSON manifest published with the web app.
// Fallback: the GitHub "latest release" API (used once releases exist there).
const UPDATE_MANIFEST_URLS = ['https://wallraven.app/updates/latest.json', 'https://wallraven.lovable.app/updates/latest.json'];
const GITHUB_RELEASES_URL = 'https://api.github.com/repos/wallraven-app/wallraven/releases/latest';
const UPDATE_DIR = path.join(DATA_DIR, 'updates');

// Semver-aware comparison. The numeric core is compared first, then the
// prerelease suffix: a plain release always outranks a prerelease of the same
// version, so 0.8.0 beats 0.8.0-beta.2 rather than losing to it.
function compareVersions(a, b) {
  const parse = (v) => {
    const s = String(v || '').trim().replace(/^v/i, '');
    const plus = s.indexOf('+');                      // build metadata is not compared
    const bare = plus === -1 ? s : s.slice(0, plus);
    const dash = bare.indexOf('-');
    const core = dash === -1 ? bare : bare.slice(0, dash);
    return {
      core: core.split('.').map((x) => (/^\d+$/.test(x) ? Number(x) : 0)),
      pre: dash === -1 ? '' : bare.slice(dash + 1),
    };
  };
  const A = parse(a), B = parse(b);

  for (let i = 0; i < Math.max(A.core.length, B.core.length); i++) {
    const x = A.core[i] ?? 0, y = B.core[i] ?? 0;
    if (x !== y) return x - y;
  }

  // Equal cores: absence of a prerelease wins.
  if (!A.pre && !B.pre) return 0;
  if (!A.pre) return 1;
  if (!B.pre) return -1;

  // Both prereleases: dot-separated identifiers, numeric ones sorting below
  // alphanumeric ones, and a shorter run of identifiers sorting below a longer.
  const ai = A.pre.split('.'), bi = B.pre.split('.');
  for (let i = 0; i < Math.max(ai.length, bi.length); i++) {
    const x = ai[i], y = bi[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const xn = /^\d+$/.test(x), yn = /^\d+$/.test(y);
    if (xn && yn) return Number(x) - Number(y);
    if (xn) return -1;
    if (yn) return 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

function sendUpdateStatus(patch) {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    try { settingsWindow.webContents.send('update-status', { ...patch }); } catch {}
  }
}

async function fetchUpdateManifest() {
  // Cache-bust so a freshly published manifest is seen immediately.
  let m = null;
  for (const base of UPDATE_MANIFEST_URLS) {
    m = await httpsGetJSON(`${base}?t=${Date.now()}`).catch(() => null);
    if (m && m.version) break;
  }
  if (m && m.version) {
    return {
      latestVersion: String(m.version).replace(/^v/i, ''),
      url: m.url || m.downloadUrl || '',
      pageUrl: m.pageUrl || '',
      notes: m.notes || '',
      sizeBytes: Number(m.sizeBytes) || 0,
      source: 'manifest',
    };
  }
  const gh = await httpsGetJSON(GITHUB_RELEASES_URL).catch(() => null);
  if (gh && gh.tag_name) {
    const asset = (gh.assets || []).find(a => /\.exe$/i.test(a.name || ''));
    return {
      latestVersion: String(gh.tag_name).replace(/^v/i, ''),
      url: asset?.browser_download_url || '',
      pageUrl: gh.html_url || '',
      notes: gh.body || '',
      sizeBytes: Number(asset?.size) || 0,
      source: 'github',
    };
  }
  return null;
}

async function checkForUpdates(force = false) {
  try {
    const last = config.updateInfo?.checkedAt || 0;
    if (!force && Date.now() - last < 6 * 60 * 60 * 1000) return config.updateInfo;
    const info = await fetchUpdateManifest();
    if (!info) {
      config.updateInfo = { ...(config.updateInfo || {}), checkedAt: Date.now(), error: 'Could not reach the update server' };
      saveConfig(); sendUpdateStatus({ phase: 'error', message: 'Could not reach the update server' });
      return config.updateInfo;
    }
    const current = app.getVersion();
    const isNewer = compareVersions(info.latestVersion, current) > 0;
    const prev = config.updateInfo || {};
    config.updateInfo = {
      latestVersion: info.latestVersion,
      url: info.url || info.pageUrl || '',
      downloadUrl: info.url || '',
      pageUrl: info.pageUrl || '',
      notes: info.notes || '',
      sizeBytes: info.sizeBytes || 0,
      checkedAt: Date.now(),
      dismissed: prev.dismissed || '',
      // Keep any already-downloaded installer only if it matches the version.
      downloadedFile: prev.downloadedVersion === info.latestVersion ? prev.downloadedFile : '',
      downloadedVersion: prev.downloadedVersion === info.latestVersion ? prev.downloadedVersion : '',
      error: '',
    };
    saveConfig();
    updateTrayMenu();
    sendUpdateStatus({ phase: isNewer ? 'available' : 'uptodate', info: config.updateInfo });
    if (isNewer && info.latestVersion !== config.updateInfo.dismissed) {
      if (config.autoInstallUpdates && config.updateInfo.downloadUrl) {
        // Teams-style: fetch and install it ourselves, then restart.
        autoUpdateFlow().catch(() => {});
      } else {
        if (Notification.isSupported()) {
          new Notification({ title: `WallRaven v${info.latestVersion} available`, body: 'Open Settings → Updates to install it.', icon: ICON_PATH }).show();
        }
        if (config.autoDownloadUpdates && config.updateInfo.downloadUrl && !config.updateInfo.downloadedFile) {
          downloadUpdate().catch(() => {});
        }
      }
    }

    return config.updateInfo;
  } catch (e) { console.error('update check', e); return config.updateInfo; }
}

let updateDownloading = false;
// Download the installer for the known latest version into <userData>/updates.
async function downloadUpdate() {
  const info = config.updateInfo || {};
  const url = info.downloadUrl || '';
  if (!url) throw new Error('No installer URL for this release');
  if (updateDownloading) return { ok: false, reason: 'Already downloading' };
  if (info.downloadedFile && fs.existsSync(info.downloadedFile) && info.downloadedVersion === info.latestVersion) {
    sendUpdateStatus({ phase: 'downloaded', file: info.downloadedFile, info });
    return { ok: true, file: info.downloadedFile, cached: true };
  }
  updateDownloading = true;
  try { fs.mkdirSync(UPDATE_DIR, { recursive: true }); } catch {}
  const dest = path.join(UPDATE_DIR, `Wallraven-Setup-v${info.latestVersion}.exe`);
  const tmp = dest + '.part';
  sendUpdateStatus({ phase: 'downloading', percent: 0 });
  try {
    await new Promise((resolve, reject) => {
      const get = (u, redirects = 0) => {
        https.get(u, { headers: { 'User-Agent': 'Wallraven-Updater' } }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            if (redirects > 5) return reject(new Error('Too many redirects'));
            res.resume();
            return get(new URL(res.headers.location, u).toString(), redirects + 1);
          }
          if (res.statusCode >= 400) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
          const total = Number(res.headers['content-length']) || info.sizeBytes || 0;
          let got = 0, lastPct = -1;
          const file = fs.createWriteStream(tmp);
          res.on('data', (c) => {
            got += c.length;
            const pct = total ? Math.floor((got / total) * 100) : 0;
            if (pct !== lastPct) { lastPct = pct; sendUpdateStatus({ phase: 'downloading', percent: pct, gotBytes: got, totalBytes: total }); }
          });
          res.pipe(file);
          file.on('finish', () => file.close(() => resolve()));
          file.on('error', reject);
        }).on('error', reject);
      };
      get(url);
    });
    // Sanity check: an NSIS installer is never this small.
    const size = fs.statSync(tmp).size;
    if (size < 1024 * 1024) throw new Error('Downloaded file looks invalid (too small)');
    try { fs.rmSync(dest, { force: true }); } catch {}
    fs.renameSync(tmp, dest);
    config.updateInfo = { ...config.updateInfo, downloadedFile: dest, downloadedVersion: info.latestVersion, error: '' };
    saveConfig();
    sendUpdateStatus({ phase: 'downloaded', file: dest, info: config.updateInfo });
    return { ok: true, file: dest };
  } catch (e) {
    try { fs.rmSync(tmp, { force: true }); } catch {}
    config.updateInfo = { ...config.updateInfo, error: e.message };
    saveConfig();
    sendUpdateStatus({ phase: 'error', message: e.message });
    return { ok: false, reason: e.message };
  } finally {
    updateDownloading = false;
  }
}

// Launch the downloaded installer and quit so it can replace the files.
// silent = true runs the NSIS installer with /S (no UI); it relaunches Wallraven itself.
async function installUpdate(silent = false) {
  const file = config.updateInfo?.downloadedFile;
  if (!file || !fs.existsSync(file)) return { ok: false, reason: 'Installer not downloaded yet' };
  sendUpdateStatus({ phase: 'installing' });
  try {
    const child = spawn(file, silent ? ['/S'] : [], { detached: true, stdio: 'ignore', windowsHide: !!silent });
    child.unref();
  } catch (e) {
    sendUpdateStatus({ phase: 'error', message: e.message });
    return { ok: false, reason: e.message };
  }
  setTimeout(() => { app.isQuiting = true; app.quit(); }, 1200);
  return { ok: true };
}

// Silent update-on-launch: download the new installer, then install it and restart.
let autoUpdateRunning = false;
async function autoUpdateFlow() {
  if (autoUpdateRunning) return;
  autoUpdateRunning = true;
  try {
    const info = config.updateInfo || {};
    if (!info.downloadUrl) return;
    let file = info.downloadedFile;
    if (!file || !fs.existsSync(file) || info.downloadedVersion !== info.latestVersion) {
      const r = await downloadUpdate();
      if (!r || r.ok !== true) return;
      file = config.updateInfo.downloadedFile;
    }
    if (!file || !fs.existsSync(file)) return;
    if (Notification.isSupported()) {
      new Notification({
        title: `Updating WallRaven to v${info.latestVersion}`,
        body: 'Installing in the background — WallRaven will restart in a moment.',
        icon: ICON_PATH,
      }).show();
    }
    await installUpdate(true);
  } catch (e) {
    console.error('auto update', e);
  } finally {
    autoUpdateRunning = false;
  }
}




// ---------- Tray + Settings window ----------
function buildTrayImage() {
  const trayPath = fs.existsSync(TRAY_ICON_PATH) ? TRAY_ICON_PATH : ICON_PATH;
  const img = nativeImage.createFromPath(trayPath);
  return process.platform === 'darwin' ? img.resize({ width: 18, height: 18 }) : img.resize({ width: 16, height: 16 });
}

function updateTrayMenu() {
  if (!tray) return;
  const last = history.items[history.items.length - 1];
  const liked = last && (config.likes || []).includes(last.id);
  const disliked = last && (config.dislikes || []).includes(last.id);
  const activeRule = activeScheduleRule();
  const schedEnabled = !!(config.schedule && config.schedule.enabled);
  const updInfo = config.updateInfo || {};
  const hasUpdate = updInfo.latestVersion && compareVersions(updInfo.latestVersion, app.getVersion()) > 0;
  const items = [];
  if (hasUpdate) {
    items.push({ label: `⬇ Update available: v${updInfo.latestVersion}`, click: () => updInfo.url && shell.openExternal(updInfo.url) });
    items.push({ type: 'separator' });
  }
  items.push(
    { label: '◀ Back', enabled: navPos > 0, click: () => setPreviousWallpaper() },
    { label: isFetching ? 'Fetching…' : 'Forward ▶', enabled: !isFetching, click: () => { if (navPos >= 0 && navPos < history.items.length - 1) setNextWallpaper(); else fetchAndSetWallpaper(true); } },
    { type: 'separator' },
    { label: liked ? '★ Liked' : '♡ Like current', enabled: !!last && !liked, click: () => { likeCurrent(); updateTrayMenu(); notifyRenderer(); } },
    { label: disliked ? '✕ Disliked' : '👎 Dislike current (skip)', enabled: !!last && !disliked, click: () => { dislikeCurrent(); updateTrayMenu(); } },
    { label: 'Open current on Wallhaven', enabled: !!last, click: () => last && shell.openExternal(last.url) },
    { label: 'Show in folder', enabled: !!last, click: () => last && revealItem(last.file) },
    { type: 'separator' },
    { label: paused ? '▶ Resume cycling' : '⏸ Pause cycling', click: () => { paused = !paused; updateTrayMenu(); } },
    { label: `Schedule: ${schedEnabled ? (activeRule ? `active — ${activeRule.startHHMM} ${activeRule.sourceType}${activeRule.sourceRef ? ':' + activeRule.sourceRef : ''}` : 'on, no rule yet') : 'off'}`, enabled: false },
    { label: schedEnabled ? 'Disable schedule' : 'Enable schedule', enabled: !!(config.schedule?.rules?.length), click: () => {
        config.schedule = { ...(config.schedule || { rules: [] }), enabled: !schedEnabled };
        saveConfig(); startScheduleTicker(); scheduleCycle(); updateTrayMenu(); notifyRenderer();
      } },
    { label: 'Run on startup', type: 'checkbox', checked: !!config.autoStart, click: (item) => {
        config.autoStart = !!item.checked;
        saveConfig();
        applyAutoStart();
        if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.webContents.send('config-changed', config);
        updateTrayMenu();
      } },
    { label: 'Settings…', click: openSettings },
    { label: `Fit: ${config.fitMode || 'fill'}  ·  Cycle: ${effectiveCycleMinutes()} min${paused ? ' (paused)' : ''}`, enabled: false },
    { label: (() => { const s = cacheStats(); return `Cache: ${s.totalMB.toFixed(1)} / ${config.cacheMaxMB} MB (${s.pinnedMB.toFixed(1)} pinned)`; })(), enabled: false },
    { label: `Check for updates`, click: () => checkForUpdates(true).then(updateTrayMenu) },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuiting = true; app.quit(); } },
  );
  const menu = Menu.buildFromTemplate(items);
  tray.setToolTip('WallRaven' + (last ? ` - ${last.id}` : ''));
  tray.setContextMenu(menu);
}

function notifyRenderer() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('config-changed', config);
    settingsWindow.webContents.send('wallpaper-changed', currentInfo());
  }
}



function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) { settingsWindow.show(); settingsWindow.focus(); return; }
  settingsWindow = new BrowserWindow({
    width: 820, height: 760, title: 'WallRaven - Settings',
    icon: process.platform === 'win32' ? ICO_PATH : ICON_PATH,
    autoHideMenuBar: true,
    backgroundColor: '#0f1015',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
  settingsWindow.on('close', (e) => {
    if (!app.isQuiting) { e.preventDefault(); settingsWindow.hide(); }
  });
}

// ---------- IPC ----------
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('window:setOpacity', (e, v) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win && !win.isDestroyed()) {
    const n = Math.max(0, Math.min(1, Number(v) == null ? 1 : Number(v)));
    try { win.setOpacity(n); } catch {}
  }
  return true;
});
ipcMain.handle('config:get', () => config);
// Fields that change *what* we'd pick next; if any of them move, the images we
// already pre-downloaded no longer match the user's filters.
const SEARCH_AFFECTING = ['query','categories','purity','sorting','order','topRange','aiArtFilter',
  'atleastResolution','resolutions','ratios','colors','sourceMode','activePlaylist','collectionId','folderPaths'];
ipcMain.handle('config:set', (_e, next) => {
  const before = config;
  const patch = next && typeof next === 'object' ? next : {};
  const filtersMoved = SEARCH_AFFECTING.some(
    (k) => k in patch && JSON.stringify(patch[k]) !== JSON.stringify(before[k]),
  );
  config = { ...config, ...next };
  if (filtersMoved) { prefetched.length = 0; lastHealReason = null; }
  stampChangedSections(before, config);
  saveConfig();
  scheduleCycle();
  startScheduleTicker();
  applyAutoStart();
  try { registerHotkeys(); } catch {}
  updateTrayMenu();
  queueCloudPush();
  return config;
});
ipcMain.handle('wp:next', () => fetchAndSetWallpaper(true));
ipcMain.handle('wp:info', () => currentInfo());
ipcMain.handle('wp:back', async () => { await setPreviousWallpaper(); return currentInfo(); });
ipcMain.handle('wp:forward', async () => { await setNextWallpaper(); return currentInfo(); });
// Pause/resume automatic cycling from the settings window title bar.
ipcMain.handle('wp:setPaused', (_e, v) => {
  paused = typeof v === 'boolean' ? v : !paused;
  updateTrayMenu();
  notifyRenderer();
  return paused;
});

// ---------- v0.5.0: statistics + api-key validation ----------
ipcMain.handle('stats:get', () => {
  const s = config.stats || {};
  const st = cacheStats();
  let fileCount = 0;
  try { fileCount = fs.readdirSync(CACHE_DIR).filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase())).length; } catch {}
  // most-shown sources, sorted
  const sources = Object.entries(s.sources || {}).sort((a, b) => (b[1] - a[1])).slice(0, 3).map(([k, v]) => ({ source: k, count: v }));
  const totalRot = (Number(s.cacheHits) || 0) + (Number(s.downloads) || 0);
  return {
    shownTotal: Number(s.shownTotal) || 0,
    shownMonth: Number(s.shownMonth) || 0,
    cacheHits: Number(s.cacheHits) || 0,
    downloads: Number(s.downloads) || 0,
    fallbacks: Number(s.fallbacks) || 0,
    cacheHitRate: totalRot ? Math.round((Number(s.cacheHits) || 0) / totalRot * 100) : 0,
    fallbackRate: totalRot ? Math.round((Number(s.fallbacks) || 0) / totalRot * 100) : 0,
    likes: (config.likes || []).length,
    dislikes: (config.dislikes || []).length,
    cacheMB: st.totalMB,
    pinnedMB: st.pinnedMB,
    fileCount,
    sources,
    game: {
      plays: Number(config.gameStats && config.gameStats.plays) || 0,
      best: Number(config.gameStats && config.gameStats.best) || 0,
    },
  };
});
ipcMain.handle('game:record', (_e, score) => {
  const n = Math.max(0, Math.min(100000, Math.floor(Number(score) || 0)));
  const g = config.gameStats && typeof config.gameStats === 'object' ? config.gameStats : { plays: 0, best: 0 };
  const next = { plays: (Number(g.plays) || 0) + 1, best: Math.max(Number(g.best) || 0, n) };
  config.gameStats = next;
  persistConfigQuiet();
  return next;
});
ipcMain.handle('stats:reset', () => {
  config.stats = { shownTotal: 0, shownMonth: 0, shownMonthKey: '', cacheHits: 0, downloads: 0, fallbacks: 0, sources: {} };
  persistConfigQuiet();
  return config.stats;
});

// Validate a Wallhaven API key. The key to test is whatever is typed in the
// settings field (falling back to the saved one), so you don't have to Save first.
// Send feedback / bug reports / feature requests to the Wallraven site.
ipcMain.handle('feedback:send', async (_e, payload) => {
  const kind = ['bug', 'feature', 'feedback'].includes(payload && payload.kind) ? payload.kind : 'feedback';
  const message = String((payload && payload.message) || '').trim().slice(0, 4000);
  const email = String((payload && payload.email) || '').trim().slice(0, 255);
  if (message.length < 5) return { ok: false, reason: 'Message too short' };
  const body = JSON.stringify({
    kind, message, email: email || undefined,
    appVersion: app.getVersion(),
    platform: `${process.platform} ${process.arch}`,
  });
  const endpoints = ['https://wallraven.app/api/public/feedback', 'https://wallraven.lovable.app/api/public/feedback'];
  let lastErr = 'Could not reach the feedback service';
  for (const url of endpoints) {
    try {
      const res = await new Promise((resolve, reject) => {
        const req = https.request(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'User-Agent': 'Wallraven/1.0' },
        }, (r) => {
          let data = '';
          r.on('data', (d) => { data += d; });
          r.on('end', () => resolve({ status: r.statusCode, data }));
        });
        req.on('error', reject);
        req.setTimeout(10000, () => req.destroy(new Error('Timed out')));
        req.end(body);
      });
      if (res.status >= 200 && res.status < 300) return { ok: true };
      lastErr = `Server said ${res.status}`;
    } catch (e) { lastErr = e.message || String(e); }
  }
  return { ok: false, reason: lastErr };
});

ipcMain.handle('apikey:validate', async (_e, typed) => {
  const key = String(typed ?? config.apiKey ?? '').trim();
  if (!key) return { ok: false, reason: 'No API key entered' };
  if (!/^[A-Za-z0-9]{20,}$/.test(key)) {
    return { ok: false, reason: 'That does not look like a Wallhaven key (32 letters/numbers)' };
  }
  // Any authenticated endpoint proves the key: 200 = accepted, 401/403 = rejected.
  // The Wallhaven username field is NOT needed for this — none of these calls use it.
  const probes = [
    `https://wallhaven.cc/api/v1/settings?apikey=${encodeURIComponent(key)}`,
    `https://wallhaven.cc/api/v1/collections?apikey=${encodeURIComponent(key)}`,
    `https://wallhaven.cc/api/v1/search?apikey=${encodeURIComponent(key)}&purity=001&page=1`,
  ];
  let lastErr = null;
  for (const url of probes) {
    try {
      const data = await httpsGetJSON(url);
      // A 200 response of any shape means Wallhaven accepted the key.
      if (data && typeof data === 'object') {
        const uname = data.data && !Array.isArray(data.data) ? data.data.username || '' : '';
        return { ok: true, username: uname };
      }
    } catch (e) {
      if (e && (e.status === 401 || e.status === 403)) return { ok: false, reason: 'Wallhaven rejected this key' };
      if (e && e.status === 429) return { ok: false, reason: 'Wallhaven is rate-limiting — try again in a minute' };
      lastErr = e;
    }
  }
  return { ok: false, reason: (lastErr && lastErr.message) || 'Could not reach Wallhaven' };
});

ipcMain.handle('cache:clear', () => {
  const pinned = getPinnedFiles();
  for (const f of fs.readdirSync(CACHE_DIR)) {
    if (history.currentId && f.startsWith(history.currentId + '.')) continue;
    const p = path.join(CACHE_DIR, f);
    if (pinned.has(p)) continue; // never delete pinned playlist files
    try { fs.unlinkSync(p); } catch {}
  }
  invalidateCacheStats();
  return currentInfo();

});

// ---------- Cache location ----------
function cacheDirInfo() {
  let fileCount = 0, bytes = 0;
  try {
    for (const f of fs.readdirSync(CACHE_DIR)) {
      try { const s = fs.statSync(path.join(CACHE_DIR, f)); if (s.isFile()) { fileCount++; bytes += s.size; } } catch {}
    }
  } catch {}
  return {
    dir: CACHE_DIR,
    defaultDir: DEFAULT_CACHE_DIR,
    isDefault: CACHE_DIR === DEFAULT_CACHE_DIR,
    dataDir: DATA_DIR,
    fileCount,
    sizeMB: bytes / 1048576,
  };
}
ipcMain.handle('cache:info', () => cacheDirInfo());

// Open the cache folder itself. shell.showItemInFolder on a directory can
// make Explorer bounce to the parent/desktop, so open the folder directly.
ipcMain.handle('cache:openDir', async () => {
  try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch {}
  const err = await shell.openPath(CACHE_DIR);
  if (err) throw new Error(err);
  return CACHE_DIR;
});

ipcMain.handle('cache:pickDir', async () => {
  const res = await dialog.showOpenDialog(settingsWindow || undefined, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Choose a cache folder',
    defaultPath: CACHE_DIR,
  });
  if (res.canceled || !res.filePaths.length) return null;
  const dir = res.filePaths[0];
  let existing = 0;
  try { existing = fs.readdirSync(CACHE_DIR).length; } catch {}
  return { dir, movableFiles: existing };
});

// Relocate the cache. `move: true` transfers the existing files (rename when
// possible, copy+delete across volumes) and rewrites history/playlist paths so
// nothing is orphaned.
ipcMain.handle('cache:setDir', async (_e, { dir, move = false } = {}) => {
  const target = String(dir || '').trim();
  const resolved = target ? path.resolve(target) : DEFAULT_CACHE_DIR;
  const from = CACHE_DIR;
  try { fs.mkdirSync(resolved, { recursive: true }); fs.accessSync(resolved, fs.constants.W_OK); }
  catch { throw new Error('That folder is not writable'); }

  let moved = 0, failed = 0;
  if (move && resolved !== from) {
    let entries = [];
    try { entries = fs.readdirSync(from, { withFileTypes: true }); } catch {}
    for (const e of entries) {
      if (!e.isFile()) continue;
      const src = path.join(from, e.name);
      let dest = path.join(resolved, e.name);
      if (fs.existsSync(dest)) {
        const ext = path.extname(e.name);
        dest = path.join(resolved, `${path.basename(e.name, ext)}_1${ext}`);
      }
      try { fs.renameSync(src, dest); }
      catch {
        try { fs.copyFileSync(src, dest); fs.unlinkSync(src); } catch { failed++; continue; }
      }
      moved++;
      // Repoint anything that referenced the old path.
      for (const item of history.items) if (item.file === src) item.file = dest;
      for (const pl of Object.values(config.playlists || {})) {
        for (const it of pl.items || []) if (it.file === src) it.file = dest;
      }
    }
    saveHistory();
  }

  config.cacheDir = resolved === DEFAULT_CACHE_DIR ? '' : resolved;
  applyCacheDir();
  invalidateCacheStats();
  saveConfig();

  notifyRenderer();
  return { ...cacheDirInfo(), moved, failed, movedFrom: from };
});

// ---------- Local folder rotation ----------
// Scan the configured folders (cached briefly so a 10k-image library isn't
// re-walked on every rotation).
let folderScanCache = { key: '', at: 0, files: [] };
function localFolderFiles(force = false) {
  const paths = (config.folderPaths || []).filter(Boolean);
  const key = JSON.stringify([paths, !!config.folderRecursive]);
  if (!force && folderScanCache.key === key && Date.now() - folderScanCache.at < 60000) {
    return folderScanCache.files;
  }
  const seen = new Set();
  const files = [];
  for (const dir of paths) {
    if (!fs.existsSync(dir)) continue;
    const found = config.folderRecursive
      ? scanFolderImages(dir)
      : (() => {
          let out = [];
          try {
            out = fs.readdirSync(dir, { withFileTypes: true })
              .filter((e) => e.isFile() && IMAGE_EXTS.has(path.extname(e.name).toLowerCase()))
              .map((e) => path.join(dir, e.name));
          } catch {}
          return out;
        })();
    for (const f of found) if (!seen.has(f)) { seen.add(f); files.push(f); }
  }
  files.sort();
  folderScanCache = { key, at: Date.now(), files };
  return files;
}
ipcMain.handle('folder:sources', (_e, { rescan = false } = {}) => {
  const files = localFolderFiles(!!rescan);
  return {
    paths: config.folderPaths || [],
    recursive: !!config.folderRecursive,
    order: config.folderOrder || 'random',
    count: files.length,
  };
});
ipcMain.handle('folder:addSource', async () => {
  const res = await dialog.showOpenDialog(settingsWindow || undefined, {
    properties: ['openDirectory', 'multiSelections'],
    title: 'Add wallpaper folder',
  });
  if (res.canceled || !res.filePaths.length) return null;
  const list = (config.folderPaths || []).slice();
  for (const p of res.filePaths) if (!list.includes(p)) list.push(p);
  config.folderPaths = list;
  saveConfig();
  const files = localFolderFiles(true);
  return { paths: list, count: files.length };
});
ipcMain.handle('folder:removeSource', (_e, { folderPath } = {}) => {
  config.folderPaths = (config.folderPaths || []).filter((p) => p !== folderPath);
  saveConfig();
  const files = localFolderFiles(true);
  return { paths: config.folderPaths, count: files.length };
});



// ---------- Static browse (search results without cycling) ----------
ipcMain.handle('search:run', async (_e, { page = 1 } = {}) => {
  // Split on top-level commas → run one request per OR-group and union
  // results (dedupe by id). Preserves Wallhaven's `+`/space AND syntax
  // within each group. Single group behaves exactly like before.
  const groups = splitQueryGroups(config.query);
  if (groups.length <= 1) {
    const url = buildSearchUrl({}, page, groups[0] || '');
    const data = await httpsGetJSON(url);
    return { items: (data && data.data) || [], meta: (data && data.meta) || {} };
  }
  const seen = new Set();
  const items = [];
  let meta = {};
  for (const g of groups) {
    try {
      const data = await httpsGetJSON(buildSearchUrl({}, page, g));
      meta = (data && data.meta) || meta;
      for (const w of (data && data.data) || []) {
        if (!seen.has(w.id)) { seen.add(w.id); items.push(w); }
      }
    } catch { /* skip failed group */ }
  }
  // Interleave shuffle so no single group dominates the top of the grid.
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return { items, meta };
});
// Download a specific wallpaper (from browse grid) and set it as wallpaper.
// Pauses cycling to feel like "static mode".
ipcMain.handle('wp:setFromRemote', async (_e, w) => {
  if (!w || !w.id || !w.path) throw new Error('Bad wallpaper');
  const ext = w.file_type && w.file_type.includes('png') ? 'png' : 'jpg';
  const dest = path.join(CACHE_DIR, `${w.id}.${ext}`);
  if (!fs.existsSync(dest)) {
    try { await downloadFile(w.path, dest); }
    catch { await new Promise(r => setTimeout(r, 1500)); await downloadFile(w.path, dest); }
  }
  await setWindowsWallpaper(dest);
  history.items.push({ id: w.id, url: w.url, file: dest, ts: Date.now(), resolution: w.resolution });
  history.currentId = w.id;
  if (history.items.length > 200) history.items = history.items.slice(-200);
  saveHistory();
  paused = true; // static pick pauses cycling
  pruneCache();
  updateTrayMenu();
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.webContents.send('wallpaper-changed', currentInfo());
  return currentInfo();
});

// ---------- Playlists (local, pinned in cache) ----------
function ensurePlaylist(name) {
  if (!config.playlists) config.playlists = {};
  if (!config.playlists[name]) config.playlists[name] = { items: [], createdAt: Date.now() };
  return config.playlists[name];
}
ipcMain.handle('playlist:list', () => ({
  playlists: config.playlists || {},
  active: config.activePlaylist || '',
  index: config.playlistIndex || 0,
}));
ipcMain.handle('playlist:create', (_e, { name }) => {
  name = (name || '').trim();
  if (!name) throw new Error('Name required');
  if (config.playlists?.[name]) throw new Error('Playlist already exists');
  ensurePlaylist(name); saveConfig();
  return config.playlists;
});
ipcMain.handle('playlist:delete', (_e, { name }) => {
  if (!config.playlists?.[name]) return config.playlists || {};
  delete config.playlists[name];
  if (config.activePlaylist === name) { config.activePlaylist = ''; config.playlistIndex = 0; }
  saveConfig(); pruneCache();
  return config.playlists;
});
ipcMain.handle('playlist:rename', (_e, { from, to }) => {
  to = (to || '').trim();
  if (!to || !config.playlists?.[from]) throw new Error('Invalid rename');
  if (config.playlists[to]) throw new Error('Target name exists');
  config.playlists[to] = config.playlists[from];
  delete config.playlists[from];
  if (config.activePlaylist === from) config.activePlaylist = to;
  saveConfig();
  return config.playlists;
});
ipcMain.handle('playlist:addItem', (_e, { name, item }) => {
  const pl = ensurePlaylist(name);
  if (!item || !item.id || !item.file) throw new Error('Bad item');
  if (pl.items.some(i => i.id === item.id)) return config.playlists; // dedupe
  pl.items.push({
    id: item.id, url: item.url, file: item.file,
    thumb: item.thumb || '', resolution: item.resolution || '',
    file_type: item.file_type || '',
  });
  saveConfig();
  return config.playlists;
});
ipcMain.handle('playlist:removeItem', (_e, { name, id }) => {
  const pl = config.playlists?.[name]; if (!pl) return config.playlists || {};
  pl.items = pl.items.filter(i => i.id !== id);
  saveConfig(); pruneCache();
  return config.playlists;
});
ipcMain.handle('playlist:reorder', (_e, { name, ids }) => {
  const pl = config.playlists?.[name]; if (!pl) return config.playlists || {};
  const map = new Map(pl.items.map(i => [i.id, i]));
  pl.items = ids.map(id => map.get(id)).filter(Boolean).concat(pl.items.filter(i => !ids.includes(i.id)));
  saveConfig();
  return config.playlists;
});
ipcMain.handle('playlist:setActive', (_e, { name }) => {
  config.activePlaylist = name || '';
  config.playlistIndex = 0;
  saveConfig();
  return { active: config.activePlaylist, index: config.playlistIndex };
});
ipcMain.handle('history:get', () => history.items.slice().reverse());
ipcMain.handle('history:setFromFile', async (_e, { file, id, url, resolution }) => {
  if (!file || !fs.existsSync(file)) throw new Error('File missing from cache');
  await setWindowsWallpaper(file);
  history.items.push({ id, url, file, ts: Date.now(), resolution });
  history.currentId = id;
  if (history.items.length > 200) history.items = history.items.slice(-200);
  navPos = history.items.length - 1;
  saveHistory();
  updateTrayMenu();
  return currentInfo();
});
ipcMain.handle('history:remove', (_e, { id }) => {
  const idx = history.items.findIndex((i) => i.id === id);
  if (idx >= 0) {
    const [item] = history.items.splice(idx, 1);
    // Only delete file if no other history entry references it and it's not current
    const stillReferenced = history.items.some((i) => i.file === item.file);
    if (!stillReferenced && history.currentId !== item.id) {
      try { fs.unlinkSync(item.file); } catch {}
    }
    saveHistory();
  }
  return history.items.slice().reverse();
});

// ---------- Wallhaven account: collections / favorites ----------
ipcMain.handle('wh:collections', async (_e, { username } = {}) => {
  if (!config.apiKey) throw new Error('API key required');
  const user = (username || '').trim();
  // /collections returns the authed user's own collections (public + private)
  const url = user
    ? `https://wallhaven.cc/api/v1/collections/${encodeURIComponent(user)}?apikey=${encodeURIComponent(config.apiKey)}`
    : `https://wallhaven.cc/api/v1/collections?apikey=${encodeURIComponent(config.apiKey)}`;
  const data = await httpsGetJSON(url);
  return (data && data.data) || [];
});
ipcMain.handle('wh:collectionItems', async (_e, { username, id, page = 1 } = {}) => {
  if (!config.apiKey) throw new Error('API key required');
  if (!username || !id) throw new Error('Username and collection id required');
  const url = `https://wallhaven.cc/api/v1/collections/${encodeURIComponent(username)}/${id}?apikey=${encodeURIComponent(config.apiKey)}&page=${page}`;
  return await httpsGetJSON(url);
});
// Only ever hand http(s) links to the OS. Passing arbitrary schemes
// (file:, custom protocol handlers) to shell.openExternal is a known
// remote-code-execution route.
function openExternalSafe(target) {
  try {
    const parsed = new URL(String(target || ''));
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { ok: false, reason: 'blocked-scheme' };
    shell.openExternal(parsed.toString());
    return { ok: true };
  } catch {
    return { ok: false, reason: 'invalid-url' };
  }
}

// Best-effort "favorite" - the public Wallhaven API has no documented endpoint
// to add a wallpaper to a collection, so we open the wallpaper page where the
// user can click the heart while signed in.
ipcMain.handle('wh:openFavorite', (_e, { url } = {}) => {
  openExternalSafe(url);
});


// ---------- Popular tags scraper ----------
function httpsGetText(url, depth = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 WallhavenTray/1.0' } }, (res) => {
      const loc = res.headers && res.headers.location;
      if (res.statusCode >= 300 && res.statusCode < 400 && loc && depth < 5) {
        res.resume();
        return httpsGetText(new URL(loc, url).toString(), depth + 1).then(resolve, reject);
      }
      let data = '';
      res.on('data', (c) => {
        data += c;
        if (data.length > 1024 * 1024) res.destroy(new Error('Response too large'));
      });
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}`));
        resolve(data);
      });
    }).on('error', reject);
  });
}
const tagsCache = new Map();
ipcMain.handle('tags:fetch', async (_e, { page = 1, purity = 'sfw' } = {}) => {
  const key = `${purity}:${page}`;
  const cached = tagsCache.get(key);
  if (cached && Date.now() - cached.ts < 30 * 60 * 1000) return cached;
  const purityMask = { sfw: 100, sketchy: 110, nsfw: 111, all: 111 }[purity] || 100;
  const url = `https://wallhaven.cc/tags/tagged?purity=${purityMask}&page=${page}`;
  const html = await httpsGetText(url);
  const items = [];
  const re = /class="taglist-name"[^>]*>\s*<a\s+class="(sfw|sketchy|nsfw)"\s+href="[^"]*\/tag\/(\d+)"[^>]*>([^<]+)<\/a>/g;
  let m;
  while ((m = re.exec(html))) {
    items.push({ purity: m[1], id: Number(m[2]), name: m[3].trim() });
  }
  const lastPageMatch = html.match(/href="[^"]*page=(\d+)"[^>]*>\s*(?:Last|»)/i);
  const lastPage = lastPageMatch ? Number(lastPageMatch[1]) : (items.length >= 32 ? page + 1 : page);
  const result = { ts: Date.now(), items, page, lastPage };
  // Bound the cache so repeated page requests can't grow it forever.
  if (tagsCache.size >= 100) {
    const oldest = tagsCache.keys().next().value;
    if (oldest !== undefined) tagsCache.delete(oldest);
  }
  tagsCache.set(key, result);
  return result;
});
ipcMain.handle('open:external', (_e, url) => openExternalSafe(url));

// Reveal a file in the OS file manager.
// shell.showItemInFolder is unreliable on Windows when the path has forward
// slashes, is relative, or no longer exists — Explorer then opens the default
// location (the desktop). Normalise first, and on Windows drive Explorer
// directly with /select so the file is highlighted. If the file is gone, fall
// back to opening its containing folder.
function revealItem(target) {
  if (!target) return { ok: false, reason: 'no-path' };
  const file = path.resolve(String(target));
  const dir = path.dirname(file);
  const exists = fs.existsSync(file);
  if (!exists) {
    if (fs.existsSync(dir)) { shell.openPath(dir); return { ok: true, revealed: 'folder', dir }; }
    return { ok: false, reason: 'missing' };
  }
  if (process.platform === 'win32') {
    try {
      // A path containing a double quote would break out of the quoted
      // argument, so refuse those and let Electron handle the reveal.
      if (file.includes('"')) { shell.showItemInFolder(file); return { ok: true, revealed: 'file', file }; }
      const child = spawn('explorer.exe', [`/select,"${file}"`], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true });
      child.unref();
      return { ok: true, revealed: 'file', file };
    } catch {}
  }
  shell.showItemInFolder(file);
  return { ok: true, revealed: 'file', file };
}

ipcMain.handle('show:inFolder', (_e, file) => revealItem(file));


// ---------- v0.2.0 IPC: likes, dislikes, schedule, updater ----------
ipcMain.handle('wp:like', () => { const r = likeCurrent(); updateTrayMenu(); notifyRenderer(); return r; });
ipcMain.handle('wp:likeItem', (_e, item) => {
  const r = toggleLikeItem(item || {});
  notifyRenderer();
  return r;
});
ipcMain.handle('wp:setReaction', (_e, { item, state } = {}) => setWallpaperReaction(item, state));
ipcMain.handle('wp:likes', () => (config.likes || []).slice());
ipcMain.handle('wp:dislike', () => { const r = dislikeCurrent(); updateTrayMenu(); return r; });
ipcMain.handle('wp:clearDislikes', () => { config.dislikes = []; saveConfig(); return config.dislikes; });
ipcMain.handle('schedule:preview', () => {
  const rule = activeScheduleRule();
  return { activeRuleId: rule ? rule.id : null, effectiveIntervalMin: effectiveCycleMinutes(), enabled: !!(config.schedule && config.schedule.enabled) };
});
ipcMain.handle('update:check', () => checkForUpdates(true));
ipcMain.handle('update:dismiss', (_e, version) => {
  config.updateInfo = { ...(config.updateInfo || {}), dismissed: version || '' };
  saveConfig(); updateTrayMenu(); return config.updateInfo;
});
ipcMain.handle('update:download', () => downloadUpdate());
ipcMain.handle('update:install', () => installUpdate());
ipcMain.handle('update:info', () => ({ current: app.getVersion(), info: config.updateInfo || {} }));

// Prefer the changelog shipped with the build. Some older staging scripts
// omitted Markdown files, so fall back to the published copy rather than
// leaving Updates empty.
ipcMain.handle('app:changelog', async () => {
  const bundledPaths = [
    path.join(__dirname, 'CHANGELOG.md'),
    path.join(app.getAppPath(), 'electron', 'CHANGELOG.md'),
    path.join(process.resourcesPath, 'app', 'electron', 'CHANGELOG.md'),
  ];
  for (const file of [...new Set(bundledPaths)]) {
    try {
      const changelog = fs.readFileSync(file, 'utf8').trim();
      if (changelog) return changelog;
    } catch {}
  }
  const urls = [
    'https://wallraven.app/updates/changelog.md',
    'https://wallraven.lovable.app/updates/changelog.md',
  ];
  for (const url of urls) {
    try {
      const changelog = (await httpsGetText(`${url}?t=${Date.now()}`)).trim();
      if (changelog) return changelog;
    } catch {}
  }
  const notes = String(config.updateInfo?.notes || '').trim();
  if (notes) return `# WallRaven changelog\n\n## v${config.updateInfo.latestVersion || app.getVersion()}\n${notes}`;
  return '# WallRaven changelog\n\nThe release notes could not be loaded. Check your connection and try Reload.';
});

// Foreground-window probe: powers "Add the app I'm running now" in Settings.
ipcMain.handle('fullscreen:probe', async () => {
  const info = await probeForegroundWindow();
  return { ...info, wouldPause: !!(await shouldDeferForFullscreen()) };
});

// Cache cleanup test: dry-run the pruner (showing exactly which oldest files
// would go), then optionally apply it for real.
ipcMain.handle('cache:test', async (_e, { apply = false, limitMB = null } = {}) => {
  const plan = pruneCache({ dryRun: true, limitMB });
  if (!apply) return { applied: false, plan };
  const result = pruneCache({ dryRun: false, limitMB });
  const stats = cacheStats();
  updateTrayMenu();
  notifyRenderer();
  return { applied: true, plan, result, stats };
});


// ---------- Pass 2 IPC: portable, folder libs, export, tags, hotkeys, monitors ----------
ipcMain.handle('app:portable', () => ({ portable: IS_PORTABLE, dataDir: DATA_DIR }));

ipcMain.handle('folder:pick', async () => {
  const res = await dialog.showOpenDialog(settingsWindow || undefined, {
    properties: ['openDirectory'],
    title: 'Choose a folder',
  });
  if (res.canceled || !res.filePaths.length) return null;
  return res.filePaths[0];
});

// Import a folder as a playlist: each image file becomes a pinned playlist item
// pointing at its ORIGINAL location (no copy). Files outside CACHE_DIR are
// implicitly safe from pruning since the pruner only walks CACHE_DIR.
ipcMain.handle('folder:importAsPlaylist', (_e, { folderPath, playlistName }) => {
  if (!folderPath || !fs.existsSync(folderPath)) throw new Error('Folder not found');
  const name = (playlistName || path.basename(folderPath)).trim();
  if (!name) throw new Error('Playlist name required');
  const pl = ensurePlaylist(name);
  const files = scanFolderImages(folderPath);
  let added = 0;
  for (const f of files) {
    const id = 'local:' + Buffer.from(f).toString('base64').slice(0, 24);
    if (pl.items.some(i => i.file === f || i.id === id)) continue;
    pl.items.push({
      id, url: '', file: f, thumb: '',
      resolution: '', file_type: path.extname(f).slice(1),
      local: true, tags: [],
    });
    added++;
  }
  saveConfig();
  return { name, added, total: pl.items.length };
});

// Bulk export a playlist to a chosen folder (copies files).
ipcMain.handle('playlist:export', async (_e, { name }) => {
  const pl = config.playlists?.[name];
  if (!pl || !pl.items.length) throw new Error('Playlist is empty');
  const res = await dialog.showOpenDialog(settingsWindow || undefined, {
    properties: ['openDirectory', 'createDirectory'],
    title: `Export "${name}" to folder`,
  });
  if (res.canceled || !res.filePaths.length) return { canceled: true };
  const dest = res.filePaths[0];
  let copied = 0, skipped = 0;
  for (const it of pl.items) {
    if (!it.file || !fs.existsSync(it.file)) { skipped++; continue; }
    const base = path.basename(it.file);
    let target = path.join(dest, base);
    let n = 1;
    while (fs.existsSync(target)) {
      const ext = path.extname(base);
      target = path.join(dest, path.basename(base, ext) + `_${n++}` + ext);
    }
    try { fs.copyFileSync(it.file, target); copied++; } catch { skipped++; }
  }
  return { canceled: false, copied, skipped, folder: dest };
});

ipcMain.handle('playlist:setItemTags', (_e, { name, id, tags }) => {
  const pl = config.playlists?.[name]; if (!pl) throw new Error('Playlist not found');
  const it = pl.items.find(i => String(i.id) === String(id)); if (!it) throw new Error('Item not found');
  it.tags = Array.isArray(tags) ? tags.map(t => String(t).trim()).filter(Boolean) : [];
  saveConfig();
  return it.tags;
});

ipcMain.handle('playlist:setTagFilter', (_e, { name, filter }) => {
  if (!config.playlistTagFilters) config.playlistTagFilters = {};
  config.playlistTagFilters[name] = String(filter || '');
  saveConfig();
  return config.playlistTagFilters[name];
});

// ---------- Global hotkeys ----------
async function pickRandomFavorite() {
  const liked = config.playlists?.['Liked']?.items || [];
  const pool = liked.filter(it => it && it.file && fs.existsSync(it.file));
  if (!pool.length) {
    if (Notification.isSupported()) new Notification({ title: 'WallRaven', body: 'Liked playlist is empty', icon: ICON_PATH }).show();
    return;
  }
  const pick = pool[Math.floor(Math.random() * pool.length)];
  try {
    await applyWallpaper(pick.file, pick);
    history.items.push({ id: pick.id, url: pick.url, file: pick.file, ts: Date.now(), resolution: pick.resolution });
    history.currentId = pick.id;
    if (history.items.length > 200) history.items = history.items.slice(-200);
    saveHistory();
    notifyRenderer();
    updateTrayMenu();
  } catch (e) { console.error('random-fav', e); }
}
function registerHotkeys() {
  try { globalShortcut.unregisterAll(); } catch {}
  if (!config.hotkeysEnabled) return { ok: true, registered: [] };
  const bindings = {
    next:          () => fetchAndSetWallpaper(true),
    like:          () => { likeCurrent(); updateTrayMenu(); notifyRenderer(); },
    dislike:       () => { dislikeCurrent(); updateTrayMenu(); },
    pauseSchedule: () => { paused = !paused; updateTrayMenu(); notifyRenderer(); },
    randomFav:     () => pickRandomFavorite(),
    back:          () => setPreviousWallpaper(),
    forward:       () => setNextWallpaper(),
  };
  const registered = [];
  const failed = [];
  for (const [key, fn] of Object.entries(bindings)) {
    const accel = config.hotkeys?.[key];
    if (!accel) continue;
    try {
      const ok = globalShortcut.register(accel, fn);
      if (ok) registered.push({ key, accel }); else failed.push({ key, accel });
    } catch (e) { failed.push({ key, accel, error: e.message }); }
  }
  return { ok: true, registered, failed };
}
ipcMain.handle('hotkeys:reregister', () => registerHotkeys());

function applyAutoStart() {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return;
  try {
    // Portable/zip installs move around, so re-register with the current exe
    // path every time. Without an explicit `path`, Electron sometimes registers
    // an updater stub or a stale location that no longer exists.
    const opts = {
      openAtLogin: !!config.autoStart,
      openAsHidden: !!config.startMinimized,
      path: process.execPath,
      args: config.startMinimized ? ['--hidden'] : [],
    };
    app.setLoginItemSettings(opts);
  } catch (e) { console.error('autostart', e); }
}

// ---------- v0.4.0: cloud account + sync ----------
let pushTimer = null;
let pairPollTimer = null;

function sectionOfKey(key) {
  for (const [name, keys] of Object.entries(cloud.SECTIONS)) {
    if (keys.includes(key)) return name;
  }
  return null;
}

function stampChangedSections(before, after) {
  const stamps = { ...(after._syncStamps || {}) };
  const now = Date.now();
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (key.startsWith('_') || key === 'lastSyncedAt') continue;
    if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
    const section = sectionOfKey(key);
    if (section) stamps[section] = now;
  }
  config._syncStamps = stamps;
}

function touchSection(name) {
  config._syncStamps = { ...(config._syncStamps || {}), [name]: Date.now() };
}

function notifySettings(kind, payload) {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send(kind, payload);
  }
}

function queueCloudPush() {
  if (!config.cloudSyncEnabled) return;
  if (!cloud.status().signedIn) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    try {
      const res = await cloud.push(config);
      if (res.ok) {
        config.lastSyncedAt = res.at;
        persistConfigQuiet();
        notifySettings('sync-status', { ok: true, at: res.at });
      } else if (res.reason !== 'signed_out') {
        notifySettings('sync-status', { ok: false, error: 'Could not upload your settings.' });
      }
    } catch (e) {
      notifySettings('sync-status', { ok: false, error: 'Sync failed: ' + e.message });
    }
  }, 4000);
}

async function cloudPull({ force = false } = {}) {
  const res = await cloud.pull(config, { force });
  if (!res.ok) return res;
  if (res.changed && res.patch) {
    config = { ...config, ...res.patch };
    lastSavedConfig = JSON.parse(JSON.stringify(config));
    persistConfigQuiet();
    scheduleCycle();
    startScheduleTicker();
    try { registerHotkeys(); } catch {}
    updateTrayMenu();
    notifySettings('config-changed', config);
  }
  config.lastSyncedAt = res.at;
  persistConfigQuiet();
  return res;
}

ipcMain.handle('account:status', () => ({
  ...cloud.status(),
  cloudSyncEnabled: !!config.cloudSyncEnabled,
  lastSyncedAt: config.lastSyncedAt || 0,
}));

ipcMain.handle('account:getUsername', async () => {
  try { return await cloud.getUsername(); }
  catch (e) { console.error('account:getUsername', e); return { ok: false, reason: 'read_failed', username: null }; }
});

ipcMain.handle('account:setUsername', async (_e, { name } = {}) => {
  try { return await cloud.setUsername(name || ''); }
  catch (e) { console.error('account:setUsername', e); return { ok: false, reason: 'write_failed' }; }
});

ipcMain.handle('account:checkUsername', async (_e, { name } = {}) => {
  try { return await cloud.isUsernameAvailable(name || ''); }
  catch (e) { console.error('account:checkUsername', e); return { ok: false, reason: 'read_failed' }; }
});

ipcMain.handle('account:signIn', async () => {
  const os = require('os');
  const started = await cloud.startSignIn(`WallRaven on ${os.hostname()}`);
  clearInterval(pairPollTimer);
  pairPollTimer = setInterval(async () => {
    try {
      const res = await cloud.pollSignIn();
      if (res.status === 'signed_in') {
        clearInterval(pairPollTimer);
        try { await cloud.getUsername(); } catch {}
        await cloudPull({ force: false });
        notifySettings('account-changed', {
          ...cloud.status(),
          cloudSyncEnabled: !!config.cloudSyncEnabled,
          lastSyncedAt: config.lastSyncedAt || 0,
        });
      } else if (res.status === 'expired' || res.status === 'idle') {
        clearInterval(pairPollTimer);
        notifySettings('sync-status', { ok: false, error: 'Sign-in timed out. Try again.' });
      }
    } catch {}
  }, 2500);
  return started;
});

ipcMain.handle('account:cancelSignIn', () => {
  clearInterval(pairPollTimer);
  cloud.cancelSignIn();
  return cloud.status();
});

ipcMain.handle('account:signOut', async () => {
  clearInterval(pairPollTimer);
  clearTimeout(pushTimer);
  await cloud.signOut();
  return cloud.status();
});

ipcMain.handle('account:openWeb', async (_e, p) => {
  const safe = typeof p === 'string' && p.startsWith('/') ? p : '/account';
  await shell.openExternal('https://wallraven.lovable.app' + safe);
  return true;
});

ipcMain.handle('sync:push', async (_e, { force = false } = {}) => {
  clearTimeout(pushTimer);
  const res = await cloud.push(config, { force });
  if (res.ok) { config.lastSyncedAt = res.at; persistConfigQuiet(); }
  return res;
});

ipcMain.handle('sync:pull', async (_e, { force = false } = {}) => cloudPull({ force }));

// ---------- v0.6.0 IPC: built-in library + community presets ----------
ipcMain.handle('presets:builtins', () => cloud.loadBuiltinPresets());

ipcMain.handle('presets:browse', async (_e, opts = {}) => {
  try {
    return await cloud.browseCommunityPresets(opts || {});
  } catch (e) {
    console.error('presets:browse', e);
    return { ok: false, items: [] };
  }
});

ipcMain.handle('presets:publish', async (_e, opts = {}) => {
  try {
    return await cloud.publishCommunityPreset(opts || {});
  } catch (e) {
    console.error('presets:publish', e);
    return { ok: false, reason: 'write_failed' };
  }
});

// Gallery thumbnail: run the preset's first search group against Wallhaven
// and hand back the small preview. Cached on disk so the gallery only ever
// costs API calls once, and routed through the shared Wallhaven gate at low
// priority so it can never delay or 429 an actual wallpaper change.
const THUMB_CACHE_PATH = path.join(DATA_DIR, 'thumb-cache.json');
const THUMB_CACHE = new Map();
try {
  const raw = JSON.parse(fs.readFileSync(THUMB_CACHE_PATH, 'utf8'));
  for (const [k, v] of Object.entries(raw || {})) if (typeof v === 'string') THUMB_CACHE.set(k, v);
} catch {}
let thumbSaveTimer = null;
function saveThumbCache() {
  clearTimeout(thumbSaveTimer);
  thumbSaveTimer = setTimeout(() => {
    try { fs.writeFileSync(THUMB_CACHE_PATH, JSON.stringify(Object.fromEntries(THUMB_CACHE))); } catch {}
  }, 1500);
}

ipcMain.handle('presets:thumb', async (_e, { query, categories, purity, sorting } = {}) => {
  const toBits = (v, fallback) => {
    if (/^[01]{3}$/.test(String(v || '')) && v !== '000') return String(v);
    if (v && typeof v === 'object') {
      const keys = 'general' in v || 'anime' in v ? ['general', 'anime', 'people'] : ['sfw', 'sketchy', 'nsfw'];
      const bits = keys.map(k => (v[k] ? 1 : 0)).join('');
      if (bits !== '000') return bits;
    }
    return fallback;
  };
  const q = splitQueryGroups(query)[0] || '';
  const cat = toBits(categories, '111');
  const pur = toBits(purity, '100');
  const sort = ['toplist', 'relevance', 'random', 'date_added', 'views', 'favorites'].includes(sorting) ? sorting : 'toplist';
  const key = `${q}|${cat}|${pur}|${sort}`;
  const cached = THUMB_CACHE.get(key);
  if (cached) return { url: cached };
  const params = new URLSearchParams({ categories: cat, purity: pur, sorting: sort, page: '1' });
  if (q) params.set('q', q);
  if (sort === 'toplist') params.set('topRange', '1y');
  if (config.apiKey) params.set('apikey', config.apiKey);
  const url = await httpsGetJSON(`https://wallhaven.cc/api/v1/search?${params.toString()}`, { priority: false })
    .then(body => {
      const item = body && body.data && body.data[0];
      return (item && item.thumbs && (item.thumbs.small || item.thumbs.original)) || null;
    })
    .catch(() => null);
  if (url) {
    THUMB_CACHE.set(key, url);
    // Bounded LRU-ish: drop oldest entries so the map can't grow forever.
    while (THUMB_CACHE.size > 500) THUMB_CACHE.delete(THUMB_CACHE.keys().next().value);
    saveThumbCache();
  }

  return { url };
});



ipcMain.handle('presets:rename-author', async (_e, { name } = {}) => {
  try { return await cloud.renameCommunityAuthor(name || ''); }
  catch (e) { console.error('presets:rename-author', e); return { ok: false, reason: 'write_failed' }; }
});

ipcMain.handle('presets:unpublish', async (_e, { id } = {}) => {
  if (!id) return { ok: false };
  try { return await cloud.deleteCommunityPreset(id); } catch { return { ok: false }; }
});

ipcMain.handle('presets:like', async (_e, { id, liked } = {}) => {
  if (!id) return { ok: false };
  try { return await cloud.likeCommunityPreset(id, !!liked); } catch { return { ok: false }; }
});

ipcMain.handle('presets:copied', async (_e, { id } = {}) => {
  if (!id) return { ok: false };
  try { return await cloud.markCommunityPresetCopied(id); } catch { return { ok: false }; }
});

ipcMain.handle('presets:shareable', () => cloud.sanitizeShared(config));




// ---------- App lifecycle ----------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
else {
  app.on('second-instance', (_e, argv) => {
    openSettings();
  });
  app.whenReady().then(async () => {
    try { app.setName('WallRaven'); } catch {}
    tray = new Tray(buildTrayImage());
    tray.on('click', () => openSettings());
    tray.on('double-click', () => fetchAndSetWallpaper(true));
    updateTrayMenu();
    scheduleCycle();
    startScheduleTicker();
    applyAutoStart();
    registerHotkeys();
    // Kick an update check on startup, then every 6h.
    // Always check on launch (Teams-style), then every 6 hours.
    setTimeout(() => checkForUpdates(true), 3000);
    setInterval(() => checkForUpdates(false), 6 * 60 * 60 * 1000);

    const startedHidden = process.argv.includes('--hidden');
    if (!startedHidden) openSettings();
    // Initial fetch if no wallpaper yet
    if (!history.items.length) fetchAndSetWallpaper(false);
    // Pull cloud profile on start (and every 15 min) when signed in.
    if (config.cloudSyncEnabled && cloud.status().signedIn) {
      setTimeout(() => cloudPull({ force: false }).catch(() => {}), 2000);
      setInterval(() => {
        if (config.cloudSyncEnabled && cloud.status().signedIn) cloudPull({ force: false }).catch(() => {});
      }, 15 * 60 * 1000);
    }
  });
  app.on('will-quit', () => { try { globalShortcut.unregisterAll(); } catch {} });
  app.on('window-all-closed', (e) => { e.preventDefault(); });
}



