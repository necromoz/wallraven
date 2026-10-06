// The settings window's own code.
//
// Split out of settings.html. It runs in the renderer with contextIsolation on,
// so everything it can reach in the main process comes through `api`, which
// preload.cjs puts on window. No modules, no bundler: this file is loaded
// directly by settings.html and its top-level functions are global on purpose,
// which is also how the tests reach them.
const PALETTE = [
  "660000",
  "990000",
  "cc0000",
  "cc3333",
  "ea4c88",
  "993399",
  "663399",
  "333399",
  "0066cc",
  "0099cc",
  "66cccc",
  "77cc33",
  "669900",
  "336600",
  "666600",
  "999900",
  "cccc33",
  "ffff00",
  "ffcc33",
  "ff9900",
  "ff6600",
  "cc6633",
  "996633",
  "663300",
  "000000",
  "999999",
  "cccccc",
  "ffffff",
  "424153",
];

/* ---------------------------------------------------------------------------
   Information architecture (v0.8.0)

   Six destinations, each answering one question:
     home     what's on my desktop right now
     browse   find something new
     library  the pictures I already have
     presets  setups I reuse
     schedule make it change on its own
     settings change how the app works

   Every card keeps its existing template and wiring; `page` decides where it
   is shown, and `sec` gives a page its sub-navigation tabs.
--------------------------------------------------------------------------- */
const PAGES = [
  { id: "home", label: "Home", icon: "🏠", desc: "What's on your desktop right now." },
  { id: "browse", label: "Browse", icon: "🖼", desc: "Search Wallhaven and pick something new." },
  {
    id: "library",
    label: "Library",
    icon: "📚",
    desc: "Everything you already have: recent, favourites, your own pictures.",
    tabs: [
      { id: "all", label: "All" },
      { id: "favourites", label: "Favourites" },
      { id: "history", label: "History" },
      { id: "local", label: "On this PC" },
      { id: "playlists", label: "Playlists" },
    ],
  },
  {
    id: "presets",
    label: "Presets",
    icon: "✨",
    desc: "Ready-made setups. Apply one, or save your own.",
  },
  {
    id: "schedule",
    label: "Schedule",
    icon: "⏱",
    desc: "How often the wallpaper changes, and what to show when.",
  },
  {
    id: "settings",
    label: "Settings",
    icon: "⚙",
    desc: "How the app itself behaves.",
    tabs: [
      { id: "general", label: "General" },
      { id: "storage", label: "Storage" },
      { id: "keyboard", label: "Keyboard" },
      { id: "account", label: "Account & sync" },
      { id: "wallhaven", label: "Wallhaven" },
      { id: "updates", label: "Updates" },
      { id: "help", label: "Help" },
    ],
  },
];

const CARD_META = {
  current: { title: "Now playing", page: "home" },
  statistics: { title: "Statistics", page: "library", sec: "all" },
  search: {
    title: "Search & filters",
    page: "browse",
    parts: [
      { id: "search", label: "What to look for" },
      { id: "resolution", label: "Resolution & aspect" },
      { id: "colors", label: "Colours" },
      { id: "display", label: "How it's shown" },
    ],
  },
  browse: { title: "Browse wallpapers", page: "browse" },
  history: { title: "Recently shown", page: "library", sec: "history" },
  favourites: {
    title: "Liked & disliked",
    page: "library",
    sec: "favourites",
    parts: [
      { id: "favourites", label: "Your reactions" },
      { id: "favorites", label: "Wallhaven account" },
    ],
  },
  playlists: { title: "Playlists", page: "library", sec: "playlists" },
  library: { title: "Pictures on this PC", page: "library", sec: "local" },
  presets: { title: "My presets", page: "presets" },
  community: { title: "Community presets", page: "presets" },
  cycle: { title: "Cycling", page: "schedule" },
  schedule: { title: "Timetable", page: "schedule" },
  app: {
    title: "General",
    page: "settings",
    sec: "general",
    parts: [
      { id: "app", label: "Appearance" },
      { id: "startup", label: "Startup & notifications" },
      { id: "gaming", label: "Gaming" },
      { id: "network", label: "Network" },
      { id: "portable", label: "Portable mode" },
    ],
  },
  cache: { title: "Storage", page: "settings", sec: "storage" },
  hotkeys: { title: "Keyboard shortcuts", page: "settings", sec: "keyboard" },
  account: { title: "Account & sync", page: "settings", sec: "account" },
  apikey: { title: "Wallhaven connection", page: "settings", sec: "wallhaven" },
  updates: { title: "Updates", page: "settings", sec: "updates" },
  feedback: { title: "Feedback", page: "settings", sec: "help" },
  donate: { title: "Support WallRaven", page: "settings", sec: "help" },
  cereal: { title: "🥣", page: "settings", sec: "help" },
};

const DEFAULT_ORDER = [
  "current",
  "search",
  "browse",
  "history",
  "favourites",
  "playlists",
  "library",
  "statistics",
  "presets",
  "community",
  "cycle",
  "schedule",
  "app",
  "cache",
  "hotkeys",
  "account",
  "apikey",
  "updates",
  "feedback",
  "donate",
  "cereal",
];
// Old card ids from before the merges, so saved layouts survive the upgrade.
const CARD_MIGRATIONS = {
  collections: "presets",
  resolution: "search",
  colors: "search",
  display: "search",
  favorites: "favourites",
};
function migrateCardOrder(order) {
  const saved = Array.isArray(order) ? order : [];
  const consolidated =
    saved.includes("collections") ||
    (saved.length <= 6 &&
      saved.every((id) => ["current", "search", "favourites", "cycle", "app"].includes(id)));
  if (consolidated) return DEFAULT_ORDER.slice();
  const out = [];
  for (const raw of saved) {
    const id = CARD_MIGRATIONS[raw] || raw;
    if (CARD_META[id] && !out.includes(id)) out.push(id);
  }
  // Cards added in a later version won't be in a saved layout — slot them in
  // next to whatever comes before them by default so nothing goes missing.
  DEFAULT_ORDER.forEach((id, i) => {
    if (out.includes(id)) return;
    const before = DEFAULT_ORDER[i - 1];
    const at = before ? out.indexOf(before) : -1;
    if (at >= 0) out.splice(at + 1, 0, id);
    else out.push(id);
  });
  return out;
}

const $ = (s, root = document) => root.querySelector(s);
let config = null;
let cardOrder = DEFAULT_ORDER.slice();
let collapsed = {};
let sectionsOpen = {}; // 'card:section' -> true/false (sections inside a card)
let uiPage = "home"; // active destination in the sidebar
let uiTabs = {}; // page id -> active sub-tab id

function pageSiblings(id) {
  const pg = pageOf(id);
  return cardOrder.filter((c) => pageOf(c) === pg);
}
function pageMeta(id) {
  return PAGES.find((p) => p.id === id) || PAGES[0];
}
function pageOf(id) {
  return (CARD_META[id] || {}).page || "settings";
}
function secOf(id) {
  return (CARD_META[id] || {}).sec || "";
}
function activeTab(pageId) {
  const meta = pageMeta(pageId);
  if (!meta.tabs) return "";
  const saved = uiTabs[pageId];
  return meta.tabs.some((t) => t.id === saved) ? saved : meta.tabs[0].id;
}
// A card is shown when it belongs to the current page, and — on pages with
// tabs — to the current tab. The "All" tab of Library shows everything.
function isCardVisible(id) {
  if (pageOf(id) !== uiPage) return false;
  const meta = pageMeta(uiPage);
  if (!meta.tabs) return true;
  const tab = activeTab(uiPage);
  if (tab === "all") return true;
  return secOf(id) === tab || secOf(id) === "";
}
// Only the first section of a card is open by default; the rest are one click away.
function isSectionOpen(cardId, sectionId, index) {
  const k = cardId + ":" + sectionId;
  if (typeof sectionsOpen[k] === "boolean") return sectionsOpen[k];
  // Open the first section by default, except where that section is itself long.
  return index === 0 && (CARD_META[cardId] || {}).openFirst !== false;
}

// Save an appearance change on its own, without dragging the whole form with
// it: pressing Save is for the settings, and these are not settings anybody
// waits to commit. The colour picker fires continuously while it is dragged,
// so writes are coalesced.
let appearanceTimer = null;
let appearancePending = {};
function persistAppearance(patch) {
  appearancePending = { ...appearancePending, ...patch };
  if (appearanceTimer) clearTimeout(appearanceTimer);
  appearanceTimer = setTimeout(async () => {
    const send = appearancePending;
    appearancePending = {};
    appearanceTimer = null;
    try {
      config = await api.setConfig(send);
    } catch {
      /* the next save will carry it */
    }
  }, 300);
}

function applyAccent(c) {
  document.documentElement.style.setProperty("--accent", c);
}
function applyTheme(t) {
  const name = t || "glass";
  const el = document.documentElement;
  // Raven themes share the glass controls and add their own full-window scene.
  const mascotTheme = name === "raven" || name === "raven-beach" || name === "raven-fire";
  el.setAttribute("data-theme", mascotTheme ? "glass" : name);
  if (mascotTheme) el.setAttribute("data-mascot", name);
  else el.removeAttribute("data-mascot");
}

// ---------- Card rendering, collapse, reorder ----------
function renderCards() {
  const host = $("#cards");
  host.innerHTML = "";
  // ensure all known cards exist in order, unknowns dropped, missing appended
  cardOrder = migrateCardOrder(cardOrder);
  for (const id of DEFAULT_ORDER) if (!cardOrder.includes(id)) cardOrder.push(id);

  const buildCard = (id, idx) => {
    const siblings = pageSiblings(id);
    const meta = CARD_META[id];
    if (!meta) return null;
    const parts = meta.parts || [{ id }];
    if (!parts.some((p) => document.getElementById("tpl-" + p.id))) return null;
    const card = document.createElement("section");
    card.className = "card" + (collapsed[id] ? "" : " open");
    card.dataset.id = id;
    card.draggable = false;
    card.innerHTML = `
      <div class="card-head">
        <span class="drag-handle" title="Drag to reorder">⋮⋮</span>
        <span class="caret">▶</span>
        <h2>${meta.title}<span class="sub" data-role="sub"></span></h2>
        <button class="order-btn" data-act="up"   title="Move up"   ${idx === 0 ? "disabled style=opacity:.3" : ""}>↑</button>
        <button class="order-btn" data-act="down" title="Move down" ${idx === siblings.length - 1 ? "disabled style=opacity:.3" : ""}>↓</button>
      </div>
      <div class="card-body"></div>`;
    const body = card.querySelector(".card-body");
    parts.forEach((p, i) => {
      const tpl = document.getElementById("tpl-" + p.id);
      if (!tpl) return;
      if (meta.parts) {
        const open = isSectionOpen(id, p.id, i);
        const sec = document.createElement("div");
        sec.className = "subcard" + (open ? " open" : "");
        sec.dataset.id = p.id;
        const head = document.createElement("div");
        head.className = "sub-head";
        head.innerHTML =
          '<span class="caret">▶</span><h3>' +
          p.label +
          '<span class="sub" data-role="sub"></span></h3>';
        const secBody = document.createElement("div");
        secBody.className = "sub-body";
        secBody.appendChild(tpl.content.cloneNode(true));
        head.addEventListener("click", () => {
          sec.classList.toggle("open");
          sectionsOpen[id + ":" + p.id] = sec.classList.contains("open");
          persistUiState();
        });
        sec.appendChild(head);
        sec.appendChild(secBody);
        body.appendChild(sec);
      } else {
        body.appendChild(tpl.content.cloneNode(true));
      }
    });
    return card;
  };

  // Every card is built once so all existing wiring finds its elements; the
  // active page simply decides which of them are on screen.
  cardOrder.forEach((id) => {
    const card = buildCard(id, pageSiblings(id).indexOf(id));
    if (card) host.appendChild(card);
  });
  applyPageVisibility();

  // wire head clicks (collapse) + order buttons + drag & drop
  let dragId = null;
  host.querySelectorAll(".card").forEach((card) => {
    const id = card.dataset.id;
    const head = card.querySelector(".card-head");
    head.addEventListener("click", (e) => {
      if (e.target.closest(".order-btn") || e.target.closest(".drag-handle")) return;
      card.classList.toggle("open");
      collapsed[id] = !card.classList.contains("open");
      persistUiState();
    });
    head.querySelectorAll(".order-btn").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        moveCard(id, b.dataset.act === "up" ? -1 : 1);
      });
    });
    const handle = card.querySelector(".drag-handle");
    if (handle) {
      handle.addEventListener("mousedown", () => {
        card.draggable = true;
      });
      handle.addEventListener("mouseup", () => {
        card.draggable = false;
      });
    }
    card.addEventListener("dragstart", (e) => {
      if (!card.draggable) {
        e.preventDefault();
        return;
      }
      dragId = id;
      card.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      try {
        e.dataTransfer.setData("text/plain", id);
      } catch {}
    });
    card.addEventListener("dragend", () => {
      dragId = null;
      card.draggable = false;
      host.querySelectorAll(".card").forEach((c) => c.classList.remove("dragging", "drag-over"));
    });
    card.addEventListener("dragover", (e) => {
      if (!dragId || dragId === id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      card.classList.add("drag-over");
    });
    card.addEventListener("dragleave", () => card.classList.remove("drag-over"));
    card.addEventListener("drop", (e) => {
      e.preventDefault();
      card.classList.remove("drag-over");
      const src = dragId;
      if (!src || src === id) return;
      reorderCard(src, id);
    });
  });

  wireAllCards();
}

// ---------- Application shell: sidebar, page header, sub-tabs ----------
// The Fade button is created in the header markup and lives in the sidebar.
// Kept here so renderSidebar can put it back after clearing the sidebar.
let fadeBtnEl = null;

function renderSidebar() {
  const host = $("#sidebar");
  if (!host) return;
  host.innerHTML = "";
  for (const p of PAGES) {
    const el = document.createElement("div");
    el.className = "nav-item" + (p.id === uiPage ? " active" : "");
    el.title = p.label;
    el.innerHTML = `<span class="ico">${p.icon}</span><span class="lbl">${p.label}</span>`;
    el.onclick = () => goPage(p.id);
    host.appendChild(el);
  }
  const spacer = document.createElement("div");
  spacer.className = "nav-spacer";
  host.appendChild(spacer);
  const foot = document.createElement("div");
  foot.className = "nav-foot";
  foot.innerHTML = '<span id="sidebar-version">v?</span>';
  host.appendChild(foot);
  // Peek-at-the-wallpaper lives down here beside the version, well away from
  // the wallpaper controls in the title bar.
  //
  // It is moved here out of the header, and this function clears the sidebar
  // before rebuilding it -- so the first click on any nav item destroyed the
  // button, and Fade was gone until the window was reopened. Holding the
  // element itself means the same node (with its handlers still attached) goes
  // back in every time, whether or not it is currently in the document.
  if (!fadeBtnEl) fadeBtnEl = document.getElementById("btn-fade");
  if (fadeBtnEl) {
    fadeBtnEl.hidden = false;
    fadeBtnEl.classList.add("secondary");
    foot.appendChild(fadeBtnEl);
  }
  const v = $("#app-version");
  const sv = $("#sidebar-version");
  if (v && sv) sv.textContent = v.textContent;
}

function renderPageHead() {
  const meta = pageMeta(uiPage);
  const head = $("#page-head");
  if (head) {
    head.querySelector("h2").textContent = meta.label;
    head.querySelector("p").textContent = meta.desc || "";
  }
  const nav = $("#subnav");
  if (nav) {
    nav.innerHTML = "";
    if (meta.tabs) {
      const cur = activeTab(uiPage);
      for (const t of meta.tabs) {
        const el = document.createElement("span");
        el.className = "tab" + (t.id === cur ? " on" : "");
        el.textContent = t.label;
        el.onclick = () => {
          uiTabs[uiPage] = t.id;
          persistUiState();
          renderPageHead();
          applyPageVisibility();
        };
        nav.appendChild(el);
      }
    }
  }
}

function applyPageVisibility() {
  const host = $("#cards");
  if (!host) return;
  for (const p of PAGES) host.classList.toggle("page-" + p.id, p.id === uiPage);
  let visible = 0;
  host.querySelectorAll(".card").forEach((card) => {
    card.hidden = !isCardVisible(card.dataset.id);
    if (!card.hidden) visible++;
  });
  // Pages with only one or two panels use the full window width; their own
  // sections then flow side by side instead of stacking into a long scroll.
  host.dataset.visible = String(visible);
}

function goPage(id) {
  if (!PAGES.some((p) => p.id === id)) return;
  const leavingLibrary = uiPage === "library" && id !== "library";
  uiPage = id;
  persistUiState();
  renderSidebar();
  renderPageHead();
  applyPageVisibility();
  window.scrollTo({ top: 0 });
  // Leaving the library drops its thumbnails; they are rebuilt on return.
  if (leavingLibrary) {
    try {
      releaseGalleries();
    } catch {}
  }
  if (id === "library") {
    try {
      loadHistory();
      renderFavourites();
    } catch {}
  }
  if (id === "presets") {
    try {
      refreshPresetsUI();
    } catch {}
  }
  // Opening Browse with an empty grid and a Search button asked the user to
  // press a button to find out what the card does. One request to Wallhaven,
  // against a 45-per-minute limit, is not worth saving.
  if (id === "browse" && !browseState.searched) {
    try {
      runBrowse();
    } catch {}
  }
}

function rerenderAll() {
  renderCards();
  hydrateInputs(config);
  loadHistory();
  refreshInfo();
  try {
    refreshPresetsUI();
  } catch {}
}

function reorderCard(srcId, targetId) {
  const from = cardOrder.indexOf(srcId);
  const to = cardOrder.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return;
  cardOrder.splice(from, 1);
  cardOrder.splice(to, 0, srcId);
  persistUiState();
  renderCards();
  hydrateInputs(config);
  loadHistory();
  refreshInfo();
  refreshPresetsUI();
}

// Reordering only makes sense against the cards you can actually see, so a
// move swaps with the neighbour on the same page rather than a hidden one.
function moveCard(id, delta) {
  const sib = pageSiblings(id);
  const si = sib.indexOf(id);
  const sj = si + delta;
  if (si < 0 || sj < 0 || sj >= sib.length) return;
  const i = cardOrder.indexOf(id);
  const j = cardOrder.indexOf(sib[sj]);
  if (i < 0 || j < 0) return;
  [cardOrder[i], cardOrder[j]] = [cardOrder[j], cardOrder[i]];
  persistUiState();
  // Re-render preserves state via templates re-mount; re-hydrate values
  renderCards();
  hydrateInputs(config);
  loadHistory();
  refreshInfo();
}

let persistTimer = null;
function persistUiState() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    api.setConfig({ cardOrder, collapsed, sectionsOpen, uiPage, uiTabs });
  }, 300);
}

// ---------- Inputs ----------
function setChips(containerId, values) {
  document.querySelectorAll("#" + containerId + " .chip").forEach((el) => {
    el.classList.toggle("active", values.includes(el.dataset.v));
    el.onclick = () => {
      el.classList.toggle("active");
    };
  });
}
function readChips(containerId) {
  return [...document.querySelectorAll("#" + containerId + " .chip.active")].map(
    (e) => e.dataset.v,
  );
}
function buildPalette(selected) {
  const el = $("#palette");
  if (!el) return;
  el.innerHTML = "";
  PALETTE.forEach((hex) => {
    const s = document.createElement("div");
    s.className = "swatch" + (selected.includes(hex) ? " active" : "");
    s.style.background = "#" + hex;
    s.title = "#" + hex;
    s.dataset.v = hex;
    s.onclick = () => s.classList.toggle("active");
    el.appendChild(s);
  });
}
function readPalette() {
  return [...document.querySelectorAll("#palette .swatch.active")].map((e) => e.dataset.v);
}
function bindSlider(rangeId, numId) {
  const r = $("#" + rangeId),
    n = $("#" + numId);
  if (!r || !n) return;
  r.oninput = () => (n.value = r.value);
  n.oninput = () => (r.value = n.value);
}

function hydrateInputs(c) {
  if (!c) return;
  const set = (sel, v) => {
    const el = $(sel);
    if (el) el.value = v ?? "";
  };
  const chk = (sel, v) => {
    const el = $(sel);
    if (el) el.checked = !!v;
  };
  set("#query", c.query || "");
  chk("#cat-general", c.categories?.general);
  chk("#cat-anime", c.categories?.anime);
  chk("#cat-people", c.categories?.people);
  chk("#pur-sfw", c.purity?.sfw);
  chk("#pur-sketchy", c.purity?.sketchy);
  chk("#pur-nsfw", c.purity?.nsfw);
  set("#sorting", c.sorting);
  set("#topRange", c.topRange);

  // Update "Current screen" option label with real device dimensions
  const cur = $("#opt-current-res");
  if (cur) {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(screen.width * dpr),
      h = Math.round(screen.height * dpr);
    cur.textContent = `Current screen (${w}×${h})`;
    cur.dataset.res = `${w}x${h}`;
  }
  set(
    "#atleastResolution",
    c.atleastResolution === "__current__" || !c.atleastResolution
      ? c.atleastResolution || ""
      : c.atleastResolution,
  );
  set("#resolutions", c.resolutions || "");
  // Detect current screen aspect ratio and label the "Current" chip
  const curChip = $("#chip-current-ratio");
  if (curChip) {
    const dpr = window.devicePixelRatio || 1;
    const sw = Math.round(screen.width * dpr),
      sh = Math.round(screen.height * dpr);
    const CANDIDATES = [
      { v: "16x9", r: 16 / 9 },
      { v: "16x10", r: 16 / 10 },
      { v: "21x9", r: 21 / 9 },
      { v: "32x9", r: 32 / 9 },
      { v: "4x3", r: 4 / 3 },
      { v: "5x4", r: 5 / 4 },
      { v: "9x16", r: 9 / 16 },
      { v: "10x16", r: 10 / 16 },
    ];
    const actual = sw / sh;
    let best = CANDIDATES[0],
      bestD = Infinity;
    for (const c2 of CANDIDATES) {
      const d = Math.abs(c2.r - actual);
      if (d < bestD) {
        bestD = d;
        best = c2;
      }
    }
    const label = best.v.replace("x", ":");
    curChip.textContent = `Current (${label})`;
    curChip.dataset.resolved = best.v;
  }
  setChips("ratios", (c.ratios || "").split(",").filter(Boolean));
  buildPalette(c.colors || []);
  set("#cycleMinutes", c.cycleMinutes);
  set("#cycleMinutesNum", c.cycleMinutes);
  set("#cacheMaxMB", c.cacheMaxMB);
  set("#cacheMaxMBNum", c.cacheMaxMB);
  set("#fitMode", c.fitMode || "fill");
  set("#monitorMode", c.monitorMode || "same");
  set("#blacklistTagIds", (c.blacklistTagIds || []).join(","));
  chk("#hotkeysEnabled", c.hotkeysEnabled !== false);
  const hk = c.hotkeys || {};
  set("#hk-next", hk.next || "");
  set("#hk-like", hk.like || "");
  set("#hk-dislike", hk.dislike || "");
  set("#hk-pauseSchedule", hk.pauseSchedule || "");
  set("#hk-randomFav", hk.randomFav || "");
  set("#hk-back", hk.back || "");
  set("#hk-forward", hk.forward || "");
  set("#blacklistTagIds", (c.blacklistTagIds || []).join(","));
  set("#apiKey", c.apiKey || "");
  setApiKeyStatus((c.apiKey || "").trim() ? "unchecked" : "missing");
  set("#uiAccent", c.uiAccent || "#7c5cff");
  set("#theme", c.theme || "glass");
  chk("#autoStart", c.autoStart);
  chk("#startMinimized", c.startMinimized);
  chk("#notifyOnChange", c.notifyOnChange);
  chk("#matchLockScreen", c.matchLockScreen);
  chk("#pauseOnFullscreen", c.pauseOnFullscreen);
  set("#pauseFullscreenMode", c.pauseFullscreenMode || "all");
  set("#pauseFullscreenApps", (c.pauseFullscreenApps || []).join(", "));
  chk("#autoInstallUpdates", c.autoInstallUpdates !== false);
  chk("#autoDownloadUpdates", c.autoDownloadUpdates);
  chk("#folderRecursive", c.folderRecursive !== false);
  chk("#offlineCachedOnlyManual", c.offlineCachedOnlyManual);
  chk("#prefetchEnabled", c.prefetchEnabled !== false);
  chk("#skipLetterboxed", c.skipLetterboxed !== false);
  const lbc = $("#letterboxCount");
  if (lbc) lbc.textContent = (c.letterboxedIds || []).length;
  set("#folderOrder", c.folderOrder || "random");
  syncFullscreenRows();

  set("#whUsername", c.whUsername || "");
  set("#sourceMode", c.sourceMode || "search");
  const tr = $("#toprange-row");
  if (tr) tr.style.display = c.sorting === "toplist" ? "" : "none";
  const dc = $("#dislikeCount");
  if (dc) dc.textContent = (c.dislikes || []).length;
  const lc = $("#likeCount");
  if (lc) lc.textContent = (c.likes || []).length;
  chk("#scheduleEnabled", c.schedule?.enabled);
  renderScheduleRules(c.schedule?.rules || []);
  updateScheduleStatus();
  // Whatever the form now shows is, by definition, what is saved. Deferred so
  // anything that renders after hydrating has settled first.
  setTimeout(markFormSaved, 0);
}

function collect() {
  const val = (s, d = "") => $(s)?.value ?? d;
  const num = (s, d = 0) => Number($(s)?.value ?? d);
  const chk = (s) => !!$(s)?.checked;
  return {
    query: val("#query").trim(),
    categories: {
      general: chk("#cat-general"),
      anime: chk("#cat-anime"),
      people: chk("#cat-people"),
    },
    purity: { sfw: chk("#pur-sfw"), sketchy: chk("#pur-sketchy"), nsfw: chk("#pur-nsfw") },
    sorting: val("#sorting") || "random",
    topRange: val("#topRange") || "1M",
    // Wallhaven filters AI art out by default and the control only offered a
    // way to put it back, which is not what "Exclude AI art" reads as. Pinned
    // to exclude, including for anyone whose saved config said otherwise.
    aiArtFilter: 1,
    atleastResolution:
      val("#atleastResolution") === "__current__"
        ? $("#opt-current-res")?.dataset.res || ""
        : val("#atleastResolution"),
    resolutions: val("#resolutions").trim(),
    ratios: (() => {
      const picked = readChips("ratios");
      const resolved = $("#chip-current-ratio")?.dataset.resolved;
      const out = new Set();
      for (const v of picked) {
        if (v === "__current__" && resolved) out.add(resolved);
        else if (v !== "__current__") out.add(v);
      }
      return [...out].join(",");
    })(),
    colors: readPalette(),
    cycleMinutes: num("#cycleMinutes", 30),
    cacheMaxMB: num("#cacheMaxMB", 1024),
    apiKey: val("#apiKey").trim(),
    uiAccent: val("#uiAccent") || "#7c5cff",
    theme: val("#theme") || "glass",
    autoStart: chk("#autoStart"),
    startMinimized: chk("#startMinimized"),
    notifyOnChange: chk("#notifyOnChange"),
    matchLockScreen: chk("#matchLockScreen"),
    pauseOnFullscreen: chk("#pauseOnFullscreen"),
    pauseFullscreenMode: val("#pauseFullscreenMode") || "all",
    pauseFullscreenApps: val("#pauseFullscreenApps")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    autoInstallUpdates: chk("#autoInstallUpdates"),
    autoDownloadUpdates: chk("#autoDownloadUpdates"),

    whUsername: val("#whUsername").trim(),
    sourceMode: val("#sourceMode") || "search",
    collectionId: config?.collectionId || null,
    cardOrder,
    collapsed,
    sectionsOpen,
    uiPage,
    uiTabs,
    fitMode: val("#fitMode") || "fill",
    monitorMode: val("#monitorMode") || "same",
    blacklistTagIds: val("#blacklistTagIds")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => n > 0),
    schedule: collectSchedule(),
    hotkeysEnabled: chk("#hotkeysEnabled"),
    hotkeys: {
      next: val("#hk-next").trim(),
      like: val("#hk-like").trim(),
      dislike: val("#hk-dislike").trim(),
      pauseSchedule: val("#hk-pauseSchedule").trim(),
      randomFav: val("#hk-randomFav").trim(),
      back: val("#hk-back").trim(),
      forward: val("#hk-forward").trim(),
    },
    offlineCachedOnlyManual: chk("#offlineCachedOnlyManual"),
    prefetchEnabled: chk("#prefetchEnabled"),
    skipLetterboxed: chk("#skipLetterboxed"),
  };
}

// ---------- Per-card wiring ----------
let currentWp = null;

// Open a wallpaper's Wallhaven page. Older/local entries have no stored url,
// so rebuild it from the Wallhaven id when we can, and say so when we can't.
async function openOnWallhaven(item) {
  const id = String(item?.id || "");
  let url = String(item?.url || "");
  if (!/^https?:/i.test(url))
    url = id && !id.startsWith("local:") ? `https://wallhaven.cc/w/${id}` : "";
  if (!url) {
    flash("This picture is from your own folders, so it has no Wallhaven page", "err");
    return;
  }
  try {
    const r = await api.openExternal(url);
    if (r && r.ok === false) flash("Could not open that link", "err");
  } catch (e) {
    flash("Could not open that link", "err");
  }
}

function wireAllCards() {
  // The cards are rebuilt from templates on every navigation, so anything
  // rendered into one has to be put back here or it vanishes when the user
  // leaves the page and comes back.
  renderHotkeyStatus();
  applyStoreUi();
  bindSlider("cycleMinutes", "cycleMinutesNum");
  bindSlider("cacheMaxMB", "cacheMaxMBNum");

  $("#sorting")?.addEventListener("change", () => {
    const tr = $("#toprange-row");
    if (tr) tr.style.display = $("#sorting").value === "toplist" ? "" : "none";
  });
  // How the app looks is saved the moment it changes, not when Save is pressed.
  //
  // It used to be a preview that only became real on Save, so anything else
  // that wrote settings -- applying a preset, saving a new one -- came back
  // with the stored theme and put it back on screen. Picking Raven Fyra and
  // then saving a preset visibly undid the theme, which reads as the app
  // refusing to keep it.
  $("#uiAccent")?.addEventListener("input", () => {
    const value = $("#uiAccent").value;
    applyAccent(value);
    persistAppearance({ uiAccent: value });
  });
  $("#theme")?.addEventListener("change", () => {
    const value = $("#theme").value;
    applyTheme(value);
    persistAppearance({ theme: value });
  });

  $("#btn-clear") &&
    ($("#btn-clear").onclick = async () => {
      await api.clearCache();
      await refreshInfo();
      flash("Cache cleared", "ok");
    });
  $("#btn-open") &&
    ($("#btn-open").onclick = () => {
      if (currentWp) openOnWallhaven(currentWp);
    });
  $("#btn-folder") &&
    ($("#btn-folder").onclick = () => {
      if (currentWp) api.showInFolder(currentWp.file);
    });
  $("#btn-apikey-validate") &&
    ($("#btn-apikey-validate").onclick = async () => {
      const st = $("#apikeyStatus");
      const key = (($("#apiKey") && $("#apiKey").value) || "").trim();
      if (!key) {
        setApiKeyStatus("missing");
        return;
      }
      if (st) {
        st.textContent = "Checking…";
        st.className = "status";
      }
      const r = await api.apiKeyValidate(key);
      if (r.ok) setApiKeyStatus("valid", r.username);
      else setApiKeyStatus("invalid", r.reason);
    });
  $("#apiKey")?.addEventListener("input", () =>
    setApiKeyStatus(($("#apiKey").value || "").trim() ? "unchecked" : "missing"),
  );
  $("#btn-changelog-toggle") &&
    ($("#btn-changelog-toggle").onclick = () => {
      const wrap = $("#changelogWrap");
      if (!wrap) return;
      const open = wrap.style.display === "none";
      wrap.style.display = open ? "block" : "none";
      const c = $("#changelogCaret");
      if (c) c.textContent = open ? "▾" : "▸";
      if (open) loadChangelog();
    });
  // Crashes recorded on this machine. Shown, never sent on their own: a stack
  // trace names files and files name people, so the person reads it first.
  async function refreshCrashes() {
    const box = $("#crashBox");
    if (!box || !api.crashList) return;
    let r = null;
    try {
      r = await api.crashList();
    } catch {
      return;
    }
    const n = (r && r.count) || 0;
    if (!n) {
      box.style.display = "none";
      return;
    }
    const last = r.items[0];
    const when = last ? new Date(last.at).toLocaleString() : "";
    $("#crashSummary").textContent =
      n === 1
        ? `WallRaven recorded a problem (${when}).`
        : `WallRaven recorded ${n} problems. Most recent ${when}.`;
    box.style.display = "";
  }

  $("#btn-crash-view") &&
    ($("#btn-crash-view").onclick = async () => {
      const pre = $("#crashDetail");
      if (!pre) return;
      if (pre.style.display !== "none") {
        pre.style.display = "none";
        return;
      }
      const r = await api.crashPreview();
      pre.textContent = (r && r.text) || "Nothing recorded.";
      pre.style.display = "block";
    });

  $("#btn-crash-attach") &&
    ($("#btn-crash-attach").onclick = async () => {
      const r = await api.crashPreview();
      const box = $("#feedbackMessage");
      if (!box || !r || !r.text) return;
      const existing = (box.value || "").trim();
      box.value = (existing ? existing + "\n\n" : "") + "Crash details:\n" + r.text;
      const kind = $("#feedbackKind");
      if (kind) kind.value = "crash";
      box.focus();
      flash("Crash details added to the message. Send when ready.", "ok");
    });

  $("#btn-crash-clear") &&
    ($("#btn-crash-clear").onclick = async () => {
      await api.crashClear();
      const pre = $("#crashDetail");
      if (pre) {
        pre.style.display = "none";
        pre.textContent = "";
      }
      await refreshCrashes();
      flash("Crash reports discarded", "ok");
    });

  refreshCrashes();

  $("#btn-feedback-send") &&
    ($("#btn-feedback-send").onclick = async () => {
      const st = $("#feedbackStatus");
      const message = (($("#feedbackMessage") || {}).value || "").trim();
      if (message.length < 5) {
        if (st) {
          st.textContent = "Please describe it in a little more detail.";
          st.className = "status err";
        }
        return;
      }
      if (st) {
        st.textContent = "Sending…";
        st.className = "status";
      }
      const r = await api.sendFeedback({
        kind: ($("#feedbackKind") || {}).value || "feedback",
        message,
        email: (($("#feedbackEmail") || {}).value || "").trim(),
      });
      if (st) {
        st.textContent =
          r && r.ok ? "Thanks — sent!" : "Could not send: " + ((r && r.reason) || "unknown error");
        st.className = "status " + (r && r.ok ? "ok" : "err");
      }
      if (r && r.ok && $("#feedbackMessage")) $("#feedbackMessage").value = "";
    });
  wireCereal();
  $("#btn-stats-refresh") && ($("#btn-stats-refresh").onclick = renderStats);
  $("#btn-stats-reset") &&
    ($("#btn-stats-reset").onclick = async () => {
      await api.statsReset();
      await renderStats();
      flash("Statistics reset", "ok");
    });
  $("#btn-clear-dislikes") &&
    ($("#btn-clear-dislikes").onclick = async () => {
      await api.clearDislikes();
      config = await api.getConfig();
      hydrateInputs(config);
      renderPlaylistUI();
      flash("Dislikes cleared", "ok");
    });
  // Unlike clearing dislikes, this throws away a collection the user built on
  // purpose, so it asks first. The wallpaper files stay in the cache.
  $("#btn-clear-likes") &&
    ($("#btn-clear-likes").onclick = async () => {
      const n = (config.likes || []).length;
      if (!n) {
        flash("Nothing liked yet", "ok");
        return;
      }
      if (
        !confirm(
          `Forget ${n} liked wallpaper${n === 1 ? "" : "s"} and empty the Liked playlist? ` +
            "The image files stay in the cache.",
        )
      )
        return;
      await api.clearLikes();
      config = await api.getConfig();
      hydrateInputs(config);
      likedIds.clear();
      renderHistory();
      renderPlaylistUI();
      flash("Likes cleared", "ok");
    });
  $("#btn-clear-letterboxed") &&
    ($("#btn-clear-letterboxed").onclick = async () => {
      await api.clearLetterboxed();
      config = await api.getConfig();
      hydrateInputs(config);
      flash("Letterbox list cleared", "ok");
    });
  $("#pauseOnFullscreen")?.addEventListener("change", syncFullscreenRows);
  $("#pauseFullscreenMode")?.addEventListener("change", syncFullscreenRows);
  // Pick from what is actually running. The old button probed the foreground
  // window, which could only ever be WallRaven, since pressing a button in
  // WallRaven focuses WallRaven. Listing windowed processes and letting the
  // user choose removes the race entirely.
  function addPauseApp(name) {
    const input = $("#pauseFullscreenApps");
    if (!input || !name) return false;
    const list = input.value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const already = list.some((x) => x.toLowerCase().replace(/\.exe$/, "") === name.toLowerCase());
    if (!already) list.push(name);
    input.value = list.join(", ");
    return !already;
  }

  $("#btn-list-apps") &&
    ($("#btn-list-apps").onclick = async () => {
      const st = $("#detectStatus");
      const sel = $("#runningApps");
      const btn = $("#btn-list-apps");
      if (st) {
        st.textContent = "Looking at what is running\u2026";
        st.className = "status";
      }
      if (btn) btn.disabled = true;
      let res;
      try {
        res = await api.appsRunning();
      } catch {
        res = null;
      } finally {
        if (btn) btn.disabled = false;
      }

      const apps = (res && res.apps ? res.apps : []).filter((a) => !/^wallraven$/i.test(a.name));
      if (!apps.length) {
        if (sel) sel.style.display = "none";
        if (st) {
          st.textContent = "Could not find any running apps with a window.";
          st.className = "status err";
        }
        return;
      }

      sel.innerHTML =
        '<option value="">\u2014 pick an app \u2014</option>' +
        apps
          .map(
            (a) =>
              `<option value="${escapeHtml(a.name)}">${escapeHtml(a.name)}${a.title ? " \u2014 " + escapeHtml(a.title) : ""}</option>`,
          )
          .join("");
      sel.style.display = "";
      if (st) {
        st.textContent = `${apps.length} running app${apps.length === 1 ? "" : "s"}. Pick one to add it.`;
        st.className = "status";
      }
    });

  $("#runningApps") &&
    ($("#runningApps").onchange = (e) => {
      const name = e.target.value;
      if (!name) return;
      const st = $("#detectStatus");
      const added = addPauseApp(name);
      e.target.selectedIndex = 0;
      if (st) {
        st.textContent = added
          ? `Added "${name}". Save to apply.`
          : `"${name}" is already in the list.`;
        st.className = "status ok";
      }
    });

  $("#btn-cache-test") &&
    ($("#btn-cache-test").onclick = async () => {
      const out = $("#cacheTestOut"),
        actions = $("#cacheTestActions");
      out.style.display = "";
      out.textContent = "Checking…";
      actions.style.display = "none";
      const limitMB = Number($("#cacheMaxMB")?.value) || null;
      const r = await api.cacheTest({ apply: false, limitMB });
      out.innerHTML = renderCachePlan(r.plan);
      if (r.plan.removed.length) actions.style.display = "";
      flash(
        r.plan.removed.length
          ? `${r.plan.removed.length} wallpaper(s) would be deleted`
          : "Nothing to delete — under the limit",
        "ok",
      );
    });
  $("#btn-cache-apply") &&
    ($("#btn-cache-apply").onclick = async () => {
      const limitMB = Number($("#cacheMaxMB")?.value) || null;
      const r = await api.cacheTest({ apply: true, limitMB });
      $("#cacheTestOut").innerHTML = renderCachePlan(r.result, true);
      $("#cacheTestActions").style.display = "none";
      await refreshInfo();
      flash(`Deleted ${r.result.removed.length} wallpaper(s)`, "ok");
    });

  $("#btn-upd-check") &&
    ($("#btn-upd-check").onclick = async () => {
      setUpdStatus("Checking for updates…");
      const info = await api.updateCheck();
      config.updateInfo = info || config.updateInfo;
      renderUpdatesCard();
      refreshUpdateBanner();
    });
  $("#btn-upd-download") &&
    ($("#btn-upd-download").onclick = async () => {
      setUpdStatus("Starting download…");
      const r = await api.updateDownload();
      if (!r?.ok) {
        setUpdStatus(r?.reason || "Download failed", "err");
        flash(r?.reason || "Download failed", "err");
      }
    });
  $("#btn-upd-install") &&
    ($("#btn-upd-install").onclick = async () => {
      setUpdStatus("Launching installer — WallRaven will close…");
      const r = await api.updateInstall();
      if (!r?.ok) setUpdStatus(r?.reason || "Could not start the installer", "err");
    });
  $("#btn-upd-page") &&
    ($("#btn-upd-page").onclick = () => {
      const i = config?.updateInfo || {};
      api.openExternal(i.pageUrl || i.url);
    });
  $("#btn-changelog-refresh") && ($("#btn-changelog-refresh").onclick = loadChangelog);
  renderUpdatesCard();

  $("#scheduleEnabled")?.addEventListener("change", () => {
    renderScheduleWeek(sortRules(collectSchedule().rules), scheduleActiveRuleId);
    persistSchedule();
  });
  $("#btn-add-rule") &&
    ($("#btn-add-rule").onclick = () => {
      const rules = collectSchedule().rules;
      const id = "r" + Date.now();
      rules.push({
        id,
        startHHMM: "08:00",
        days: [],
        sourceType: "search",
        sourceRef: "",
        intervalMin: null,
      });
      schSelectedId = id;
      schShowAll = false;
      renderScheduleRules(rules);
      persistSchedule();
    });
  $("#btn-sch-showall") &&
    ($("#btn-sch-showall").onclick = () => {
      schShowAll = !schShowAll;
      renderScheduleRules(collectSchedule().rules);
    });

  wireTagBrowser();
  wireCollections();
  wireHistoryGrid();
  wirePresets();
  wireCommunity();
  wireBrowse();
  wirePlaylists();
  wireFavourites();
  wireLibrary();
  wireFolderRotation();
  wireCacheLocation();
  wireAccount();
}

// ---------- Schedule wiring ----------
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKEND = [0, 6];

// Everything below turns a timetable entry into a sentence. The old card put
// four controls in a row and left the user to work out what they added up to:
// what a blank interval meant, what happened after an entry, what "days" with
// nothing ticked did. None of that is visible in a form.
function sameDays(a, b) {
  const x = [...new Set(a || [])].sort();
  const y = [...new Set(b || [])].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

function describeDays(days) {
  const d = days || [];
  if (!d.length || d.length === 7) return "every day";
  if (sameDays(d, WEEKDAYS)) return "on weekdays";
  if (sameDays(d, WEEKEND)) return "at weekends";
  return (
    "on " +
    [...d]
      .sort()
      .map((n) => DAY_LABELS[n])
      .join(", ")
  );
}

function describeSource(rule, config) {
  const ref = (rule.sourceRef || "").trim();
  switch (rule.sourceType) {
    case "playlist":
      return ref ? `the playlist "${ref}"` : "a playlist (none chosen yet)";
    case "preset":
      return ref ? `the preset "${ref}"` : "a preset (none chosen yet)";
    case "collection":
      return ref ? `Wallhaven collection ${ref}` : "a Wallhaven collection (no id yet)";
    default:
      return "your saved search";
  }
}

// Minutes since midnight, or null when the time is unusable.
function ruleMinutes(rule) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String((rule && rule.startHHMM) || ""));
  if (!m) return null;
  const h = Number(m[1]),
    min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function sortRules(rules) {
  // Entries take effect in time order whatever order they were typed in, so
  // the list is shown that way. Unreadable times sink to the bottom rather
  // than being dropped.
  return [...(rules || [])].sort((a, b) => {
    const ma = ruleMinutes(a),
      mb = ruleMinutes(b);
    if (ma === null && mb === null) return 0;
    if (ma === null) return 1;
    if (mb === null) return -1;
    return ma - mb;
  });
}

// The entry that follows this one on the same day, which is what decides when
// this one stops. Entries on different days never bound each other.
function nextRuleAfter(rule, rules) {
  const mine = ruleMinutes(rule);
  if (mine === null) return null;
  const overlapping = sortRules(rules).filter((r) => {
    if (r === rule) return false;
    const m = ruleMinutes(r);
    if (m === null || m <= mine) return false;
    const a = rule.days || [],
      b = r.days || [];
    if (!a.length || !b.length) return true;
    return b.some((d) => a.includes(d));
  });
  return overlapping[0] || null;
}

function describeRule(rule, rules, config, globalCycle) {
  const time = rule.startHHMM || "??:??";
  const until = nextRuleAfter(rule, rules);
  const every =
    Number(rule.intervalMin) > 0
      ? `${rule.intervalMin} minutes`
      : `${globalCycle || 30} minutes (the usual interval)`;
  let window;
  if (until) {
    window = `until ${until.startHHMM}`;
  } else {
    // The last entry of the day runs until the first one comes round again,
    // which is the following morning. Saying "until the next entry" was true
    // and useless.
    const first = sortRules(rules).find((r) => ruleMinutes(r) !== null);
    window =
      first && first !== rule
        ? `until ${first.startHHMM} the next morning`
        : "for the rest of the day and overnight";
  }
  return `From <strong>${time}</strong> ${window}, ${describeDays(rule.days)}, use ${describeSource(rule, config)}, changing every ${every}.`;
}

// Two entries at the same time on the same day: the later one in the list wins
// and the other silently never happens.
function clashingRuleIds(rules) {
  const clashes = new Set();
  const list = rules || [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i],
        b = list[j];
      if (ruleMinutes(a) === null || ruleMinutes(a) !== ruleMinutes(b)) continue;
      const da = a.days || [],
        db = b.days || [];
      const overlap = !da.length || !db.length || db.some((d) => da.includes(d));
      if (overlap) {
        clashes.add(a.id);
        clashes.add(b.id);
      }
    }
  }
  return clashes;
}
// ---------- the week, drawn ----------
// The timetable as a week of blocks, after the Day view in the v2 concept.
// It is a picture of the existing rules, not a new kind of rule: entries still
// have only a start, and run until the next one begins. So a block ends where
// the next entry starts, and the stretch before a day's first entry is the
// previous entry carrying on, drawn striped.
//
// What is drawn comes from scheduleRuleAt, a copy of findActiveRule in
// main.cjs, so the picture cannot disagree with what the app does. A test
// checks the two give the same answer across the whole week.

const SCH_COLOURS = ["#a8b4ff", "#7fdde6", "#f5a3d0", "#f5b89c", "#c6e89a", "#ffe08a", "#c9b8ff", "#9fd8b5"];
// Monday first, as a week is read here; values are Date.getDay() numbers.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

// parseHHMM from main.cjs, as is: it clamps where ruleMinutes rejects, and the
// week has to read times the way the scheduler does.
function schedulerParseHHMM(v) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || "").trim());
  if (!m) return null;
  return Math.min(23, Math.max(0, Number(m[1]))) * 60 + Math.min(59, Math.max(0, Number(m[2])));
}

function scheduleRuleAt(rules, dow, mins) {
  const appliesOn = (r, d) => !r.days || !r.days.length || r.days.includes(d);
  const byStart = (a, b) => a._mins - b._mins;
  const valid = (Array.isArray(rules) ? rules : [])
    .map((r) => ({ ...r, _mins: schedulerParseHHMM(r.startHHMM) }))
    .filter((r) => r._mins != null);
  if (!valid.length) return null;
  const startedToday = valid.filter((r) => appliesOn(r, dow) && r._mins <= mins).sort(byStart);
  if (startedToday.length) return startedToday[startedToday.length - 1];
  for (let back = 1; back <= 7; back++) {
    const earlierDay = (dow - back + 7) % 7;
    const onThatDay = valid.filter((r) => appliesOn(r, earlierDay)).sort(byStart);
    if (onThatDay.length) return onThatDay[onThatDay.length - 1];
  }
  return null;
}

// One day as blocks: [{ id, from, to, carried }], minutes since midnight. A
// block starts at midnight or at an entry's start; "carried" means the entry in
// force did not start then, it is still running from earlier.
function scheduleDaySegments(rules, dow) {
  const starts = (rules || [])
    .filter((r) => !r.days || !r.days.length || r.days.includes(dow))
    .map((r) => schedulerParseHHMM(r.startHHMM))
    .filter((m) => m !== null);
  const points = [...new Set([0, ...starts])].sort((a, b) => a - b);
  const out = [];
  points.forEach((from, i) => {
    const to = i + 1 < points.length ? points[i + 1] : 1440;
    const rule = scheduleRuleAt(rules, dow, from);
    if (!rule) return;
    const carried = !(rule._mins === from && (!rule.days || !rule.days.length || rule.days.includes(dow)));
    const last = out[out.length - 1];
    if (last && last.id === rule.id) {
      last.to = to;
      return;
    }
    out.push({ id: rule.id, from, to, carried });
  });
  return out;
}

// Entries that use the same source share a colour, so the same playlist reads
// as the same thing wherever it appears in the week.
function scheduleSourceKey(rule) {
  const ref = (rule.sourceRef || "").trim();
  return (rule.sourceType || "search") + ":" + (rule.sourceType === "search" ? "" : ref);
}
function scheduleSourceLabel(rule) {
  const ref = (rule.sourceRef || "").trim();
  switch (rule.sourceType) {
    case "playlist":
      return ref || "Playlist (none chosen)";
    case "preset":
      return ref || "Preset (none chosen)";
    case "collection":
      return ref ? "Collection " + ref : "Collection (no id)";
    default:
      return "Saved search";
  }
}
function scheduleColours(rules) {
  const keys = [];
  sortRules(rules).forEach((r) => {
    const k = scheduleSourceKey(r);
    if (!keys.includes(k)) keys.push(k);
  });
  const map = {};
  (rules || []).forEach((r) => {
    map[r.id] = SCH_COLOURS[keys.indexOf(scheduleSourceKey(r)) % SCH_COLOURS.length];
  });
  return map;
}
const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");

let schSelectedId = null;
let schShowAll = false;

function renderScheduleWeek(rules, activeRuleId) {
  const host = $("#scheduleWeek");
  if (!host) return;
  const byId = {};
  (rules || []).forEach((r) => (byId[r.id] = r));
  const colours = scheduleColours(rules);
  const now = new Date();
  const today = now.getDay();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const enabled = !!$("#scheduleEnabled")?.checked;
  const pct = (m) => ((m / 1440) * 100).toFixed(3);

  const axis = [0, 3, 6, 9, 12, 15, 18, 21, 24]
    .map((h) => `<span style="left:${pct(h * 60)}%">${String(h).padStart(2, "0")}</span>`)
    .join("");

  const rows = WEEK_ORDER.map((dow) => {
    const blocks = scheduleDaySegments(rules, dow)
      .map((seg) => {
        const r = byId[seg.id];
        if (!r) return "";
        const name = scheduleSourceLabel(r);
        const range = hhmm(seg.from) + "–" + (seg.to === 1440 ? "24:00" : hhmm(seg.to));
        const isNow = enabled && dow === today && r.id === activeRuleId && seg.from <= nowMins && nowMins < seg.to;
        const label = seg.carried
          ? `${name}, ${DAY_FULL[dow]} ${range}, carrying on from the ${r.startHHMM} entry`
          : `${name}, ${DAY_FULL[dow]} ${range}`;
        return `<button type="button" class="sch-block${seg.carried ? " carried" : ""}${r.id === schSelectedId ? " selected" : ""}${isNow ? " now" : ""}"
          data-id="${escapeHtml(String(r.id))}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"
          style="left:${pct(seg.from)}%; width:${pct(seg.to - seg.from)}%; --c:${colours[r.id]}">
          <span class="sch-block-name">${escapeHtml(name)}</span>
          <span class="sch-block-time">${seg.carried ? "carries on" : range}</span>
        </button>`;
      })
      .join("");
    const nowLine = dow === today ? `<div class="sch-now" aria-hidden="true" style="left:${pct(nowMins)}%"></div>` : "";
    return `<div class="sch-day-row${dow === today ? " today" : ""}">
      <span class="sch-day-label">${DAY_LABELS[dow]}</span>
      <div class="sch-track" data-dow="${dow}">${blocks}${nowLine}</div>
    </div>`;
  }).join("");

  host.classList.toggle("off", !enabled);
  host.innerHTML = `<div class="sch-axis">${axis}</div>${rows}${
    (rules || []).length ? "" : '<div class="sch-empty">Nothing planned. Double-click a day to add an entry.</div>'
  }`;

  // Selecting must not redraw the week: the first click of a double-click
  // selects, and the second has to land on the same rows to place an entry.
  host.onclick = (e) => {
    const b = e.target.closest(".sch-block");
    if (b) selectScheduleEntry(b.dataset.id);
  };
  host.ondblclick = (e) => {
    const track = document.elementFromPoint(e.clientX, e.clientY)?.closest(".sch-track");
    if (!track || !host.contains(track)) return;
    const box = track.getBoundingClientRect();
    if (!box.width) return;
    const frac = Math.min(Math.max((e.clientX - box.left) / box.width, 0), 1);
    const mins = Math.min(Math.round((frac * 1440) / 15) * 15, 1425);
    const rules2 = collectSchedule().rules;
    const id = "r" + Date.now();
    rules2.push({
      id,
      startHHMM: hhmm(mins),
      days: [Number(track.dataset.dow)],
      sourceType: "search",
      sourceRef: "",
      intervalMin: null,
    });
    schSelectedId = id;
    schShowAll = false;
    renderScheduleRules(rules2);
    persistSchedule();
  };
}

// Show one entry's editor and mark its blocks, without rebuilding anything.
function selectScheduleEntry(id) {
  schSelectedId = id;
  schShowAll = false;
  document.querySelectorAll("#scheduleWeek .sch-block").forEach((b) => {
    b.classList.toggle("selected", b.dataset.id === id);
  });
  let row = null;
  document.querySelectorAll("#scheduleRules .sch-rule").forEach((r) => {
    r.hidden = r.dataset.id !== id;
    if (!r.hidden) row = r;
  });
  const rules = collectSchedule().rules;
  const sel = rules.find((r) => r.id === id);
  const title = $("#scheduleSelTitle");
  if (title && sel) title.textContent = `The ${sel.startHHMM || "??:??"} entry: ${scheduleSourceLabel(sel)}`;
  const showAllBtn = $("#btn-sch-showall");
  if (showAllBtn) showAllBtn.textContent = "Show all entries";
  row?.scrollIntoView({ block: "nearest" });
}

function renderScheduleRules(rules, activeRuleId) {
  const host = $("#scheduleRules");
  if (!host) return;
  const pls = Object.keys(config?.playlists || {}).sort();
  const presets = Object.keys(config?.presets || {}).sort();
  // Every entry needs an id to be picked out of the week by.
  (rules || []).forEach((r, i) => {
    if (r && !r.id) r.id = "r" + Date.now() + "_" + i;
  });
  const ordered = sortRules(rules);
  const active = activeRuleId || scheduleActiveRuleId;
  renderScheduleWeek(ordered, active);
  const title = $("#scheduleSelTitle");
  const showAllBtn = $("#btn-sch-showall");
  if (!ordered.length) {
    host.innerHTML =
      '<div class="help">Nothing scheduled. Add a time to have WallRaven switch sources during the day: a calm playlist for work hours, your usual search in the evening, that sort of thing.</div>';
    if (title) title.textContent = "";
    if (showAllBtn) showAllBtn.hidden = true;
    return;
  }
  if (!ordered.some((r) => r.id === schSelectedId))
    schSelectedId = (ordered.find((r) => r.id === active) || ordered[0]).id;
  const clashes = clashingRuleIds(ordered);
  const cycle = Number(config?.cycleMinutes) || 30;

  host.innerHTML = ordered
    .map(
      (r, i) => `
    <div class="sch-rule${active && r.id === active ? " is-active" : ""}" data-idx="${i}" data-id="${escapeHtml(String(r.id || ""))}"${schShowAll || r.id === schSelectedId ? "" : " hidden"}>
      <div style="display:grid; grid-template-columns:110px 1fr auto; gap:8px; align-items:center;">
        <input type="time" class="sch-time" value="${escapeHtml(r.startHHMM || "08:00")}" aria-label="Start time" />
        <select class="sch-src-type" aria-label="What to use from this time">
          <option value="search"${r.sourceType === "search" ? " selected" : ""}>My saved search</option>
          <option value="playlist"${r.sourceType === "playlist" ? " selected" : ""}>A playlist</option>
          <option value="preset"${r.sourceType === "preset" ? " selected" : ""}>A preset</option>
          <option value="collection"${r.sourceType === "collection" ? " selected" : ""}>A Wallhaven collection</option>
        </select>
        <button class="icon-btn danger sch-del" title="Remove this time" aria-label="Remove this time">✕</button>
      </div>
      <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
        ${
          r.sourceType === "playlist"
            ? `<select class="sch-src-ref" style="flex:1; min-width:160px;"><option value="">— pick a playlist —</option>${pls.map((n) => `<option value="${escapeHtml(n)}"${r.sourceRef === n ? " selected" : ""}>${escapeHtml(n)}</option>`).join("")}</select>`
            : r.sourceType === "preset"
              ? `<select class="sch-src-ref" style="flex:1; min-width:160px;"><option value="">— pick a preset —</option>${presets.map((n) => `<option value="${escapeHtml(n)}"${r.sourceRef === n ? " selected" : ""}>${escapeHtml(n)}</option>`).join("")}</select>`
              : r.sourceType === "collection"
                ? `<input type="text" class="sch-src-ref" style="flex:1; min-width:160px;" placeholder="Collection id from Wallhaven" value="${escapeHtml(r.sourceRef || "")}" />`
                : `<input type="text" class="sch-src-ref" style="flex:1; min-width:160px;" disabled placeholder="Whatever Search &amp; filters is set to" />`
        }
        <label style="font-size:12px; color:var(--muted); display:flex; align-items:center; gap:6px;">
          change every
          <input type="number" class="sch-interval" min="1" max="1440" style="width:74px;" placeholder="${cycle}" value="${r.intervalMin || ""}" />
          min
        </label>
      </div>
      <div class="day-chips" style="margin-top:8px;">
        ${DAY_LABELS.map((lbl, d) => `<button type="button" class="day-chip sch-day${(r.days || []).includes(d) ? " on" : ""}" data-day="${d}">${lbl}</button>`).join("")}
        <button type="button" class="day-chip sch-day-preset" data-preset="all">Every day</button>
        <button type="button" class="day-chip sch-day-preset" data-preset="weekdays">Weekdays</button>
        <button type="button" class="day-chip sch-day-preset" data-preset="weekend">Weekend</button>
      </div>
      <div class="sch-summary">
        ${describeRule(r, ordered, config, cycle)}
        ${active && r.id === active ? '<span class="sch-badge">on now</span>' : ""}
        ${clashes.has(r.id) ? '<div class="sch-warn" style="margin-top:4px;">Another entry starts at the same time on the same day. Only one of them can win.</div>' : ""}
      </div>
    </div>
  `,
    )
    .join("");

  const sel = ordered.find((r) => r.id === schSelectedId);
  if (title)
    title.textContent = schShowAll
      ? `All ${ordered.length} entries, in the order they start`
      : `The ${sel.startHHMM || "??:??"} entry: ${scheduleSourceLabel(sel)}`;
  if (showAllBtn) {
    showAllBtn.hidden = ordered.length < 2;
    showAllBtn.textContent = schShowAll ? "Show just the selected entry" : "Show all entries";
  }

  host.querySelectorAll(".sch-rule").forEach((row) => {
    row.querySelectorAll("input, select").forEach((el) =>
      el.addEventListener("change", () => {
        // Redraw the week, not the form: redrawing the form would throw away
        // whatever is half-typed in it.
        renderScheduleWeek(sortRules(collectSchedule().rules), scheduleActiveRuleId);
        persistSchedule();
      }),
    );
    row.querySelector(".sch-del").addEventListener("click", () => {
      const rules2 = collectSchedule().rules;
      rules2.splice(Number(row.dataset.idx), 1);
      renderScheduleRules(rules2);
      persistSchedule();
    });
    row.querySelector(".sch-src-type").addEventListener("change", () => {
      // Swap the reference control for the new source type, keeping everything
      // else the user has typed.
      renderScheduleRules(collectSchedule().rules);
    });
    // Day chips toggle in place, then the whole card is redrawn so the
    // sentence underneath keeps up.
    row.querySelectorAll(".sch-day").forEach((chip) =>
      chip.addEventListener("click", () => {
        chip.classList.toggle("on");
        const rules2 = collectSchedule().rules;
        renderScheduleRules(rules2);
        persistSchedule();
      }),
    );
    row.querySelectorAll(".sch-day-preset").forEach((btn) =>
      btn.addEventListener("click", () => {
        const want =
          btn.dataset.preset === "weekdays"
            ? WEEKDAYS
            : btn.dataset.preset === "weekend"
              ? WEEKEND
              : [];
        row.querySelectorAll(".sch-day").forEach((chip) => {
          chip.classList.toggle("on", want.includes(Number(chip.dataset.day)));
        });
        const rules2 = collectSchedule().rules;
        renderScheduleRules(rules2);
        persistSchedule();
      }),
    );
  });
}
function collectSchedule() {
  const host = document.querySelector("#scheduleRules");
  const enabled = !!$("#scheduleEnabled")?.checked;
  if (!host) return { enabled, rules: config?.schedule?.rules || [] };
  const rules = [...host.querySelectorAll(".sch-rule")].map((row, i) => ({
    id: row.dataset.id || "r" + Date.now() + "_" + i,
    startHHMM: row.querySelector(".sch-time").value || "08:00",
    sourceType: row.querySelector(".sch-src-type").value || "search",
    sourceRef: row.querySelector(".sch-src-ref")?.value || "",
    intervalMin: Number(row.querySelector(".sch-interval").value) || null,
    days: [...row.querySelectorAll(".sch-day")]
      .filter((el) => el.classList.contains("on"))
      .map((el) => Number(el.dataset.day)),
  }));
  return { enabled, rules };
}
async function persistSchedule() {
  const schedule = collectSchedule();
  config = await api.setConfig({ schedule });
  updateScheduleStatus();
}
let scheduleActiveRuleId = null;
async function updateScheduleStatus() {
  const el = $("#scheduleStatus");
  if (!el) return;
  try {
    const p = await api.schedulePreview();
    const rules = config?.schedule?.rules || [];
    const r = rules.find((x) => x.id === p.activeRuleId);
    const wasActive = scheduleActiveRuleId;
    scheduleActiveRuleId = p.activeRuleId || null;
    el.textContent = !p.enabled
      ? "The timetable is off, so your usual settings are in charge."
      : r
        ? `In force now: the ${r.startHHMM} entry, changing every ${p.effectiveIntervalMin} minutes.`
        : "On, but nothing has started yet today.";
    // Only redraw when the badge would move, since redrawing throws away
    // anything half-typed in the card.
    if (wasActive !== scheduleActiveRuleId && $("#scheduleRules")) {
      renderScheduleRules(rules, scheduleActiveRuleId);
    }
  } catch {}
}

// ---------- Cereal (easter egg, Settings > Help) ----------
// Pastel lucky charms rain into the bowl, faster and faster. Click one to eat
// it. Rainbow pieces take out everything nearby. Fill the bowl and it's over.
const CEREAL_CHARMS = [
  { sh: "star", c: "#ffe3a3" },
  { sh: "heart", c: "#ffb9cf" },
  { sh: "moon", c: "#bfe1ff" },
  { sh: "clover", c: "#bdf0cf" },
  { sh: "diamond", c: "#d5c4ff" },
  { sh: "pillow", c: "#ffd0b3" },
  { sh: "oat", c: "#d9a86a" },
  { sh: "oat", c: "#c99155" },
];
const CHARM_R = 11;
// Fixed play field so difficulty never depends on the window size.
const BOWL_W = 460,
  BOWL_H = 300;
const BOWL_LEFT = 2,
  BOWL_RIGHT = 458;
const BOWL_BOTTOM = 298,
  BOWL_DEPTH = 0,
  BOWL_RIM = 26;
const bowlFloor = () => BOWL_BOTTOM;
let cerealTeardown = null;

function wireCereal() {
  const bowl = document.getElementById("cerealBowl");
  const btn = document.getElementById("btn-cereal");
  const again = document.getElementById("btn-cereal-again");
  const score = document.getElementById("cerealScore");
  const over = document.getElementById("cerealOver");
  if (!bowl || !btn) return;
  if (cerealTeardown) {
    cerealTeardown();
    cerealTeardown = null;
  }

  const R = CHARM_R;
  const G = 0.1; // gravity per frame — gentle
  const MAXV = 3.6; // terminal-ish speed
  let items = [];
  let raf = 0,
    spawnTimer = 0,
    running = false,
    gameEnded = false;
  let eaten = 0,
    gap = 640,
    overflow = 0;
  const ROUND_MS = 30000;
  let endsAt = 0,
    clockTimer = 0;

  const setScore = (t) => {
    if (score) score.textContent = t;
  };

  function reset() {
    bowl.querySelectorAll(".charm, .blast").forEach((el) => el.remove());
    items = [];
    eaten = 0;
    gap = 640;
    overflow = 0;
    gameEnded = false;
    clearInterval(clockTimer);
    clockTimer = 0;
    endsAt = 0;
    over && over.classList.remove("show");
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    clearTimeout(spawnTimer);
    clearInterval(clockTimer);
    clockTimer = 0;
  }
  function gameOver(reason) {
    stop();
    gameEnded = true;
    try {
      api.gameRecord?.(eaten)?.then?.(() => {
        try {
          renderStats?.();
        } catch {}
      });
    } catch {}
    const title = document.getElementById("cerealGameOverTitle");
    if (title) title.textContent = reason === "time" ? "TIME'S UP" : "GAME OVER";
    if (over) {
      const f = document.getElementById("cerealFinal");
      if (f) f.textContent = "Final score: " + eaten;
      over.classList.add("show");
    }
    btn.textContent = "🥣";
    setScore(reason === "time" ? "Time up — score: " + eaten : "Bowl overflowed — score: " + eaten);
  }
  const secsLeft = () => Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
  const showScore = () => setScore("Score: " + eaten + " · " + secsLeft() + "s left");
  function capacity() {
    return 210;
  }
  function spawnOne() {
    if (items.length > capacity() + 60) return; // safety net for the DOM
    const bomb = Math.random() < 0.1; // 10% of pieces are bombs
    const c = CEREAL_CHARMS[Math.floor(Math.random() * CEREAL_CHARMS.length)];
    const el = document.createElement("div");
    el.className = "charm sh-" + (bomb ? "pillow" : c.sh) + (bomb ? " bomb" : "");
    el.style.setProperty("--c", c.c);
    el.innerHTML = "<i></i>";
    bowl.appendChild(el);
    const item = {
      el,
      r: R,
      bomb,
      x: BOWL_LEFT + R + Math.random() * (BOWL_RIGHT - BOWL_LEFT - 2 * R),
      y: -R - Math.random() * 30,
      vx: (Math.random() - 0.5) * 1.1,
      vy: 0.2 + Math.random() * 0.4,
      a: Math.random() * 360,
      va: (Math.random() - 0.5) * 4,
    };
    items.push(item);
    draw(item);
  }
  function spawn() {
    if (!running) return;
    // Difficulty still rises continuously, but gently enough to keep pace by clicking.
    spawnOne();
    gap = Math.max(112, gap * 0.974);
    spawnTimer = setTimeout(spawn, gap + Math.random() * (gap * 0.2));
  }
  function draw(it) {
    it.el.style.transform =
      "translate(" + (it.x - it.r) + "px," + (it.y - it.r) + "px) rotate(" + it.a + "deg)";
  }
  function remove(item) {
    if (!items.includes(item)) return;
    item.el.classList.add("pop");
    setTimeout(() => item.el.remove(), 190);
    items = items.filter((o) => o !== item);
    for (const o of items) {
      if (Math.abs(o.x - item.x) < 4 * R && o.y < item.y) {
        o.vy += 0.3;
        o.vx += (Math.random() - 0.5) * 0.4;
      }
    }
    eaten++;
  }
  function boom(x, y, radius, depth = 0) {
    const fx = document.createElement("div");
    fx.className = "blast";
    const d = radius * 2;
    fx.style.width = d + "px";
    fx.style.height = d + "px";
    fx.style.left = x - radius + "px";
    fx.style.top = y - radius + "px";
    bowl.appendChild(fx);
    setTimeout(() => fx.remove(), 360);
    const chain = [];
    for (const o of items.slice()) {
      const dist = Math.hypot(o.x - x, o.y - y);
      if (dist <= radius) {
        // A bomb caught in a blast goes off too — that's the chain reaction.
        if (o.bomb && depth < 12) chain.push({ x: o.x, y: o.y });
        remove(o);
      } else if (dist <= radius * 1.8) {
        const n = Math.max(1, dist);
        o.vx += ((o.x - x) / n) * 2.2;
        o.vy += ((o.y - y) / n) * 2.2 - 0.6;
        o.va += (Math.random() - 0.5) * 8;
      }
    }
    for (const c of chain)
      setTimeout(() => {
        if (running) boom(c.x, c.y, radius, depth + 1);
      }, 70);
  }
  function eat(item) {
    if (!item.el.isConnected) return;
    if (item.bomb) {
      const x = item.x,
        y = item.y;
      remove(item);
      boom(x, y, R * 2 + 10); // roughly one piece width around it
    } else {
      remove(item);
    }
    if (running) showScore();
  }
  function tick() {
    if (!running) return;

    for (const it of items) {
      it.touch = false;
      it.vy = Math.min(MAXV, it.vy + G);
      it.vx *= 0.995;
      it.x += it.vx;
      it.y += it.vy;
      it.a += it.va;
      it.va *= 0.97;
    }

    // resolve overlaps + bounds (a few relaxation passes for a stable pile)
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < items.length; i++) {
        const a = items[i];
        for (let j = i + 1; j < items.length; j++) {
          const b = items[j];
          let dx = b.x - a.x,
            dy = b.y - a.y;
          const min = a.r + b.r - 2; // slight overlap = cosy pile
          if (Math.abs(dx) > min || Math.abs(dy) > min) continue;
          let d = Math.hypot(dx, dy);
          if (d === 0) {
            dx = (Math.random() - 0.5) * 0.5;
            dy = -0.5;
            d = Math.hypot(dx, dy);
          }
          if (d >= min) continue;
          const push = (min - d) / 2,
            nx = dx / d,
            ny = dy / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
          a.touch = b.touch = true;
          const rel = (b.vy - a.vy) * ny + (b.vx - a.vx) * nx;
          if (rel < 0) {
            const imp = rel * 0.5;
            a.vx += nx * imp;
            a.vy += ny * imp;
            b.vx -= nx * imp;
            b.vy -= ny * imp;
            a.va += (Math.random() - 0.5) * 0.6;
            b.va -= (Math.random() - 0.5) * 0.6;
          }
        }
        if (a.x < BOWL_LEFT + a.r) {
          a.x = BOWL_LEFT + a.r;
          a.vx = Math.abs(a.vx) * 0.35;
        }
        if (a.x > BOWL_RIGHT - a.r) {
          a.x = BOWL_RIGHT - a.r;
          a.vx = -Math.abs(a.vx) * 0.35;
        }
        // flat floor of the square
        const fy = bowlFloor() - a.r;
        if (a.y > fy) {
          a.y = fy;
          a.vy *= -0.18;
          a.vx *= 0.72;
          a.va *= 0.6;
          a.touch = true;
        }
      }
    }

    let spill = false;
    for (const it of items) {
      // rolling/resting friction only for pieces in contact with the pile or floor
      if (it.touch && Math.abs(it.vy) < 0.3) {
        it.vy *= 0.5;
        it.vx *= 0.9;
        it.va *= 0.85;
      }
      const settled = it.touch && Math.abs(it.vy) < 0.22 && Math.abs(it.vx) < 0.22;
      it.rest = settled ? (it.rest || 0) + 1 : 0;
      // only a piece genuinely at rest against the rim counts as overflowing
      if (it.rest > 30 && it.y - it.r <= BOWL_RIM) spill = true;
      draw(it);
    }
    if (items.length >= capacity()) spill = true;
    overflow = spill ? overflow + 1 : 0;
    if (overflow > 45) return gameOver("overflow");

    raf = requestAnimationFrame(tick);
  }

  function start() {
    if (running) {
      stop();
      btn.textContent = "🥣";
      setScore("Paused — score: " + eaten);
      return;
    }
    reset();
    running = true;
    endsAt = Date.now() + ROUND_MS;
    btn.textContent = "Stop";
    showScore();
    clockTimer = setInterval(() => {
      if (!running) return;
      if (Date.now() >= endsAt) {
        gameOver("time");
        return;
      }
      showScore();
    }, 250);
    spawn();
    raf = requestAnimationFrame(tick);
  }
  function handlePiecePointer(e) {
    if (!running) return;
    const target = e.target instanceof Element ? e.target.closest(".charm") : null;
    if (!target || !bowl.contains(target)) return;
    e.preventDefault();
    e.stopPropagation();
    const item = items.find((candidate) => candidate.el === target);
    if (item) eat(item);
  }
  btn.onclick = start;
  if (again)
    again.onclick = (e) => {
      e.stopPropagation();
      if (gameEnded) start();
    };
  bowl.addEventListener("pointerdown", handlePiecePointer);
  cerealTeardown = () => {
    stop();
    btn.onclick = null;
    if (again) again.onclick = null;
    bowl.removeEventListener("pointerdown", handlePiecePointer);
  };
}

// ---------- Fullscreen pause rows ----------
function syncFullscreenRows() {
  const on = !!$("#pauseOnFullscreen")?.checked;
  const mode = $("#pauseFullscreenMode")?.value || "all";
  const modeRow = $("#pauseFullscreenMode")?.closest(".row");
  const appsRow = $("#pauseFullscreenApps")?.closest(".row");
  const help = appsRow?.nextElementSibling;
  if (modeRow) modeRow.style.display = on ? "" : "none";
  const showApps = on && mode === "list";
  if (appsRow) appsRow.style.display = showApps ? "" : "none";
  if (help && help.classList.contains("help")) help.style.display = showApps ? "" : "none";
}

// ---------- Cache cleanup test ----------
// Everything inside the app counts in MB, but nobody thinks in thousands of
// megabytes: a 20 GB cache limit was being shown as 20480 MB.
function formatSize(mbValue) {
  const n = Math.max(0, Number(mbValue) || 0);
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} TB`;
  if (n >= 1024) return `${(n / 1024).toFixed(n >= 10240 ? 1 : 2)} GB`;
  if (n >= 10) return `${n.toFixed(0)} MB`;
  return `${n.toFixed(1)} MB`;
}
const mb = (n) => formatSize(n);
function renderCachePlan(plan, applied = false) {
  const esc = (s) =>
    String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  const lines = [];
  lines.push(
    `<div><strong>${plan.fileCount}</strong> files, ${mb(plan.beforeMB)} → ${mb(plan.afterMB)} (limit ${plan.limitMB} MB)</div>`,
  );
  if (!plan.removed.length) {
    lines.push(
      `<div style="margin-top:4px;">Cache is already under the limit — nothing ${applied ? "was" : "would be"} deleted.</div>`,
    );
  } else {
    lines.push(
      `<div style="margin-top:6px;">${applied ? "Deleted" : "Would delete"} ${plan.removed.length}, oldest first:</div>`,
    );
    lines.push(
      '<ul style="margin:4px 0 0 16px; padding:0;">' +
        plan.removed
          .map(
            (f) =>
              `<li>${esc(f.name)} — ${mb(f.sizeMB)} · ${new Date(f.mtime).toLocaleString()}</li>`,
          )
          .join("") +
        "</ul>",
    );
  }
  if (plan.skipped?.length) {
    lines.push(`<div style="margin-top:6px;">Protected (${plan.skipped.length}):</div>`);
    lines.push(
      '<ul style="margin:4px 0 0 16px; padding:0;">' +
        plan.skipped
          .map((f) => `<li>${esc(f.name)} — ${mb(f.sizeMB)} · ${esc(f.reason)}</li>`)
          .join("") +
        "</ul>",
    );
  }
  return lines.join("");
}

// Which shortcuts Windows actually granted.
//
// A global shortcut fails whenever another program already owns it, and until
// now that failure went nowhere: the key did nothing and the card looked fine.
// Held as a module value so re-rendering the card can put it straight back.
let hotkeyStatus = null;

function renderHotkeyStatus() {
  const el = $("#hk-status");
  if (!el) return;
  const st = hotkeyStatus;
  if (!st) {
    el.textContent = "\u00a0";
    el.className = "status";
    return;
  }
  const failed = st.failed || [];
  const registered = st.registered || [];
  if (failed.length) {
    const names = failed.map((f) => f.accel).join(", ");
    el.textContent = `Not available: ${names} \u2014 another program already has ${failed.length === 1 ? "it" : "them"}. Pick a different combination.`;
    el.className = "status err";
    return;
  }
  if (!registered.length) {
    // Not chk(): that helper is local to hydrateInputs and collect. Calling it
    // here threw a ReferenceError out of wireAllCards, which is the first thing
    // renderCards does, so every control in the window lost its wiring.
    const on = !!document.getElementById("hotkeysEnabled")?.checked;
    el.textContent = on ? "No shortcuts set." : "Shortcuts are switched off.";
    el.className = "status";
    return;
  }
  el.textContent = `${registered.length} shortcut${registered.length === 1 ? "" : "s"} active.`;
  el.className = "status ok";
}

// Things a Store build cannot do, explained where the control used to be.
//
// Windows owns start-up for a packaged app: it is a startup task the user
// switches on under Settings > Apps > Startup, and nothing the app writes to
// the registry changes it. A checkbox that silently did nothing would be worse
// than none, so it is disabled and the real place to go is named.
function applyStoreUi() {
  if (!storeManaged) return;
  const auto = $("#autoStart");
  if (auto) {
    auto.checked = false;
    auto.disabled = true;
  }
  const note = $("#startup-store-note");
  if (note) {
    note.style.display = "";
    note.textContent =
      'Windows controls start-up for Store apps: turn WallRaven on under Settings \u2192 Apps \u2192 Startup. "Start minimized to tray" still decides whether the window appears when it does.';
  }
}

// ---------- Updates card ----------
// Set once from the main process. The renderer has no way of knowing how the
// app was installed, and guessing from the path here would only duplicate the
// answer main.cjs already has.
let storeManaged = false;
let storeMessage = "";

function setUpdStatus(msg, kind = "") {
  const el = $("#upd-status");
  if (!el) return;
  el.textContent = msg || "\u00a0";
  el.className = "status" + (kind ? " " + kind : "");
}

function renderUpdatesCard() {
  const cur = (document.getElementById("app-version")?.textContent || "").replace(/^v/, "");
  const i = config?.updateInfo || {};
  const curEl = $("#upd-current");
  if (curEl) curEl.textContent = cur ? "v" + cur : "unknown";
  const latestEl = $("#upd-latest");
  if (!latestEl) return;

  // In a Microsoft Store build the app cannot update itself: the package lives
  // in a system-owned folder and the Store services it. Showing controls that
  // silently do nothing would be worse than showing none, so the card explains
  // who is in charge instead.
  const storeNote = $("#upd-store-note");
  if (storeManaged) {
    latestEl.textContent = "Managed by the Microsoft Store";
    for (const sel of [
      "#btn-upd-check",
      "#btn-upd-download",
      "#btn-upd-install",
      "#btn-upd-page",
    ]) {
      const b = $(sel);
      if (b) b.style.display = "none";
    }
    const autoRow = $("#autoInstallUpdates")?.closest(".row");
    if (autoRow) autoRow.style.display = "none";
    const autoHelp = $("#upd-help-auto");
    if (autoHelp) autoHelp.style.display = "none";
    if (storeNote) {
      storeNote.style.display = "";
      const t = $("#upd-store-text");
      if (t) t.textContent = storeMessage;
    }
    setUpdStatus("");
    return;
  }
  if (storeNote) storeNote.style.display = "none";

  const newer = !!i.latestVersion && cmpVersions(i.latestVersion, cur) > 0;
  latestEl.textContent = i.latestVersion
    ? `v${i.latestVersion}${newer ? " — update available" : " — you are up to date"}${i.checkedAt ? " (checked " + new Date(i.checkedAt).toLocaleString() + ")" : ""}`
    : "Not checked yet";
  const dl = $("#btn-upd-download"),
    inst = $("#btn-upd-install"),
    page = $("#btn-upd-page");
  const haveFile = !!i.downloadedFile && i.downloadedVersion === i.latestVersion;
  if (dl) dl.style.display = newer && i.downloadUrl && !haveFile ? "" : "none";
  if (inst) inst.style.display = newer && haveFile ? "" : "none";
  if (page) page.style.display = i.pageUrl || i.url ? "" : "none";
  if (i.error) setUpdStatus(i.error, "err");
  else if (haveFile) setUpdStatus("Installer downloaded and ready.", "ok");
}

function setApiKeyStatus(state, detail) {
  const el = $("#apikeyStatus");
  if (!el) return;
  if (state === "valid") {
    el.textContent = detail ? "✓ Validated — " + detail : "✓ Validated";
    el.className = "status ok";
  } else if (state === "invalid") {
    el.textContent = "✗ Invalid" + (detail ? " — " + detail : "");
    el.className = "status err";
  } else if (state === "unchecked") {
    el.textContent = "Not validated yet — click Validate";
    el.className = "status";
  } else {
    el.textContent = "Missing — no key entered";
    el.className = "status";
  }
}

// ---------- Welcome, and what's new ----------
//
// The changelog ships with the build and is already written for people rather
// than for a release engineer. Splitting each version into "New" and "Fixed"
// means the panel after an update can show what was added without reciting a
// list of things that used to be broken.
function parseChangelogVersions(md) {
  const out = [];
  let current = null;
  let bucket = "fixed";
  for (const raw of String(md || "").split(/\r?\n/)) {
    const line = raw.trim();
    // \S+ rather than a character class: a prerelease version has a hyphen in
    // it, and excluding hyphens turned 1.2.0-beta.1 into 1.2.0, which matches
    // no running build.
    const version = /^##\s+v?(\S+)/.exec(line);
    if (version) {
      current = { version: version[1], added: [], fixed: [] };
      bucket = "fixed";
      out.push(current);
      continue;
    }
    if (!current) continue;
    const section = /^###\s+(.+)$/.exec(line);
    if (section) {
      bucket = /new|added/i.test(section[1]) ? "added" : "fixed";
      continue;
    }
    const item = /^[-*]\s+(.*)$/.exec(line);
    if (item && item[1]) current[bucket].push(item[1]);
  }
  return out;
}

// Which panel to show, if any. A fresh install has never seen a version, and
// wants a welcome rather than a change list it has no context for.
function chooseIntro(currentVersion, lastSeenVersion, versions) {
  if (lastSeenVersion && lastSeenVersion === currentVersion) return null;
  if (!lastSeenVersion) return { kind: "welcome" };
  const entry = (versions || []).find((v) => v.version === currentVersion);
  const added = entry ? entry.added : [];
  if (!added.length) return null;
  return { kind: "whatsnew", version: currentVersion, added };
}

const WELCOME_HTML = `
  WallRaven changes your desktop wallpaper on a timer, using pictures from
  <strong>Wallhaven</strong> or from folders on this PC.
  <ul>
    <li><strong>Search &amp; filters</strong> decides what it looks for. <strong>Browse</strong> is for looking around without changing that.</li>
    <li><strong>Cycling</strong> sets how often it changes. <strong>Timetable</strong> switches sources at times of day, if you want that.</li>
    <li>The buttons in the title bar act on the wallpaper on screen: like it, skip it, or go back to the last one.</li>
  </ul>
  It runs in the system tray, so closing this window leaves it running.`;

async function showIntroPanel() {
  const panel = $("#intro-panel");
  if (!panel) return;
  const version = (document.getElementById("app-version")?.textContent || "").replace(/^v/, "");
  let versions = [];
  try {
    versions = parseChangelogVersions(await api.changelog());
  } catch {}
  const choice = chooseIntro(version, config?.lastSeenVersion || "", versions);
  if (!choice) return;

  const title = $("#intro-title"),
    body = $("#intro-body");
  if (choice.kind === "welcome") {
    if (title) title.textContent = "Welcome to WallRaven";
    if (body) body.innerHTML = WELCOME_HTML;
  } else {
    if (title) title.textContent = `What's new in ${choice.version}`;
    if (body)
      body.innerHTML =
        "<ul>" + choice.added.map((item) => `<li>${renderInline(item)}</li>`).join("") + "</ul>";
  }
  panel.style.display = "";

  const dismiss = async () => {
    panel.style.display = "none";
    try {
      config = await api.setConfig({ lastSeenVersion: version });
    } catch {}
  };
  const btn = $("#intro-dismiss");
  if (btn) btn.onclick = dismiss;
}

// Bold and code only. The changelog is ours, but it is still content being put
// into innerHTML, so everything else is escaped.
function renderInline(text) {
  const esc = String(text).replace(
    /[&<>]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c],
  );
  return esc
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

async function loadChangelog() {
  const el = $("#changelog");
  if (!el) return;
  try {
    const md = await api.changelog();
    el.innerHTML = renderMarkdown(md);
  } catch {
    el.textContent = "Could not load the changelog.";
  }
}

// Tiny markdown renderer — headings, list items, bold, inline code.
function renderMarkdown(md) {
  const esc = (s) =>
    String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  const inline = (s) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--text)">$1</strong>')
      .replace(/`(.+?)`/g, "<code>$1</code>");
  const out = [];
  let inList = false;
  for (const raw of String(md).split(/\r?\n/)) {
    const line = raw.trimEnd();
    const li = line.match(/^\s*[-*]\s+(.*)$/);
    if (li) {
      if (!inList) {
        out.push('<ul style="margin:4px 0 10px 16px; padding:0;">');
        inList = true;
      }
      out.push(`<li>${inline(li[1])}</li>`);
      continue;
    }
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const size = h[1].length === 1 ? 15 : h[1].length === 2 ? 13.5 : 13;
      out.push(
        `<div style="color:var(--text); font-weight:600; font-size:${size}px; margin:12px 0 4px;">${inline(h[2])}</div>`,
      );
      continue;
    }
    if (!line) continue;
    out.push(`<div style="margin:0 0 6px;">${inline(line)}</div>`);
  }
  if (inList) out.push("</ul>");
  return out.join("");
}

function cmpVersions(a, b) {
  const norm = (v) =>
    String(v || "")
      .replace(/^v/i, "")
      .split(/[.-]/)
      .map((x) => (/^\d+$/.test(x) ? Number(x) : x));
  const A = norm(a),
    B = norm(b);
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    const x = A[i] ?? 0,
      y = B[i] ?? 0;
    if (x === y) continue;
    if (typeof x === "number" && typeof y === "number") return x - y;
    return String(x).localeCompare(String(y));
  }
  return 0;
}

async function refreshUpdateBanner() {
  const info = config?.updateInfo || {};
  const banner = $("#update-banner");
  if (!banner) return;
  // Never nag about a version the Store will bring on its own -- and never
  // show a stale one left behind by an earlier, non-Store install.
  if (storeManaged) {
    banner.style.display = "none";
    return;
  }
  const cur = (document.getElementById("app-version")?.textContent || "").replace(/^v/, "");
  if (!info.latestVersion || info.latestVersion === info.dismissed) {
    banner.style.display = "none";
    return;
  }
  // Only advertise strictly newer versions — never the same or an older one.
  if (cmpVersions(info.latestVersion, cur) <= 0) {
    banner.style.display = "none";
    return;
  }
  banner.style.display = "";
  $("#update-banner-text").textContent = `WallRaven v${info.latestVersion} is available.`;

  $("#update-banner-link").onclick = (e) => {
    e.preventDefault();
    api.openExternal(info.url);
  };
  $("#update-banner-dismiss").onclick = async (e) => {
    e.preventDefault();
    await api.updateDismiss(info.latestVersion);
    config = await api.getConfig();
    refreshUpdateBanner();
  };
}

// ---------- Presets ----------
// Fields captured in a preset (everything except API key, theme, startup, notifications, username)
const PRESET_FIELDS = [
  "query",
  "categories",
  "purity",
  "sorting",
  "topRange",
  "aiArtFilter",
  "atleastResolution",
  "resolutions",
  "ratios",
  "colors",
  "cycleMinutes",
  "cacheMaxMB",
  "sourceMode",
  "collectionId",
  "cardOrder",
  "collapsed",
];
// Built-in presets - always available, cannot be deleted. All defaults:
// SFW only, current screen resolution + aspect ratio, no colour filter,
// AI art excluded, random sort unless noted.
const BASE_BUILTIN = {
  purity: { sfw: true, sketchy: false, nsfw: false },
  sorting: "random",
  order: "desc",
  topRange: "1M",
  aiArtFilter: 1,
  atleastResolution: "__current__",
  resolutions: "",
  ratios: "__current__",
  colors: [],
  sourceMode: "search",
  collectionId: null,
};
const BUILTIN_PRESETS = {
  Default: {
    ...BASE_BUILTIN,
    query: "",
    categories: { general: true, anime: false, people: false },
    cycleMinutes: 30,
    cacheMaxMB: 1024,
    sourceMode: "search",
    collectionId: null,
    cardOrder: DEFAULT_ORDER.slice(),
    collapsed: {},
  },
  General: {
    ...BASE_BUILTIN,
    query: "",
    categories: { general: true, anime: false, people: false },
  },
  Anime: { ...BASE_BUILTIN, query: "", categories: { general: false, anime: true, people: false } },
  People: {
    ...BASE_BUILTIN,
    query: "",
    categories: { general: false, anime: false, people: true },
  },
  Nature: {
    ...BASE_BUILTIN,
    query: "nature",
    categories: { general: true, anime: false, people: false },
  },
  Toplist: {
    ...BASE_BUILTIN,
    query: "",
    sorting: "toplist",
    topRange: "1M",
    categories: { general: true, anime: false, people: false },
  },
  Latest: {
    ...BASE_BUILTIN,
    query: "",
    sorting: "date_added",
    categories: { general: true, anime: false, people: false },
  },
};
function snapshotPreset() {
  const c = collect();
  const out = {};
  for (const k of PRESET_FIELDS) out[k] = c[k];
  return out;
}
function refreshPresetsUI() {
  const sel = $("#presetSelect");
  if (!sel) return;
  const presets = (config && config.presets) || {};
  const names = Object.keys(presets).sort((a, b) => a.localeCompare(b));
  const active = config?.activePreset || "";
  const builtinNames = Object.keys(BUILTIN_PRESETS);
  const builtinHtml =
    '<optgroup label="Built-in">' +
    builtinNames
      .map(
        (n) =>
          `<option value="__builtin__:${n}"${"__builtin__:" + n === active ? " selected" : ""}>${n}</option>`,
      )
      .join("") +
    "</optgroup>";
  const userHtml = names.length
    ? '<optgroup label="Your presets">' +
      names
        .map((n) => `<option value="${n}"${n === active ? " selected" : ""}>${n}</option>`)
        .join("") +
      "</optgroup>"
    : "";
  sel.innerHTML = '<option value="">- pick a preset -</option>' + builtinHtml + userHtml;
}
function resolvePreset(name) {
  if (name && name.startsWith("__builtin__:"))
    return BUILTIN_PRESETS[name.slice("__builtin__:".length)] || null;
  return config?.presets?.[name] || null;
}
function wirePresets() {
  if (!$("#presetSelect")) return;
  refreshPresetsUI();
  $("#btn-preset-save").onclick = async () => {
    const name = ($("#presetName").value || "").trim();
    if (!name) {
      flash("Enter a preset name first", "err");
      return;
    }
    if (BUILTIN_PRESETS[name]) {
      flash("That name is reserved by a built-in preset", "err");
      return;
    }
    const presets = { ...(config.presets || {}) };
    presets[name] = snapshotPreset();
    config = await api.setConfig({ presets, activePreset: name });
    $("#presetName").value = "";
    refreshPresetsUI();
    flash(`Preset “${name}” saved`, "ok");
  };
  $("#btn-preset-apply").onclick = async () => {
    const name = $("#presetSelect").value;
    const preset = resolvePreset(name);
    if (!preset) {
      flash("Pick a preset first", "err");
      return;
    }
    // Resolve the "__current__" sentinels to the actual screen resolution /
    // aspect ratio before persisting — Wallhaven's API doesn't understand
    // that placeholder and would silently ignore the filter, returning any
    // resolution or aspect ratio. We need real values like "3840x2160" / "16x9".
    const dpr = window.devicePixelRatio || 1;
    const sw = Math.round(screen.width * dpr),
      sh = Math.round(screen.height * dpr);
    const CANDIDATES = [
      { v: "16x9", r: 16 / 9 },
      { v: "16x10", r: 16 / 10 },
      { v: "21x9", r: 21 / 9 },
      { v: "32x9", r: 32 / 9 },
      { v: "4x3", r: 4 / 3 },
      { v: "5x4", r: 5 / 4 },
      { v: "9x16", r: 9 / 16 },
      { v: "10x16", r: 10 / 16 },
    ];
    const actual = sw / sh;
    let bestRatio = CANDIDATES[0],
      bestD = Infinity;
    for (const c2 of CANDIDATES) {
      const d = Math.abs(c2.r - actual);
      if (d < bestD) {
        bestD = d;
        bestRatio = c2;
      }
    }
    const resolved = { ...preset };
    if (resolved.atleastResolution === "__current__") resolved.atleastResolution = `${sw}x${sh}`;
    if (typeof resolved.ratios === "string") {
      const parts = resolved.ratios
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const out = new Set();
      for (const v of parts) out.add(v === "__current__" ? bestRatio.v : v);
      resolved.ratios = [...out].join(",");
    }
    // A preset describes a search. If the app is currently cycling a playlist,
    // folder or collection, the preset's filters would be ignored and the same
    // wallpaper would keep showing — so switch back to searching.
    if (
      resolved.sourceMode !== "playlist" &&
      resolved.sourceMode !== "folder" &&
      resolved.sourceMode !== "collection"
    ) {
      resolved.sourceMode = "search";
    }
    // Merge preset over current config, then re-render.
    config = await api.setConfig({ ...resolved, activePreset: name });

    cardOrder = migrateCardOrder(
      Array.isArray(config.cardOrder) && config.cardOrder.length ? config.cardOrder : DEFAULT_ORDER,
    );
    collapsed =
      config.collapsed && typeof config.collapsed === "object" ? { ...config.collapsed } : {};
    renderCards();
    hydrateInputs(config);
    await loadHistory();
    await refreshInfo();
    const label = name.startsWith("__builtin__:") ? name.slice("__builtin__:".length) : name;
    flash(`Applied preset “${label}”`, "ok");
    await showPresetResult(label);
  };
  $("#btn-preset-overwrite").onclick = async () => {
    const name = $("#presetSelect").value;
    if (!name) {
      flash("Pick a preset to overwrite first", "err");
      return;
    }
    if (name.startsWith("__builtin__:")) {
      flash("Built-in presets can\u2019t be overwritten", "err");
      return;
    }
    if (!config?.presets?.[name]) {
      flash("Pick a saved preset first", "err");
      return;
    }
    const presets = { ...config.presets };
    presets[name] = snapshotPreset();
    config = await api.setConfig({ presets, activePreset: name });
    refreshPresetsUI();
    flash(`Preset “${name}” overwritten with current settings`, "ok");
  };
  $("#btn-preset-delete").onclick = async () => {
    const name = $("#presetSelect").value;
    if (name.startsWith("__builtin__:")) {
      flash("Built-in presets can\u2019t be deleted", "err");
      return;
    }
    if (!name || !config?.presets?.[name]) {
      flash("Pick a saved preset first", "err");
      return;
    }
    const presets = { ...config.presets };
    delete presets[name];
    const activePreset = config.activePreset === name ? "" : config.activePreset;
    config = await api.setConfig({ presets, activePreset });
    refreshPresetsUI();
    flash(`Deleted preset “${name}”`, "ok");
  };
}

// ---------- Preset library + community presets ----------
// Search intent only — never a timetable (see cloud.cjs for why).
const SHARE_FIELDS = [
  "query",
  "categories",
  "purity",
  "sorting",
  "order",
  "topRange",
  "aiArtFilter",
  "colors",
];
let libState = { category: "", search: "", sort: "copied" };
let libBuiltins = null;
let libItems = [];

function libCats(list) {
  return list && list.length
    ? list
    : [
        "Videogames",
        "Anime",
        "Nature",
        "Cars",
        "Abstract",
        "Space",
        "Minimal",
        "Cityscape",
        "Fantasy & Sci-Fi",
        "Animals",
        "Seasonal",
        "Moods",
        "Other",
      ];
}
function expandBuiltinData(d) {
  const out = {};
  for (const k of SHARE_FIELDS) if (d[k] !== undefined) out[k] = d[k];
  if (Array.isArray(d.cats)) {
    out.categories = {
      general: d.cats.includes("general"),
      anime: d.cats.includes("anime"),
      people: d.cats.includes("people"),
    };
  }
  if (out.purity === undefined) out.purity = { sfw: true, sketchy: false, nsfw: false };
  if (out.aiArtFilter === undefined) out.aiArtFilter = 1;
  if (out.sorting === undefined) out.sorting = "random";
  if (out.colors === undefined) out.colors = [];
  return out;
}
function libSummary(d) {
  const bits = [];
  if (d.query) bits.push("“" + d.query + "”");
  const cats =
    d.categories ||
    (Array.isArray(d.cats)
      ? {
          general: d.cats.includes("general"),
          anime: d.cats.includes("anime"),
          people: d.cats.includes("people"),
        }
      : null);
  if (cats) {
    const on = Object.keys(cats).filter((k) => cats[k]);
    if (on.length) bits.push(on.join(" + "));
  }
  if (d.sorting) bits.push(String(d.sorting).replace("_", " "));
  if (Array.isArray(d.colors) && d.colors.length)
    bits.push(d.colors.length + " colour" + (d.colors.length > 1 ? "s" : ""));
  if (d.schedule && Array.isArray(d.schedule.rules) && d.schedule.rules.length)
    bits.push(d.schedule.rules.length + "-rule schedule");

  return bits.join(" · ") || "No filters";
}
// Applying a preset should show its effect straight away, otherwise nothing
// visibly happens until the next scheduled change.
async function showPresetResult(label) {
  const before = currentWp && currentWp.id ? String(currentWp.id) : "";
  try {
    flash("Fetching a wallpaper for “" + label + "”…");
    await api.next();
    await loadHistory();
    await refreshInfo();
    const after = currentWp && currentWp.id ? String(currentWp.id) : "";
    if (before && after && before === after) {
      flash(
        "Applied “" +
          label +
          "” — but the wallpaper didn’t change. Try “Next wallpaper”, or widen the filters.",
        "err",
      );
    } else {
      flash("Applied “" + label + "” — wallpaper updated", "ok");
    }
  } catch (err) {
    flash("Applied “" + label + "”, but no wallpaper matched: " + err.message, "err");
  }
}
async function applySharedPreset(data, label) {
  const patch = {};
  for (const k of SHARE_FIELDS) if (data[k] !== undefined) patch[k] = data[k];
  // Older shared presets may still contain the sharer's timetable — drop it.
  delete patch.schedule;
  // Shared presets are searches. If the app is cycling a playlist, folder or
  // collection right now, those filters would never be used and the wallpaper
  // would appear stuck, so put it back on search.
  patch.sourceMode = "search";
  // Adult results need the user's own Wallhaven API key; without one every
  // search comes back empty, so apply the rest as safe results and say so.
  let keyWarning = "";
  const wantsAdult = patch.purity && (patch.purity.nsfw || patch.purity.sketchy);
  if (wantsAdult && !((config && config.apiKey) || "").trim()) {
    patch.purity = { sfw: true, sketchy: false, nsfw: false };
    keyWarning =
      " — needs your own Wallhaven API key for adult results, using safe results instead";
  }
  config = await api.setConfig(patch);
  hydrateInputs(config);
  await refreshInfo();
  flash("Applied “" + label + "”" + keyWarning, keyWarning ? "err" : "ok");
  await showPresetResult(label);
}

function renderLibList() {
  const host = $("#libList");
  if (!host) return;
  host.innerHTML = "";
  if (!libItems.length) {
    host.innerHTML = '<div class="help">No presets match that filter.</div>';
    return;
  }
  for (const item of libItems) {
    const row = document.createElement("div");
    row.style.cssText =
      "display:flex; flex-direction:column; gap:8px; padding:8px; border:1px solid var(--border, #2a2a35); border-radius:8px;";
    const head = document.createElement("div");
    head.style.cssText = "display:flex; gap:8px; align-items:flex-start; min-width:0;";
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex; gap:6px; flex-wrap:wrap;";
    const thumb = document.createElement("div");
    thumb.style.cssText =
      "width:76px; height:48px; flex:0 0 76px; border-radius:6px; overflow:hidden; background:var(--panel-2, #22222c);";
    const thumbImg = document.createElement("img");
    thumbImg.style.cssText =
      "width:100%; height:100%; object-fit:cover; opacity:0; transition:opacity .25s;";
    thumbImg.alt = "";
    thumb.appendChild(thumbImg);
    head.appendChild(thumb);
    // Only look a thumbnail up once the row is actually scrolled into view —
    // Wallhaven rate-limits hard, and off-screen presets don't need previews.
    const loadThumb = async () => {
      const data = item.data || {};
      const res = await api.presetThumb({
        query: data.query || "",
        categories: data.categories,
        purity: data.purity,
        sorting: data.sorting,
      });
      if (res && res.url) {
        thumbImg.src = res.url;
        thumbImg.style.opacity = "1";
      }
    };
    if (typeof IntersectionObserver === "function") {
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            io.disconnect();
            loadThumb().catch(() => {});
          }
        },
        { rootMargin: "120px" },
      );
      io.observe(thumb);
    } else {
      loadThumb().catch(() => {});
    }

    const meta = document.createElement("div");
    meta.style.cssText = "flex:1 1 auto; min-width:0;";
    const sub = item.official
      ? item.category +
        " · included with WallRaven" +
        (item.description ? " · " + item.description : "")
      : item.category +
        " · by " +
        (item.author_name || "Anonymous") +
        " · " +
        (item.copy_count || 0) +
        " copies";
    meta.innerHTML =
      '<div style="font-weight:600; font-size:13px; overflow-wrap:anywhere;"></div><div style="font-size:11px; color:var(--muted); overflow-wrap:anywhere;"></div><div style="font-size:11px; color:var(--muted); margin-top:2px; overflow-wrap:anywhere;"></div>';
    meta.children[0].textContent = item.name;
    meta.children[1].textContent = sub;
    meta.children[2].textContent = libSummary(item.data || {});
    head.appendChild(meta);
    row.appendChild(head);
    row.appendChild(actions);

    const apply = document.createElement("button");
    apply.className = "btn secondary";
    apply.type = "button";
    apply.textContent = "Apply";
    apply.onclick = async () => {
      const data = item.data || {};
      await applySharedPreset(data, item.name);
      if (!item.official) api.presetCopied({ id: item.id });
    };
    actions.appendChild(apply);

    const save = document.createElement("button");
    save.className = "btn secondary";
    save.type = "button";
    save.textContent = "Save copy";
    save.title = "Save this as one of your own presets";
    save.onclick = async () => {
      const data = item.data || {};
      const presets = { ...(config.presets || {}) };
      let name = item.name;
      let n = 2;
      while (presets[name]) name = item.name + " " + n++;
      presets[name] = data;
      config = await api.setConfig({ presets });
      refreshPresetsUI();
      refreshShareSources();
      flash("Saved “" + name + "” to your presets", "ok");
    };
    actions.appendChild(save);

    if (!item.official) {
      if (item.mine) {
        const del = document.createElement("button");
        del.className = "btn secondary";
        del.type = "button";
        del.textContent = "Unshare";
        del.onclick = async () => {
          const res = await api.presetUnpublish({ id: item.id });
          if (res && res.ok) {
            flash("Preset unshared", "ok");
            refreshLibList();
          } else flash("Could not unshare that preset", "err");
        };
        actions.appendChild(del);
      }
    }
    host.appendChild(row);
  }
}
async function refreshLibList() {
  const host = $("#libList");
  if (!host) return;
  host.innerHTML = '<div class="help">Loading…</div>';
  // One list: the presets that ship with WallRaven first, then shared ones.
  if (!libBuiltins) libBuiltins = await api.presetBuiltins();
  const q = libState.search.toLowerCase();
  const official = (libBuiltins.presets || [])
    .filter(
      (p) =>
        (!libState.category || p.category === libState.category) &&
        (!q ||
          (p.name + " " + (p.description || "") + " " + (p.data?.query || ""))
            .toLowerCase()
            .includes(q)),
    )
    .map((p) => ({ ...p, official: true, data: expandBuiltinData(p.data || {}) }));
  let shared = [];
  try {
    const res = await api.presetBrowse({
      category: libState.category,
      search: libState.search,
      sort: libState.sort,
      limit: 60,
    });
    shared = (res && res.items) || [];
  } catch {
    shared = [];
  }
  libItems = official.concat(shared);
  renderLibList();
}
function refreshShareSources() {
  const sel = $("#shareSource");
  if (!sel) return;
  const names = Object.keys(config?.presets || {}).sort((a, b) => a.localeCompare(b));
  sel.innerHTML =
    '<option value="__current__">Current settings</option>' +
    names
      .map((n) => '<option value="' + n.replace(/"/g, "&quot;") + '">' + n + "</option>")
      .join("");
}
function wireCommunity() {
  if (!$("#libList")) return;
  const catSel = $("#libCategory");
  const shareCat = $("#shareCategory");
  (async () => {
    if (!libBuiltins) libBuiltins = await api.presetBuiltins();
    const cats = libCats(libBuiltins.categories);
    if (!cats.includes("Other")) cats.push("Other");
    catSel.innerHTML =
      '<option value="">All categories</option>' +
      cats.map((c) => "<option>" + c + "</option>").join("");
    shareCat.innerHTML = cats.map((c) => "<option>" + c + "</option>").join("");
    refreshLibList();
  })();

  catSel.onchange = () => {
    libState.category = catSel.value;
    refreshLibList();
  };
  $("#libSort").onchange = (e) => {
    libState.sort = e.target.value;
    refreshLibList();
  };
  let searchTimer = null;
  $("#libSearch").oninput = (e) => {
    clearTimeout(searchTimer);
    const v = e.target.value.trim();
    searchTimer = setTimeout(() => {
      libState.search = v;
      refreshLibList();
    }, 300);
  };
  refreshShareSources();

  $("#btn-open-gallery").onclick = () => api.accountOpenWeb("/presets");

  // Account username — lives on your WallRaven account, separate from your email.
  const authorInput = $("#shareAuthor");
  const usernameHint = $("#usernameHint");
  const USERNAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{2,23}$/;

  // Changing the username is deliberate: the field is locked until Change is
  // pressed, a change asks first, and the database allows one change every 30
  // days after the first (see supabase/migrations/20261006120000). Claiming a
  // name for the first time needs none of that.
  const cancelAuthorBtn = $("#btn-cancel-author");
  const saveAuthorBtn = $("#btn-save-author");
  let account = { username: null, nextChangeAt: null, signedIn: false };
  let editingUsername = false;

  const longDate = (iso) =>
    new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

  function renderUsername() {
    if (!authorInput || !saveAuthorBtn) return;
    const claimed = account.signedIn && !!account.username;
    const locked = claimed && !editingUsername;
    authorInput.readOnly = locked;
    authorInput.classList.toggle("readonly", locked);
    if (cancelAuthorBtn) cancelAuthorBtn.hidden = !(claimed && editingUsername);
    if (!claimed) {
      saveAuthorBtn.textContent = account.signedIn ? "Claim username" : "Save username";
      saveAuthorBtn.disabled = false;
      saveAuthorBtn.title = "Save your username — it lives on your account and applies on every machine";
      return;
    }
    if (editingUsername) {
      saveAuthorBtn.textContent = "Save username";
      saveAuthorBtn.disabled = false;
      saveAuthorBtn.title = "Change your username";
      return;
    }
    saveAuthorBtn.textContent = "Change…";
    const waiting = account.nextChangeAt && Date.parse(account.nextChangeAt) > Date.now();
    saveAuthorBtn.disabled = !!waiting;
    saveAuthorBtn.title = waiting
      ? "You can change your username again on " + longDate(account.nextChangeAt)
      : "Change your username";
    if (usernameHint)
      usernameHint.textContent = waiting
        ? "Changed recently. You can change it again on " + longDate(account.nextChangeAt) + "."
        : "This is the name shown on presets you share. Changing it is limited to once every 30 days.";
  }

  async function loadUsername() {
    if (!authorInput) return;
    const res = await api.accountGetUsername();
    if (res && res.ok) {
      account = { username: res.username || null, nextChangeAt: res.nextChangeAt || null, signedIn: true };
      authorInput.value = res.username || "";
    } else if (res && res.reason === "signed_out") {
      account = { username: null, nextChangeAt: null, signedIn: false };
      authorInput.value = config.communityAuthor || "";
      if (usernameHint) usernameHint.textContent = "Sign in to claim a username for your account.";
    }
    editingUsername = false;
    renderUsername();
  }
  loadUsername();
  // Signing in or out mid-session changes whose username this is.
  api.onAccountChanged?.((st) => {
    if (!!st?.signedIn !== account.signedIn) loadUsername();
  });

  let checkTimer = null;
  if (authorInput)
    authorInput.oninput = () => {
      if (authorInput.readOnly) return;
      const v = (authorInput.value || "").trim();
      clearTimeout(checkTimer);
      if (!usernameHint) return;
      if (!USERNAME_RE.test(v)) {
        usernameHint.textContent = "3–24 characters: letters, numbers, dot, dash or underscore.";
        return;
      }
      if (account.username && v === account.username) {
        usernameHint.textContent = "That is your current username.";
        return;
      }
      usernameHint.textContent = "Checking availability…";
      checkTimer = setTimeout(async () => {
        const res = await api.accountCheckUsername(v);
        if (!res || !res.ok) {
          usernameHint.textContent = "Could not check availability right now.";
          return;
        }
        usernameHint.textContent = res.available
          ? "“" + v + "” is available."
          : "“" + v + "” is already taken.";
      }, 400);
    };

  if (cancelAuthorBtn && authorInput)
    cancelAuthorBtn.onclick = () => {
      clearTimeout(checkTimer);
      editingUsername = false;
      authorInput.value = account.username || "";
      renderUsername();
    };

  if (saveAuthorBtn && authorInput)
    saveAuthorBtn.onclick = async () => {
      const claimed = account.signedIn && !!account.username;
      if (claimed && !editingUsername) {
        editingUsername = true;
        renderUsername();
        if (usernameHint)
          usernameHint.textContent =
            "Pick carefully: after this change you cannot change it again for 30 days.";
        authorInput.focus();
        authorInput.select();
        return;
      }

      const wanted = (authorInput.value || "").trim();
      if (!USERNAME_RE.test(wanted)) {
        flash("Usernames are 3–24 characters: letters, numbers, dot, dash or underscore", "err");
        return;
      }
      if (claimed && wanted === account.username) {
        editingUsername = false;
        renderUsername();
        return;
      }
      if (
        claimed &&
        !confirm(
          "Change your username from “" +
            account.username +
            "” to “" +
            wanted +
            "”?\n\nPresets you have shared will show the new name, and you will not be able to change it again for 30 days. Your old name becomes free for anyone to claim.",
        )
      )
        return;

      saveAuthorBtn.disabled = true;
      const res = await api.accountSetUsername(wanted);
      saveAuthorBtn.disabled = false;
      if (res && res.ok) {
        account = { username: res.username, nextChangeAt: res.nextChangeAt || null, signedIn: true };
        editingUsername = false;
        authorInput.value = res.username;
        config = await api.setConfig({ communityAuthor: res.username });
        renderUsername();
        flash("Username saved — shared presets now show “by " + res.username + "”", "ok");
        refreshLibList();
      } else if (res && res.reason === "cooldown") {
        account.nextChangeAt = res.nextChangeAt || account.nextChangeAt;
        editingUsername = false;
        authorInput.value = account.username || "";
        renderUsername();
        flash(
          "You can change your username again on " +
            (res.nextChangeAt ? longDate(res.nextChangeAt) : "a later date"),
          "err",
        );
      } else if (res && res.reason === "taken") {
        flash("That username is already taken", "err");
      } else if (res && res.reason === "signed_out") {
        config = await api.setConfig({ communityAuthor: wanted });
        flash("Saved locally — sign in to claim this username on your account", "ok");
      } else if (res && res.reason === "invalid") {
        flash("That username is not allowed", "err");
      } else {
        flash("Could not save your username", "err");
      }
    };

  $("#btn-share-preset").onclick = async () => {
    const src = $("#shareSource").value;
    const name = ($("#shareName").value || "").trim() || (src !== "__current__" ? src : "");
    if (!name) {
      flash("Give the shared preset a name first", "err");
      return;
    }
    const data = src === "__current__" ? await api.presetShareable() : (config.presets || {})[src];
    if (!data) {
      flash("Could not read that preset", "err");
      return;
    }
    const res = await api.presetPublish({
      name,
      description: ($("#shareDesc").value || "").trim(),
      category: $("#shareCategory").value || "Other",
      authorName: ((authorInput && authorInput.value) || "").trim(),
      data,
    });
    if (res && res.ok) {
      $("#shareName").value = "";
      $("#shareDesc").value = "";
      flash("Shared “" + name + "” with the community", "ok");
      refreshLibList();
    } else if (res && res.reason === "signed_out") {
      flash("Sign in under Account & cloud sync to share presets", "err");
    } else {
      flash("Could not share that preset", "err");
    }
  };
}

// Show a status message. All feedback goes to the single header toast
// slot (next to Fade/Next/Save) — never inline inside cards, which caused
// the current-wallpaper module to elongate/shrink on every update.
// action: optional { label, run } for a button in the toast, used for Undo.
// A toast with an action stays up longer, long enough to reach for it.
function flash(msg, kind, action) {
  const stack = document.getElementById("toast-stack");
  if (!stack || !msg) return;
  clearTimeout(stack._fadeTimer);
  clearTimeout(stack._removeTimer);
  const t = document.createElement("div");
  t.className = "toast " + (kind || "");
  t.textContent = msg;
  const hasAction = action && typeof action === "object" && typeof action.run === "function";
  if (hasAction) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "toast-action";
    b.textContent = action.label || "Undo";
    b.onclick = async () => {
      b.disabled = true;
      clearTimeout(stack._fadeTimer);
      clearTimeout(stack._removeTimer);
      t.remove();
      try {
        await action.run();
      } catch (e) {
        flash((e && e.message) || "That did not work", "err");
      }
    };
    t.appendChild(b);
  }
  stack.replaceChildren(t);
  const life = hasAction ? 9000 : 4200;
  stack._fadeTimer = setTimeout(() => {
    t.style.transition = "opacity .25s";
    t.style.opacity = "0";
  }, life);
  stack._removeTimer = setTimeout(() => {
    if (stack.firstElementChild === t) t.remove();
  }, life + 400);
}

async function refreshInfo() {
  const info = await api.info();
  currentWp = info.current || null;
  const has = !!currentWp;
  const bo = $("#btn-open"),
    bf = $("#btn-folder");
  if (bo) bo.disabled = !has;
  if (bf) bf.disabled = !has;
  const hp = document.getElementById("hdr-prev");
  if (hp) hp.disabled = !info.canBack;
  if (typeof info.paused === "boolean") {
    cyclePaused = info.paused;
    renderPlayPause?.();
  }
  const thumb = $("#thumb"),
    meta = $("#meta");
  if (thumb && meta) {
    const prevId = thumb.dataset.wpId || "";
    if (has && currentWp.id && currentWp.id !== prevId) {
      thumb.classList.add("fade");
      setTimeout(() => thumb.classList.remove("fade"), 60);
    }
    if (has) {
      thumb.dataset.wpId = currentWp.id || "";
      thumb.style.backgroundImage = `url("file://${currentWp.file.replace(/\\/g, "/")}")`;
      const pinnedTxt = info.pinnedMB > 0.05 ? ` (${formatSize(info.pinnedMB)} kept)` : "";
      meta.innerHTML = `<strong>${currentWp.id}</strong>${currentWp.resolution || ""} • cached ${formatSize(info.cacheMB)} of ${formatSize(config?.cacheMaxMB || 0)}${pinnedTxt} • ${info.historyCount} in history`;
    } else {
      thumb.style.backgroundImage = "";
      meta.innerHTML =
        "No wallpaper yet. Press <strong>Next</strong> (the right arrow in the top bar).";
    }
  }
  renderHeaderThumb();
  renderWhy();
  renderCarousel();
  renderHistory();
  const sub = document.querySelector('[data-id="history"] [data-role="sub"]');
  if (sub) sub.textContent = historyItems.length ? `- ${historyItems.length}` : "";
  const cs = $("#cacheStats");
  if (cs) {
    const total = info.cacheMB || 0,
      pinned = info.pinnedMB || 0,
      max = config?.cacheMaxMB || 0;
    cs.innerHTML = `Using <strong>${formatSize(total)}</strong> of ${formatSize(max)} &nbsp;·&nbsp; Kept for good <strong style="color:var(--accent)">${formatSize(pinned)}</strong> &nbsp;·&nbsp; Can be deleted <strong>${formatSize(Math.max(0, total - pinned))}</strong>`;
  }
  renderPlaylistUI();
  renderFavourites();
  renderStats?.();
}

// Put the wallpaper on screen into the title bar, beside the buttons that act
// on it.
function renderHeaderThumb() {
  const el = document.getElementById("hdr-thumb");
  if (!el) return;
  const file = currentWp && currentWp.file;
  renderHeaderReactions();
  if (!file) {
    el.classList.remove("has-image");
    el.style.backgroundImage = "";
    return;
  }
  el.style.backgroundImage = `url("file://${String(file).replace(/\\/g, "/")}")`;
  el.title = `Now showing ${currentWp.id || ""}${currentWp.resolution ? " \u00b7 " + currentWp.resolution : ""}. Click to open Now playing.`;
  el.classList.add("has-image");
}

// Why the wallpaper on screen was chosen, as a chain from cause to effect:
// the timetable entry that was driving, the preset it switched to, and the
// source that actually produced the image. Answering that used to mean
// visiting the timetable, the presets and the search in turn, and even then
// you were guessing, because they may all have moved on since.
//
// Everything here comes from the reason main recorded at the moment of
// choosing. Nothing is inferred from the settings as they are now.
function describeWhy(wp, cfg) {
  const why = wp && wp.why;
  if (!why) return null;
  const e = escapeHtml;
  const quoted = (v) => `\u201c${e(v)}\u201d`;
  const chain = [];
  if (why.rule) {
    const rule = ((cfg && cfg.schedule && cfg.schedule.rules) || []).find(
      (r) => r && r.id === why.rule,
    );
    chain.push(
      rule
        ? `Timetable, from <strong>${e(rule.startHHMM || "??:??")}</strong> ${e(describeDays(rule.days))}`
        : "Timetable (that entry has since been removed)",
    );
  }
  if (why.preset) chain.push(`Preset <strong>${e(why.preset)}</strong>`);
  switch (why.mode) {
    case "search":
      chain.push(why.ref ? `Search ${quoted(why.ref)}` : "Search, with no keywords");
      break;
    case "playlist":
      chain.push(why.ref ? `Playlist ${quoted(why.ref)}` : "A playlist");
      break;
    case "folder":
      chain.push(why.ref ? `Folder <span class="why-path">${e(why.ref)}</span>` : "Your folders");
      break;
    case "collection":
      chain.push("Your Wallhaven collection");
      break;
    case "cache":
      chain.push("Offline, so picked from wallpapers already downloaded");
      break;
    case "manual":
      chain.push("Picked by you");
      break;
    default:
      chain.push(e(why.mode || "Unknown source"));
  }
  const notes = [];
  if (why.fallback) {
    notes.push(`Nothing matched your filters exactly, so it searched ${e(why.fallback)}.`);
  }
  return { chain, notes };
}

function renderWhy() {
  const el = document.getElementById("why");
  if (!el) return;
  // While browsing the carousel, describe the picture in the centre, not the
  // one on the desktop.
  const wp = (typeof cfFocusedItem === "function" && cfFocusedItem()) || currentWp;
  if (!wp) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  el.hidden = false;
  const d = describeWhy(wp, config);
  if (!d) {
    el.innerHTML =
      '<span class="why-label">Why this one</span>' +
      '<span class="why-muted">Chosen before WallRaven started recording why.</span>';
    return;
  }
  el.innerHTML =
    '<span class="why-label">Why this one</span>' +
    d.chain.join('<span class="why-sep">\u203a</span>') +
    d.notes.map((n) => `<span class="why-note">${n}</span>`).join("");
}

// ---------- Carousel ----------
//
// Earlier wallpapers to the left of Now playing, what comes next to the right.
// Main decides what is genuinely known to be next (see carouselInfo); this
// only draws it.
//
// Browsing is separate from setting. Scrolling, dragging, the arrow keys and
// the slider all move one thing, cfFocus, which is only which picture sits in
// the centre. The desktop changes when "Set as wallpaper" is pressed, and at
// no other time. Every picture, the one on the desktop included (#thumb), is a
// card positioned by its distance from the focus, so a move only changes
// transforms and the CSS transition does the sliding.
const CF_VISIBLE = 4; // cards drawn each side of the centre; the rest wait off stage
const CF_PERSPECTIVE = 700; // per card; see .cf-track in the stylesheet
let carouselSeq = 0;
let carouselData = null;
let cfStrip = []; // oldest first: earlier..., the desktop's, ahead...
let cfCurrent = 0; // index of the wallpaper on the desktop
let cfFocus = 0; // index shown in the centre
let cfFocusKey = null; // what is being looked at, so a redraw does not yank it away

async function renderCarousel() {
  if (!api.carousel || !document.getElementById("coverflow")) return;
  const seq = ++carouselSeq;
  let data;
  try {
    data = await api.carousel();
  } catch {
    return;
  }
  // Two redraws can be in flight at once (a rotation and a prefetch landing
  // together); only the newest may paint.
  if (seq !== carouselSeq) return;
  carouselData = data;
  buildStrip();
  drawCarousel();
  renderWhy();
}

function cfFocusKeyOf(c) {
  return c.kind === "current" ? "cur" : `${c.kind}:${c.id}`;
}
function cfElementKey(c) {
  return c.kind === "history" ? `h${c.index}` : `u${c.id}`;
}

function buildStrip() {
  const raw = carouselData || {};
  const back = Array.isArray(raw.back) ? raw.back.filter(Boolean) : [];
  const forward = Array.isArray(raw.forward) ? raw.forward.filter(Boolean) : [];
  cfStrip = [...back.slice().reverse(), { ...(currentWp || {}), kind: "current" }, ...forward];
  cfCurrent = back.length;
  // Keep looking at the same picture across a redraw (a prefetch landing, or
  // the timer rotating while you browse). If it has gone, go back to the
  // desktop's rather than to whatever now happens to sit at the same index.
  const keep = cfFocusKey ? cfStrip.findIndex((c) => cfFocusKeyOf(c) === cfFocusKey) : -1;
  cfFocus = keep >= 0 ? keep : cfCurrent;
  if (keep < 0) cfFocusKey = null;
}

function cfFileUrl(file) {
  return `file://${String(file).replace(/\\/g, "/")}`;
}
// Wallhaven serves thumbnails at /small/, /lg/ and /orig/ under the same name.
// Only the small one is stored, which is soft blown up to the centre.
function cfLargeThumb(thumb) {
  return String(thumb || "").replace("/small/", "/orig/");
}
function cfBrowsing() {
  return cfStrip.length > 0 && cfFocus !== cfCurrent;
}
function cfFocusedItem() {
  return cfBrowsing() ? cfStrip[cfFocus] : null;
}
function cfFirstUpcoming() {
  return cfStrip.findIndex((c) => c && c.kind === "upcoming");
}

function cfImageFor(c, centre) {
  if (centre) {
    if (c.file) return cfFileUrl(c.file);
    if (c.thumb && /^https:\/\//.test(c.thumb)) return cfLargeThumb(c.thumb);
    return "";
  }
  if (c.thumb && /^https:\/\//.test(c.thumb)) return c.thumb;
  if (c.file) return cfFileUrl(c.file);
  return "";
}

function carouselWhyText(c) {
  const d = describeWhy(c, config);
  if (!d) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = d.chain.join(" › ");
  return tmp.textContent || "";
}

function drawCarousel() {
  const stage = document.getElementById("coverflow");
  const track = document.getElementById("cf-track");
  const thumb = document.getElementById("thumb");
  if (!stage || !track || !thumb) return;
  if (!currentWp) {
    for (const el of track.querySelectorAll(".cf-card")) el.remove();
    thumb.classList.add("cf-focus");
    thumb.style.transform = "translateX(-50%)";
    ["cf-scrollwrap", "cf-bar", "cf-note"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.hidden = true;
    });
    return;
  }

  // Geometry from the stage itself, so it holds at any window size: the first
  // card tucks just behind the centre's edge and the rest stack outwards,
  // closer together when there is less room.
  const h = stage.clientHeight || 150;
  const half = (stage.clientWidth || 600) / 2;
  const centreW = (h * 16) / 9;
  const cardW = (h * 0.78 * 16) / 9;
  const first = centreW / 2 + cardW * 0.12;
  const room = half - first - cardW * 0.3;
  const step = Math.max(cardW * 0.06, Math.min(cardW * 0.3, room / (CF_VISIBLE - 1)));

  // Reuse elements by key so a move animates instead of redrawing.
  const existing = new Map();
  for (const el of track.querySelectorAll(".cf-card")) existing.set(el.dataset.key, el);
  const used = new Set();
  const firstUp = cfFirstUpcoming();

  cfStrip.forEach((c, i) => {
    let el;
    if (c.kind === "current") {
      el = thumb;
    } else {
      const key = cfElementKey(c);
      used.add(key);
      el = existing.get(key);
      if (!el) {
        el = document.createElement("div");
        el.className = "cf-item cf-card";
        el.dataset.key = key;
        track.appendChild(el);
      }
      el.classList.toggle("cf-dead", c.kind === "history" && !c.reachable);
      const wantTag = i === firstUp ? "Next" : "";
      let tag = el.querySelector(".cf-tag");
      if (wantTag && !tag) {
        tag = document.createElement("span");
        tag.className = "cf-tag";
        el.appendChild(tag);
      }
      if (tag) {
        if (wantTag) tag.textContent = wantTag;
        else tag.remove();
      }
    }
    el.dataset.index = String(i);
    const d = i - cfFocus;
    const ad = Math.abs(d);
    el.classList.toggle("cf-focus", d === 0);
    el.classList.toggle("cf-far", ad > CF_VISIBLE);
    // The same list of functions in every state, so the browser interpolates
    // each one directly instead of falling back to blending whole matrices.
    const dir = Math.sign(d);
    const k = d === 0 ? 0 : Math.min(ad, CF_VISIBLE + 1) - 1;
    const x = d === 0 ? 0 : dir * (first + k * step);
    const z = d === 0 ? 0 : -70;
    const r = d === 0 ? 0 : dir * -62;
    const sc = d === 0 ? 1 : 0.78;
    el.style.transform = `translateX(calc(-50% + ${x}px)) perspective(${CF_PERSPECTIVE}px) translateZ(${z}px) rotateY(${r}deg) scale(${sc})`;

    el.style.zIndex = String(50 - ad);

    // Only the cards on screen hold an image; each decoded wallpaper is tens
    // of megabytes, and 25 of them would be absurd for a strip of thumbnails.
    if (el !== thumb) {
      const img = ad <= CF_VISIBLE ? cfImageFor(c, d === 0) : "";
      if (el.dataset.bg !== img) {
        el.dataset.bg = img;
        el.style.backgroundImage = img ? `url("${img.replace(/"/g, "%22")}")` : "";
      }
      let empty = el.querySelector(".cf-empty");
      if (!img && ad <= CF_VISIBLE && !empty) {
        empty = document.createElement("div");
        empty.className = "cf-empty";
        empty.textContent = "No longer cached";
        el.appendChild(empty);
      } else if (img && empty) empty.remove();
    }
    const name = `${c.id || "Wallpaper"}${c.resolution ? " · " + c.resolution : ""}`;
    const why = carouselWhyText(c);
    el.title =
      d === 0
        ? `${name}${why ? "\n" + why : ""}\nDouble-click to view full size.`
        : `${name}${why ? "\n" + why : ""}`;
    // The same words for anything that does not hover: keyboards, screen readers.
    el.setAttribute("role", "img");
    el.setAttribute(
      "aria-label",
      `${d === 0 ? "In the middle: " : ""}${name}${why ? ". " + why : ""}`,
    );
  });
  for (const [key, el] of existing) if (!used.has(key)) el.remove();

  // Why nothing is ahead, when that is the honest answer. Only while looking
  // at the desktop's own picture; it describes the space to its right.
  const raw = carouselData || {};
  const note = document.getElementById("cf-note");
  if (note) {
    const show =
      !cfBrowsing() && cfFocus === cfStrip.length - 1 && typeof raw.note === "string" && raw.note;
    note.hidden = !show;
    if (show) {
      note.textContent = raw.note;
      note.style.left = `calc(50% + ${centreW / 2 + 18}px)`;
    }
  }

  // The slider mirrors the focus, with a mark where the desktop's picture is.
  const wrap = document.getElementById("cf-scrollwrap");
  const range = document.getElementById("cf-scroll");
  const here = document.getElementById("cf-here");
  if (wrap && range) {
    wrap.hidden = cfStrip.length < 2;
    range.max = String(Math.max(0, cfStrip.length - 1));
    range.value = String(cfFocus);
    if (here && cfStrip.length > 1) {
      // A range thumb is ~16px wide and its centre travels 8px in from each end.
      const pct = cfCurrent / (cfStrip.length - 1);
      here.style.left = `calc(4px + 8px + (100% - 24px) * ${pct})`;
    }
  }

  // What you are looking at, and what you can do with it.
  const bar = document.getElementById("cf-bar");
  const text = document.getElementById("cf-bar-text");
  const setBtn = document.getElementById("cf-set");
  const homeBtn = document.getElementById("cf-home");
  const meta = document.getElementById("meta");
  const c = cfStrip[cfFocus] || {};
  const browsing = cfBrowsing();
  if (bar) bar.hidden = false;
  if (meta) meta.hidden = browsing;
  if (text) {
    const nm = `<strong>${escapeHtml(c.id || "")}</strong>${c.resolution ? " · " + escapeHtml(c.resolution) : ""}`;
    if (!browsing) {
      text.innerHTML =
        cfStrip.length > 1
          ? "On your desktop now. Drag it, use the slider, or click it and use ← → or the wheel."
          : "On your desktop now.";
    } else if (c.kind === "history") {
      const n = cfCurrent - cfFocus;
      text.innerHTML =
        n > 0
          ? `${n} ${n === 1 ? "wallpaper" : "wallpapers"} ago · ${nm}`
          : `After this one, from going Back · ${nm}`;
    } else {
      text.innerHTML = `${cfFocus === cfFirstUpcoming() ? "Coming up next" : "Coming up later"} · ${nm}`;
    }
  }
  if (homeBtn) homeBtn.hidden = !browsing;
  if (setBtn) {
    const settable = browsing && (c.kind === "upcoming" || (c.kind === "history" && c.reachable));
    setBtn.hidden = !settable;
  }
  cfUpdateViewer();
}

function cfMove(to) {
  if (!cfStrip.length) return;
  const n = Math.max(0, Math.min(cfStrip.length - 1, to));
  if (n === cfFocus) return;
  cfFocus = n;
  cfFocusKey = n === cfCurrent ? null : cfFocusKeyOf(cfStrip[n]);
  drawCarousel();
  renderWhy();
}

// The one action that changes the desktop.
async function cfSetFocused() {
  const c = cfStrip[cfFocus];
  if (!c || c.kind === "current") return;
  cfFocusKey = null; // whatever is set becomes the desktop's, and the centre follows it
  try {
    if (c.kind === "history") {
      const info = await api.historyGoto(c.index);
      await loadHistory();
      refreshInfoFrom(info);
    } else if (cfFocus === cfFirstUpcoming()) {
      // Take it off the queue the normal way, so the playlist index or the
      // prefetch queue moves on exactly as pressing forward would.
      await api.next();
    } else {
      // Further ahead in a playlist or folder: set the file itself and leave
      // the order alone.
      await api.historySetFromFile({
        file: c.file,
        id: c.id,
        url: c.url || "",
        resolution: c.resolution || "",
      });
    }
  } catch (e) {
    flash((e && e.message) || "Could not set that wallpaper", "err");
  }
}

// Full size view. It follows the carousel's focus, so moving through it here
// (arrow keys, the side buttons) is the same as moving the carousel, and Set
// as wallpaper sets whatever is showing.
function cfOpenViewer() {
  if (!cfStrip[cfFocus]) return;
  let v = document.getElementById("cf-viewer");
  if (!v) {
    v = document.createElement("div");
    v.id = "cf-viewer";
    v.className = "cf-viewer";
    v.innerHTML =
      '<button class="cf-viewer-close" type="button" aria-label="Close" title="Close (Esc)">✕</button>' +
      '<button class="cf-viewer-nav cf-viewer-prev" type="button" aria-label="Previous wallpaper" title="Previous (←)">' +
      '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" /></svg></button>' +
      '<img alt="" />' +
      '<button class="cf-viewer-nav cf-viewer-next" type="button" aria-label="Next wallpaper" title="Next (→)">' +
      '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg></button>' +
      '<div class="cf-viewer-foot"><span class="cf-viewer-caption"></span>' +
      '<button class="btn cf-viewer-set" type="button">Set as wallpaper</button></div>';
    // Only the backdrop and the close button close it: clicking the picture
    // or a control must not.
    v.addEventListener("click", (e) => {
      const t = e.target;
      if (t === v || (t.closest && t.closest(".cf-viewer-close"))) v.hidden = true;
      else if (t.closest && t.closest(".cf-viewer-prev")) cfViewerStep(-1);
      else if (t.closest && t.closest(".cf-viewer-next")) cfViewerStep(1);
      else if (t.closest && t.closest(".cf-viewer-set")) cfViewerSet();
    });
    document.body.appendChild(v);
  }
  v.hidden = false;
  cfUpdateViewer();
}

function cfViewerStep(n) {
  cfMove(cfFocus + n);
  cfUpdateViewer();
}

let cfViewerStatus = "";
async function cfViewerSet() {
  cfViewerStatus = "Setting…";
  cfUpdateViewer();
  await cfSetFocused();
  // The toast sits underneath this view, so say it here.
  cfViewerStatus = "Set as your wallpaper";
  cfUpdateViewer();
  setTimeout(() => {
    cfViewerStatus = "";
    cfUpdateViewer();
  }, 2500);
}

function cfUpdateViewer() {
  const v = document.getElementById("cf-viewer");
  if (!v || v.hidden) return;
  const c = cfStrip[cfFocus];
  if (!c) return;
  const src = cfImageFor(c.kind === "current" ? { ...currentWp } : c, true);
  const img = v.querySelector("img");
  if (img.getAttribute("src") !== src) img.src = src || "";
  const small = !c.file && c.kind !== "current";
  const where =
    c.kind === "current" ? "On your desktop" : c.kind === "upcoming" ? "Coming up" : "Earlier";
  v.querySelector(".cf-viewer-caption").textContent =
    `${where} · ${c.id || ""}${c.resolution ? " · " + c.resolution : ""}` +
    (small ? " · Wallhaven's preview; the full image downloads when you set it" : "") +
    (cfViewerStatus ? ` · ${cfViewerStatus}` : "");
  v.querySelector(".cf-viewer-prev").disabled = cfFocus <= 0;
  v.querySelector(".cf-viewer-next").disabled = cfFocus >= cfStrip.length - 1;
  const settable = c.kind === "upcoming" || (c.kind === "history" && c.reachable);
  v.querySelector(".cf-viewer-set").hidden = !settable;
}

// Input. Everything funnels into cfMove; nothing here touches the desktop.
(function wireCarouselInput() {
  document.addEventListener(
    "wheel",
    (e) => {
      const stage = e.target && e.target.closest && e.target.closest("#coverflow");
      if (!stage || !cfStrip.length) return;
      // An ordinary wheel over the carousel scrolls the page, as it does
      // everywhere else. Only a sideways scroll, Shift+wheel, or the wheel
      // once the carousel has been clicked moves it. Taking over the wheel
      // whenever the pointer passed over it was scroll hijacking.
      const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (!sideways && !e.shiftKey && document.activeElement !== stage) return;
      e.preventDefault();
      stage._acc =
        (stage._acc || 0) + (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY);
      if (Math.abs(stage._acc) >= 60) {
        cfMove(cfFocus + Math.sign(stage._acc));
        stage._acc = 0;
      }
    },
    { passive: false },
  );

  document.addEventListener("keydown", (e) => {
    const v = document.getElementById("cf-viewer");
    if (v && !v.hidden) {
      if (e.key === "Escape") v.hidden = true;
      else if (e.key === "ArrowLeft") cfViewerStep(-1);
      else if (e.key === "ArrowRight") cfViewerStep(1);
      else return;
      e.preventDefault();
      return;
    }
    const stage = document.getElementById("coverflow");
    if (!stage || !stage.offsetParent || !cfStrip.length) return; // not on screen
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.key === "ArrowLeft") cfMove(cfFocus - 1);
    else if (e.key === "ArrowRight") cfMove(cfFocus + 1);
    else if (e.key === "Escape" && cfBrowsing()) cfMove(cfCurrent);
    else return;
    e.preventDefault();
  });

  // Dragging, told apart from a click by moving more than a few pixels, so a
  // slightly shaky click still counts as a click.
  let drag = null;
  let lastTap = { at: 0, i: -1 };
  document.addEventListener("pointerdown", (e) => {
    const stage = e.target && e.target.closest && e.target.closest("#coverflow");
    if (!stage || e.button !== 0 || !cfStrip.length) return;
    const h = stage.clientHeight || 150;
    try {
      stage.focus({ preventScroll: true }); // the wheel and arrow keys now mean the carousel
    } catch {}
    drag = {
      stage,
      x: e.clientX,
      from: cfFocus,
      moved: false,
      px: Math.max(40, h * 0.5),
      id: e.pointerId,
    };
    try {
      stage.setPointerCapture(e.pointerId);
    } catch {}
  });
  document.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > 6) {
      drag.moved = true;
      drag.stage.classList.add("cf-dragging");
    }
    if (drag.moved) cfMove(drag.from - Math.round(dx / drag.px));
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    d.stage.classList.remove("cf-dragging");
    try {
      d.stage.releasePointerCapture(e.pointerId);
    } catch {}
    if (d.moved || e.type === "pointercancel") return;
    // A click: bring that card to the centre. Twice on the centre: full size.
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const card = hit && hit.closest && hit.closest(".cf-item");
    if (!card) return;
    const i = Number(card.dataset.index);
    if (!Number.isInteger(i)) return;
    if (i !== cfFocus) {
      cfMove(i);
      lastTap = { at: 0, i: -1 };
      return;
    }
    const now = Date.now();
    if (lastTap.i === i && now - lastTap.at < 400) {
      lastTap = { at: 0, i: -1 };
      cfOpenViewer();
    } else lastTap = { at: now, i };
  };
  document.addEventListener("pointerup", end);
  document.addEventListener("pointercancel", end);

  document.addEventListener("input", (e) => {
    if (e.target && e.target.id === "cf-scroll") cfMove(Number(e.target.value));
  });
  document.addEventListener("click", (e) => {
    const id = e.target && e.target.id;
    if (id === "cf-set") cfSetFocused();
    else if (id === "cf-home") cfMove(cfCurrent);
    else if (id === "cf-view") cfOpenViewer();
  });
})();
api.onCarouselChanged?.(() => renderCarousel());
{
  let t = null;
  window.addEventListener("resize", () => {
    clearTimeout(t);
    t = setTimeout(drawCarousel, 120);
  });
}

// The two thumbs in the title bar show whether the wallpaper on screen is
// already liked or disliked, the same way the Paused button shows its state.
// Without this the only way to find out was to scroll the Library and look,
// and it was easy to like the same wallpaper twice and silently clear it.
function renderHeaderReactions() {
  const like = document.getElementById("hdr-like");
  const dislike = document.getElementById("hdr-dislike");
  const state = currentWp && currentWp.id ? wallpaperState(currentWp.id) : "neutral";
  if (!like && !dislike) return;
  const has = !!(currentWp && currentWp.id);
  if (like) {
    like.classList.toggle("on", state === "liked");
    like.setAttribute("aria-pressed", String(state === "liked"));
    like.title = !has
      ? "Like this wallpaper"
      : state === "liked"
        ? "Liked. Click to clear."
        : "Like this wallpaper";
  }
  if (dislike) {
    dislike.classList.toggle("on", state === "disliked");
    dislike.setAttribute("aria-pressed", String(state === "disliked"));
    dislike.title = !has
      ? "Dislike and skip"
      : state === "disliked"
        ? "Disliked. Click to clear."
        : "Dislike and skip";
  }
}

// Apply an info payload directly (used by back/forward) without refetching.
function refreshInfoFrom(info) {
  currentWp = info.current || null;
  const has = !!currentWp;
  renderHeaderThumb();
  renderWhy();
  renderCarousel();
  const bo = $("#btn-open"),
    bf = $("#btn-folder");
  if (bo) bo.disabled = !has;
  if (bf) bf.disabled = !has;
  const thumb = $("#thumb"),
    meta = $("#meta");
  if (thumb && meta && has) {
    thumb.style.backgroundImage = `url("file://${currentWp.file.replace(/\\/g, "/")}")`;
    meta.innerHTML = `<strong>${currentWp.id}</strong>${currentWp.resolution || ""} • cached ${info.cacheMB.toFixed(1)} MB • ${info.historyCount} in history`;
  }
}

async function renderStats() {
  if (!$("#stat-shownTotal")) return;
  try {
    const s = await api.statsGet();
    $("#stat-shownTotal").textContent = s.shownTotal;
    $("#stat-shownMonth").textContent = s.shownMonth;
    $("#stat-cacheHitRate").textContent = s.cacheHitRate + "%";
    $("#stat-fallbackRate").textContent = s.fallbackRate + "%";
    $("#stat-likes").textContent = s.likes;
    $("#stat-dislikes").textContent = s.dislikes;
    $("#stat-fileCount").textContent = s.fileCount;
    $("#stat-cacheMB").textContent = s.cacheMB.toFixed(1);
    const g = s.game || {};
    const plays = Number(g.plays) || 0;
    const playCard = $("#stat-card-gamePlays"),
      bestCard = $("#stat-card-gameBest");
    if (playCard) playCard.style.display = plays > 0 ? "" : "none";
    if (bestCard) bestCard.style.display = plays > 0 ? "" : "none";
    if (plays > 0) {
      $("#stat-gamePlays").textContent = plays;
      $("#stat-gameBest").textContent = Number(g.best) || 0;
    }
    const src = $("#stat-sources");
    if (src)
      src.textContent =
        s.sources && s.sources.length
          ? "Top sources: " + s.sources.map((x) => `${x.source} (${x.count})`).join(", ")
          : "";
  } catch (e) {}
}

// ---------- Tag Browser ----------
const tagState = { page: 1, lastPage: 1, purity: "sfw", items: [], loaded: false };
function getSelectedTagIds() {
  const q = $("#query")?.value || "";
  const ids = new Set();
  for (const m of q.matchAll(/(^|\s)id:(\d+)/g)) ids.add(Number(m[2]));
  return ids;
}
function toggleTagInQuery(id) {
  let q = ($("#query").value || "").trim();
  const re = new RegExp(`(^|\\s)-?id:${id}(?=\\s|$)`);
  if (re.test(q)) q = q.replace(re, "").replace(/\s+/g, " ").trim();
  else q = (q + " id:" + id).trim();
  $("#query").value = q;
  renderTagList();
}
function renderTagList() {
  if (!$("#tagList")) return;
  const filter = ($("#tagFilter")?.value || "").toLowerCase();
  const sel = getSelectedTagIds();
  const list = tagState.items.filter((t) => !filter || t.name.toLowerCase().includes(filter));
  if (!list.length) {
    $("#tagList").innerHTML =
      '<span style="color:var(--muted);font-size:12px;">No tags match.</span>';
    return;
  }
  $("#tagList").innerHTML = list
    .map((t) => {
      const active = sel.has(t.id);
      const purColor = t.purity === "nsfw" ? "#ff5d6c" : t.purity === "sketchy" ? "#e6b800" : "";
      return `<span class="chip${active ? " active" : ""}" data-tag-id="${t.id}" title="${t.purity} • id:${t.id}" style="${purColor ? `border-color:${purColor};` : ""}">${t.name}</span>`;
    })
    .join("");
  $("#tagPageLabel").textContent =
    `page ${tagState.page}${tagState.lastPage > 1 ? " / " + tagState.lastPage : ""}`;
}
async function loadTagPage() {
  $("#tagList").innerHTML = '<span style="color:var(--muted);font-size:12px;">Loading…</span>';
  try {
    const res = await api.fetchTags({ page: tagState.page, purity: tagState.purity });
    tagState.items = res.items;
    tagState.lastPage = res.lastPage || tagState.page;
    tagState.loaded = true;
    renderTagList();
  } catch (e) {
    $("#tagList").innerHTML =
      `<span style="color:var(--danger);font-size:12px;">Failed: ${e.message}</span>`;
  }
}
function wireTagBrowser() {
  const tb = $("#tagBrowser");
  if (!tb) return;
  tb.addEventListener("toggle", () => {
    if (tb.open && !tagState.loaded) loadTagPage();
  });
  $("#tagFilter").addEventListener("input", renderTagList);
  $("#tagPurity").addEventListener("change", () => {
    tagState.purity = $("#tagPurity").value;
    tagState.page = 1;
    loadTagPage();
  });
  $("#tagPrev").onclick = () => {
    if (tagState.page > 1) {
      tagState.page--;
      loadTagPage();
    }
  };
  $("#tagNext").onclick = () => {
    if (tagState.page < tagState.lastPage) {
      tagState.page++;
      loadTagPage();
    }
  };
  $("#tagList").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-tag-id]");
    if (!chip) return;
    const id = Number(chip.dataset.tagId);
    const tag = tagState.items.find((t) => t.id === id);
    if (tag) {
      if (tag.purity === "sketchy" && !$("#pur-sketchy").checked) {
        $("#pur-sketchy").checked = true;
        flash("Enabled Sketchy purity for this tag", "ok");
      } else if (tag.purity === "nsfw" && !$("#pur-nsfw").checked) {
        $("#pur-nsfw").checked = true;
        flash(
          $("#apiKey").value.trim()
            ? "Enabled NSFW purity for this tag"
            : "Enabled NSFW - add your Wallhaven API key or NSFW results will be empty",
          $("#apiKey").value.trim() ? "ok" : "err",
        );
      }
    }
    toggleTagInQuery(id);
  });
  $("#query").addEventListener("input", () => {
    if (tagState.loaded) renderTagList();
    renderQueryBuilder();
  });
  initQueryBuilder();
}

// ---------- Query Builder ----------
// Parse query into OR-groups of AND-tokens. Top-level comma = OR.
// Within a group, whitespace or leading '+' = AND. Preserves `id:N`, `-id:N`.
function parseQuery(q) {
  return (q || "")
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean)
    .map((g) =>
      g
        .split(/\s+/)
        .map((t) => t.trim())
        .filter(Boolean),
    );
}
function serializeQuery(groups) {
  return groups
    .map((g) => g.join(" "))
    .filter((g) => g.length)
    .join(", ");
}
function renderQueryBuilder() {
  const host = document.querySelector("#qbChips");
  if (!host) return;
  const groups = parseQuery($("#query").value);
  if (!groups.length) {
    host.innerHTML =
      '<span style="color:var(--muted);font-size:11px;">Empty query — add terms below or type above.</span>';
    return;
  }
  const parts = [];
  groups.forEach((grp, gi) => {
    if (gi > 0)
      parts.push(
        '<span style="color:var(--accent); font-size:11px; font-weight:600; padding:0 2px;">OR</span>',
      );
    grp.forEach((tok, ti) => {
      if (ti > 0) parts.push('<span style="color:var(--muted); font-size:10px;">AND</span>');
      const isExcl = tok.startsWith("-");
      const border = isExcl ? "#ff5d6c" : "var(--accent)";
      parts.push(`<span class="chip" style="border-color:${border}; display:inline-flex; align-items:center; gap:4px;" data-g="${gi}" data-t="${ti}">
        <span>${escapeHtml(tok)}</span>
        <button type="button" class="qb-del" data-g="${gi}" data-t="${ti}" style="background:none; border:0; color:var(--muted); cursor:pointer; padding:0 2px; font-size:14px; line-height:1;">×</button>
      </span>`);
    });
  });
  host.innerHTML = parts.join(" ");
  host.querySelectorAll(".qb-del").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const gi = +btn.dataset.g,
        ti = +btn.dataset.t;
      const gs = parseQuery($("#query").value);
      if (gs[gi]) {
        gs[gi].splice(ti, 1);
        if (!gs[gi].length) gs.splice(gi, 1);
      }
      $("#query").value = serializeQuery(gs);
      renderQueryBuilder();
      if (tagState.loaded) renderTagList();
    });
  });
}
function initQueryBuilder() {
  const term = document.querySelector("#qbTerm");
  const addAnd = document.querySelector("#qbAddAnd");
  const addOr = document.querySelector("#qbAddOr");
  const clr = document.querySelector("#qbClear");
  if (!term || !addAnd || !addOr || !clr) return;
  const commit = (mode) => {
    const t = (term.value || "").trim();
    if (!t) {
      term.focus();
      return;
    }
    const gs = parseQuery($("#query").value);
    if (mode === "or" || gs.length === 0) gs.push([t]);
    else gs[gs.length - 1].push(t);
    $("#query").value = serializeQuery(gs);
    term.value = "";
    term.focus();
    renderQueryBuilder();
    if (tagState.loaded) renderTagList();
  };
  addAnd.addEventListener("click", () => commit("and"));
  addOr.addEventListener("click", () => commit("or"));
  clr.addEventListener("click", () => {
    $("#query").value = "";
    renderQueryBuilder();
    if (tagState.loaded) renderTagList();
  });
  term.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit(e.shiftKey ? "or" : "and");
    }
  });
  renderQueryBuilder();
}

// ---------- History gallery ----------
let historyItems = [];
let likedIds = new Set();
let dislikedIds = new Set();
async function loadHistory() {
  historyItems = await api.history();
  try {
    likedIds = new Set((await api.likes()).map(String));
  } catch {
    likedIds = new Set();
  }
  try {
    dislikedIds = new Set((config?.dislikes || []).map(String));
  } catch {
    dislikedIds = new Set();
  }
  renderHistory();
}
// Every wallpaper list uses the same two reaction controls, with the same
// labels and the same active styling, so the state always reads the same way.
function reactionButtonsHtml(state) {
  return `<button class="icon-btn${state === "liked" ? " active" : ""}" data-act="liked" title="${state === "liked" ? "Clear the like (back to neutral)" : "Like this wallpaper"}" aria-label="${state === "liked" ? "Clear like" : "Like this wallpaper"}" aria-pressed="${state === "liked"}">👍</button>
    <button class="icon-btn${state === "disliked" ? " active" : ""}" data-act="disliked" title="${state === "disliked" ? "Clear the dislike (back to neutral)" : "Dislike this wallpaper"}" aria-label="${state === "disliked" ? "Clear dislike" : "Dislike this wallpaper"}" aria-pressed="${state === "disliked"}">👎</button>`;
}
function reactionButtons(id, state) {
  return `<div class="reaction-bar">${reactionButtonsHtml(state)}</div>`;
}
function wallpaperState(id) {
  const key = String(id);
  // Read from the saved lists as well as the cached sets: the Liked and
  // Disliked galleries can be drawn before the cached sets are filled, and a
  // stale set made a second click re-apply the same reaction instead of
  // clearing it.
  const likes = (config?.likes || []).map(String);
  const dislikes = (config?.dislikes || []).map(String);
  if (likedIds.has(key) || likes.includes(key)) return "liked";
  if (dislikedIds.has(key) || dislikes.includes(key)) return "disliked";
  return "neutral";
}
// requested is the button pressed; pressing the button that is already lit
// clears the reaction and returns the wallpaper to neutral. knownState lets a
// gallery pass the state it is displaying, so the toggle can never disagree
// with what the user can see.
async function changeWallpaperReaction(item, requested, knownState) {
  const current = knownState || wallpaperState(item.id);
  const next = current === requested ? "neutral" : requested;
  const result = await api.setWallpaperReaction({ item, state: next });
  if (!result?.ok) throw new Error(result?.reason || "Could not update wallpaper");
  const id = String(item.id);
  likedIds.delete(id);
  dislikedIds.delete(id);
  if (next === "liked") likedIds.add(id);
  if (next === "disliked") dislikedIds.add(id);
  config = await api.getConfig();
  renderHistory();
  renderFavourites();
  renderHeaderReactions();
  flash(
    next === "liked"
      ? "Moved to Liked"
      : next === "disliked"
        ? "Moved to Disliked"
        : "Cleared — back to neutral",
    "ok",
  );
}

// Shared card markup for every wallpaper list. Thumbnails are lazy <img>
// elements pointing at small previews where possible: full-size local files
// decoded as backgrounds were costing hundreds of megabytes per screen.
function wallpaperCardHtml({ id, src, meta, state, active, extra = "", cls = "" }) {
  return `
    <div class="wp-card ${cls}${active ? " active" : ""}" data-id="${escapeHtml(String(id || ""))}" data-state="${state}" title="Click the thumbnail to set it as your wallpaper">
      ${src ? `<img src="${src}" alt="" loading="lazy" decoding="async" />` : ""}
      <div class="hover">
        <div class="meta">${escapeHtml(String(meta || id || ""))}</div>
        <div class="hcard-actions">
          ${reactionButtonsHtml(state)}
          <button class="icon-btn" data-act="open" title="Open on Wallhaven">↗</button>
          ${extra}
        </div>
      </div>
    </div>`;
}
const HISTORY_PAGE = 24;
let historyShown = HISTORY_PAGE;
// Thumbnails are the heaviest thing this window holds, so a list is only built
// while you are actually looking at it. Off-screen or hidden, the markup is
// dropped and rebuilt on return — same content, a fraction of the memory.
let galleriesDirty = false;
function galleriesVisible() {
  return uiPage === "library" && !document.hidden;
}
function clearGallery(sel) {
  const el = $(sel);
  if (el) el.innerHTML = "";
}
function releaseGalleries() {
  clearGallery("#historyGrid");
  clearGallery("#likedGrid");
  clearGallery("#dislikedGrid");
  galleriesDirty = true;
}
// Browse results and collection contents live on other pages; they are dropped
// only while the window is hidden and rebuilt from what is already in memory.
let secondaryDirty = false;
function releaseSecondaryGalleries() {
  clearGallery("#browseGrid");
  clearGallery("#collectionItems");
  secondaryDirty = true;
}
function flushSecondaryGalleries() {
  if (!secondaryDirty || document.hidden) return;
  secondaryDirty = false;
  try {
    renderBrowseResults();
  } catch {}
  try {
    if ($("#collectionSelect") && $("#collectionSelect").value) loadCollectionItems();
  } catch {}
}
function flushGalleries() {
  if (!galleriesDirty || !galleriesVisible()) return;
  galleriesDirty = false;
  renderHistory();
  renderFavourites();
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    releaseGalleries();
    releaseSecondaryGalleries();
  } else {
    flushGalleries();
    flushSecondaryGalleries();
  }
});

// Dragging the window edge fires resize continuously. Mark the document as
// resizing so the heavy blur/shadow work is skipped for those frames, and clear
// it shortly after the drag stops.
let resizeIdle = null;
window.addEventListener(
  "resize",
  () => {
    const root = document.documentElement;
    if (!root.classList.contains("resizing")) root.classList.add("resizing");
    if (resizeIdle) clearTimeout(resizeIdle);
    resizeIdle = setTimeout(() => {
      resizeIdle = null;
      root.classList.remove("resizing");
    }, 160);
  },
  { passive: true },
);

function renderHistory() {
  const grid = $("#historyGrid");
  if (!grid) return;
  if (!galleriesVisible()) {
    galleriesDirty = true;
    return;
  }
  const more = $("#btn-history-more");
  if (!historyItems.length) {
    grid.innerHTML = '<span style="color:var(--muted); font-size:12px;">No history yet.</span>';
    if (more) more.style.display = "none";
    return;
  }
  const currentId = currentWp?.id;
  const visible = historyItems.slice(0, historyShown);
  grid.innerHTML = visible
    .map((h) =>
      wallpaperCardHtml({
        id: h.id,
        // Prefer the tiny hosted preview; fall back to the local file.
        src: wallhavenThumb(h.id) || (h.file ? `file://${String(h.file).replace(/\\/g, "/")}` : ""),
        meta: `${h.id}${h.resolution ? " • " + h.resolution : ""}`,
        state: wallpaperState(h.id),
        active: h.id === currentId,
        cls: "hcard",
        extra: `<button class="icon-btn" data-act="folder" title="Show file in folder">📁</button>
            <button class="icon-btn danger" data-act="del" title="Remove from history">✕</button>`,
      }),
    )
    .join("");
  if (more) {
    const left = historyItems.length - visible.length;
    more.style.display = left > 0 ? "" : "none";
    more.textContent = `Show more (${left} left)`;
  }
}

function wireHistoryGrid() {
  const grid = $("#historyGrid");
  if (!grid) return;
  const more = $("#btn-history-more");
  if (more)
    more.onclick = () => {
      historyShown += HISTORY_PAGE;
      renderHistory();
    };

  grid.addEventListener("click", async (e) => {
    const card = e.target.closest(".hcard");
    if (!card) return;
    const id = card.dataset.id;
    const item = historyItems.find((h) => String(h.id) === String(id));
    if (!item) return;
    const btn = e.target.closest(".icon-btn");
    const act = btn?.dataset.act || "set";
    if (act === "set") {
      flash("Setting wallpaper…");
      try {
        await api.historySetFromFile(item);
        await refreshInfo();
        flash("Wallpaper set", "ok");
      } catch (err) {
        flash("Failed: " + err.message, "err");
      }
    } else if (act === "liked" || act === "disliked") {
      try {
        await changeWallpaperReaction(item, act, card.dataset.state);
      } catch (err) {
        flash("Failed: " + err.message, "err");
      }
    } else if (act === "open") {
      await openOnWallhaven(item);
    } else if (act === "folder") {
      api.showInFolder(item.file);
    } else if (act === "del") {
      historyItems = await api.historyRemove({ id: item.id });
      renderHistory();
    }
  });
}

// ---------- Wallhaven collections ----------
let collectionsCache = [];
function wireCollections() {
  const btn = $("#btn-load-collections");
  if (!btn) return;
  btn.onclick = async () => {
    if (!$("#apiKey").value.trim()) {
      flash("Add your Wallhaven API key first, then Save", "err");
      return;
    }
    flash("Loading collections…");
    try {
      config = await api.setConfig(collect());
      collectionsCache = await api.whCollections({ username: $("#whUsername").value.trim() });
      const sel = $("#collectionSelect");
      sel.innerHTML =
        '<option value="">- pick a collection -</option>' +
        collectionsCache
          .map(
            (c) =>
              `<option value="${c.id}" data-count="${c.count}">${c.label} (${c.count})</option>`,
          )
          .join("");
      if (config.collectionId) sel.value = config.collectionId;
      flash(
        `Loaded ${collectionsCache.length} collection${collectionsCache.length === 1 ? "" : "s"}`,
        "ok",
      );
      if (sel.value) loadCollectionItems();
    } catch (e) {
      flash("Failed: " + e.message, "err");
    }
  };
  $("#collectionSelect").addEventListener("change", async () => {
    const id = $("#collectionSelect").value ? Number($("#collectionSelect").value) : null;
    config = await api.setConfig({ ...collect(), collectionId: id });
    if (id) loadCollectionItems();
    else $("#collectionItems").innerHTML = "";
  });
}
async function loadCollectionItems() {
  const id = Number($("#collectionSelect").value);
  const user = $("#whUsername").value.trim();
  if (!id || !user) return;
  $("#collectionItems").innerHTML =
    '<span style="color:var(--muted); font-size:12px;">Loading…</span>';
  try {
    const data = await api.whCollectionItems({ username: user, id, page: 1 });
    const items = data?.data || [];
    if (!items.length) {
      $("#collectionItems").innerHTML =
        '<span style="color:var(--muted); font-size:12px;">Empty.</span>';
      return;
    }
    $("#collectionItems").innerHTML = items
      .map(
        (w) => `
      <a href="#" data-url="${w.url}" title="${w.id} • ${w.resolution}"
         style="aspect-ratio:16/9; background:center/cover no-repeat url('${w.thumbs.small}'); border-radius:6px; border:1px solid var(--border);"></a>
    `,
      )
      .join("");
    $("#collectionItems")
      .querySelectorAll("a")
      .forEach(
        (a) =>
          (a.onclick = (e) => {
            e.preventDefault();
            api.openExternal(a.dataset.url);
          }),
      );
  } catch (e) {
    $("#collectionItems").innerHTML =
      `<span style="color:var(--danger); font-size:12px;">Failed: ${e.message}</span>`;
  }
}

// ---------- Static Browse ----------
// `searched` records whether this session has run a browse yet, so opening the
// page can load something rather than showing an empty grid and a button.
const browseState = {
  page: 1,
  lastPage: 1,
  items: [],
  searched: false,
  query: "",
  sort: "toplist:1M",
};

// The sort dropdown carries both the sort and, for toplists, the period.
function browseSortOverrides(value) {
  const v = String(value || "");
  if (!v) return {};
  const [sorting, topRange] = v.split(":");
  return topRange ? { sorting, topRange } : { sorting };
}
function refreshBrowseTargetSelect() {
  const sel = $("#browseAddTarget");
  if (!sel) return;
  const pls = (config && config.playlists) || {};
  const names = Object.keys(pls).sort((a, b) => a.localeCompare(b));
  const prev = sel.value;
  sel.innerHTML =
    '<option value="">(don\u2019t add, just set as wallpaper)</option>' +
    names
      .map(
        (n) =>
          `<option value="${escapeHtml(n)}">${escapeHtml(n)} (${pls[n].items.length})</option>`,
      )
      .join("");
  if (prev && pls[prev]) sel.value = prev;
}
function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}
async function runBrowse() {
  const grid = $("#browseGrid");
  if (!grid) return;
  grid.innerHTML = '<span style="color:var(--muted); font-size:12px;">Searching…</span>';
  browseState.searched = true;
  try {
    // This used to save the whole settings form before every search, so
    // looking something up here overwrote the search the wallpapers rotate on.
    // The query and sort are now sent with the request and used once.
    const q = ($("#browseQuery")?.value ?? browseState.query).trim();
    browseState.query = q;
    const sortValue = $("#browseSort")?.value ?? browseState.sort;
    browseState.sort = sortValue;
    const res = await api.searchRun({
      page: browseState.page,
      query: q || null,
      overrides: browseSortOverrides(sortValue),
    });
    browseState.items = res.items || [];
    browseState.lastPage = res.meta?.last_page || 1;
    renderBrowseResults();
  } catch (e) {
    grid.innerHTML = `<span style="color:var(--danger); font-size:12px;">Failed: ${escapeHtml(e.message)}</span>`;
  }
}
function renderBrowseResults() {
  const grid = $("#browseGrid");
  if (!grid) return;
  if (document.hidden) {
    secondaryDirty = true;
    return;
  }
  const label = $("#browsePageLabel");
  if (label) label.textContent = `page ${browseState.page} / ${browseState.lastPage}`;
  if (!browseState.items.length) {
    grid.innerHTML =
      '<span style="color:var(--muted); font-size:12px;">No results. Try widening filters.</span>';
    return;
  }
  grid.innerHTML = browseState.items
    .map(
      (w) => `
    <div class="bcard" data-id="${w.id}" style="position:relative; aspect-ratio:16/9; background:var(--panel-2) center/cover no-repeat url('${w.thumbs.small}'); border-radius:6px; border:1px solid var(--border); cursor:pointer; overflow:hidden;">
      <div class="hover" style="position:absolute; inset:0; background:linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.75) 100%); opacity:0; transition:opacity .15s; display:flex; flex-direction:column; justify-content:flex-end; padding:6px;">
        <div style="color:#fff; font-size:11px; margin-bottom:4px; text-shadow:0 1px 2px rgba(0,0,0,.8);">${w.id} • ${w.resolution}</div>
        <div style="display:flex; gap:4px; justify-content:flex-end;">
          <button class="icon-btn" data-act="add" title="Add to selected playlist">＋</button>
          <button class="icon-btn" data-act="open" title="Open on Wallhaven">↗</button>
        </div>
      </div>
    </div>`,
    )
    .join("");
  grid.querySelectorAll(".bcard").forEach((el) => {
    el.addEventListener("mouseenter", () => (el.querySelector(".hover").style.opacity = "1"));
    el.addEventListener("mouseleave", () => (el.querySelector(".hover").style.opacity = "0"));
  });
}

function wireBrowse() {
  if (!$("#btn-browse-run")) return;
  refreshBrowseTargetSelect();
  // The card is rebuilt on every navigation, so put back what was typed.
  const q = $("#browseQuery");
  if (q) {
    q.value = browseState.query;
    q.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        browseState.page = 1;
        runBrowse();
      }
    });
  }
  const sort = $("#browseSort");
  if (sort) {
    sort.value = browseState.sort;
    sort.addEventListener("change", () => {
      browseState.page = 1;
      runBrowse();
    });
  }
  $("#btn-browse-run").onclick = () => {
    browseState.page = 1;
    runBrowse();
  };
  $("#btn-browse-prev").onclick = () => {
    if (browseState.page > 1) {
      browseState.page--;
      runBrowse();
    }
  };
  $("#btn-browse-next").onclick = () => {
    if (browseState.page < browseState.lastPage) {
      browseState.page++;
      runBrowse();
    }
  };
  $("#browseGrid").addEventListener("click", async (e) => {
    const card = e.target.closest(".bcard");
    if (!card) return;
    const id = card.dataset.id;
    const w = browseState.items.find((x) => String(x.id) === String(id));
    if (!w) return;
    const btn = e.target.closest(".icon-btn");
    const act = btn?.dataset.act || "set";
    if (act === "open") {
      await openOnWallhaven(w);
      return;
    }
    if (act === "add") {
      const target = $("#browseAddTarget").value;
      if (!target) {
        flash("Pick a playlist above first (or Create one in Playlists)", "err");
        return;
      }
      // Download+set so file lands in cache with a known path, then add to playlist.
      try {
        await api.setFromRemote(w);
        const info = await api.info();
        const file = info.current?.file;
        if (!file) throw new Error("File missing after set");
        await api.playlistAddItem({
          name: target,
          item: {
            id: w.id,
            url: w.url,
            file,
            thumb: w.thumbs?.small || "",
            resolution: w.resolution,
            file_type: w.file_type,
          },
        });
        config = await api.getConfig();
        await refreshInfo();
        renderPlaylistUI();
        refreshBrowseTargetSelect();
        flash(`Added ${w.id} to “${target}” (kept in cache)`, "ok");
      } catch (err) {
        flash("Failed: " + err.message, "err");
      }
      return;
    }
    // Default click = set as wallpaper
    try {
      flash("Setting wallpaper…");
      await api.setFromRemote(w);
      await refreshInfo();
      flash("Wallpaper set. Cycling paused.", "ok");
    } catch (err) {
      flash("Failed: " + err.message, "err");
    }
  });
}

// ---------- Liked & disliked ----------
function favouriteItems() {
  return (config?.playlists || {})["Liked"]?.items || [];
}
function dislikedItems() {
  const saved = config?.dislikedItems || [];
  const byId = new Map(historyItems.map((item) => [String(item.id), item]));
  return (config?.dislikes || []).map(
    (id) => saved.find((item) => String(item.id) === String(id)) || byId.get(String(id)) || { id },
  );
}
// Older lists only stored the wallpaper id, so rebuild the Wallhaven preview
// image from the id when no thumbnail or local file was kept.
function wallhavenThumb(id) {
  const clean = String(id || "").trim();
  return /^[a-zA-Z0-9]{6}$/.test(clean)
    ? `https://th.wallhaven.cc/small/${clean.slice(0, 2)}/${clean}.jpg`
    : "";
}
function reactionCard(item, state) {
  return wallpaperCardHtml({
    id: item.id,
    // Small hosted preview first, so long lists stay light on memory.
    src:
      wallhavenThumb(item.id) ||
      item.thumb ||
      (item.file ? `file://${String(item.file).replace(/\\/g, "/")}` : ""),
    meta: item.resolution ? `${item.id} • ${item.resolution}` : item.id,
    state,
    cls: "fcard",
  });
}

function renderFavourites() {
  const likedGrid = $("#likedGrid"),
    dislikedGrid = $("#dislikedGrid");
  if (!likedGrid || !dislikedGrid) return;
  const liked = favouriteItems(),
    disliked = dislikedItems();
  const sub = document.querySelector('[data-id="favourites"] [data-role="sub"]');
  if (sub)
    sub.textContent = liked.length || disliked.length ? ` - ${liked.length + disliked.length}` : "";
  const lc = $("#likedCount"),
    dc = $("#dislikedCount");
  if (lc) lc.textContent = `(${liked.length})`;
  if (dc) dc.textContent = `(${disliked.length})`;
  // Counts stay live; the thumbnails themselves wait until this page is on screen.
  if (!galleriesVisible()) {
    galleriesDirty = true;
    return;
  }
  likedGrid.innerHTML = liked.length
    ? liked.map((item) => reactionCard(item, "liked")).join("")
    : '<span class="help">No liked wallpapers yet.</span>';
  dislikedGrid.innerHTML = disliked.length
    ? disliked.map((item) => reactionCard(item, "disliked")).join("")
    : '<span class="help">No disliked wallpapers yet.</span>';
}

// Bound once. wireFavourites is reached from renderCards(), which runs again
// on every card reorder or collapse, but the listener goes on `document`,
// which is never replaced -- so each re-render used to leave another copy
// behind, and a single click eventually fired the handler five times over.
let favouritesWired = false;
function wireFavourites() {
  if (favouritesWired) return;
  favouritesWired = true;
  document.addEventListener("click", async (e) => {
    const card = e.target.closest?.("#likedGrid .fcard, #dislikedGrid .fcard");
    if (card) {
      const it = [...favouriteItems(), ...dislikedItems()].find(
        (x) => String(x.id) === card.dataset.id,
      );
      const act = e.target.closest(".icon-btn")?.dataset.act;
      if (act === "liked" || act === "disliked") {
        try {
          await changeWallpaperReaction(it, act, card.dataset.state);
        } catch (err) {
          flash("Failed: " + err.message, "err");
        }
        return;
      }
      if (act === "open") {
        await openOnWallhaven(it || { id: card.dataset.id });
        return;
      }
      if (it?.file) {
        try {
          await api.historySetFromFile(it);
          await refreshInfo();
          flash("Wallpaper set", "ok");
        } catch (err) {
          flash("Failed: " + err.message, "err");
        }
      }
      return;
    }
    if (e.target.closest?.("#btn-fav-refresh")) {
      config = await api.getConfig();
      renderFavourites();
      return;
    }
    if (e.target.closest?.("#btn-fav-use")) {
      if (!favouriteItems().length) {
        flash("Like a few wallpapers first", "err");
        return;
      }
      config = await api.setConfig({
        sourceMode: "playlist",
        activePlaylist: "Liked",
        playlistIndex: 0,
      });
      hydrateInputs(config);
      renderPlaylistUI();
      flash("Cycling your liked wallpapers only", "ok");
      await showPresetResult("Liked");
      return;
    }
  });
}

// ---------- Playlists ----------
function currentPlaylistName() {
  return $("#playlistSelect")?.value || "";
}
function renderPlaylistUI() {
  const sel = $("#playlistSelect");
  if (!sel) return;
  const pls = (config && config.playlists) || {};
  const names = Object.keys(pls).sort((a, b) => a.localeCompare(b));
  const active = config?.activePlaylist || "";
  const prev = sel.value;
  sel.innerHTML =
    '<option value="">- pick a playlist -</option>' +
    names
      .map(
        (n) =>
          `<option value="${escapeHtml(n)}"${n === prev ? " selected" : ""}>${escapeHtml(n)} (${pls[n].items.length})${n === active ? " • active" : ""}</option>`,
      )
      .join("");
  // Sub-label on card head
  const sub = document.querySelector('[data-id="playlists"] [data-role="sub"]');
  if (sub)
    sub.textContent = active ? `- active: ${active}` : names.length ? `- ${names.length}` : "";
  refreshBrowseTargetSelect();
  renderPlaylistGrid();
}
function renderPlaylistGrid() {
  const grid = $("#playlistGrid");
  if (!grid) return;
  const name = currentPlaylistName();
  const pl = (config?.playlists || {})[name];
  if (!name) {
    grid.innerHTML =
      '<span style="color:var(--muted); font-size:12px;">Pick or create a playlist above.</span>';
    return;
  }
  if (!pl || !pl.items.length) {
    grid.innerHTML =
      '<span style="color:var(--muted); font-size:12px;">Empty. Add wallpapers from Browse (＋), the History card, or “Add current”.</span>';
    return;
  }
  grid.innerHTML = pl.items
    .map((it, i) => {
      const src = it.thumb || (it.file ? `file://${it.file.replace(/\\/g, "/")}` : "");
      return `
      <div class="pcard" data-id="${it.id}" style="position:relative; aspect-ratio:16/9; background:var(--panel-2) center/cover no-repeat url('${src}'); border-radius:6px; border:1px solid var(--border); cursor:pointer; overflow:hidden;">
        <div class="hover" style="position:absolute; inset:0; background:linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.75) 100%); opacity:0; transition:opacity .15s; display:flex; flex-direction:column; justify-content:flex-end; padding:6px;">
          <div style="color:#fff; font-size:11px; margin-bottom:4px; text-shadow:0 1px 2px rgba(0,0,0,.8);">#${i + 1} • ${it.id}${it.resolution ? " • " + it.resolution : ""}</div>
          <div style="display:flex; gap:4px; justify-content:flex-end;">
            <button class="icon-btn" data-act="up"   title="Move earlier">↑</button>
            <button class="icon-btn" data-act="down" title="Move later">↓</button>
            <button class="icon-btn" data-act="open" title="Open on Wallhaven">↗</button>
            <button class="icon-btn danger" data-act="del" title="Remove from playlist">✕</button>
          </div>
        </div>
      </div>`;
    })
    .join("");
  grid.querySelectorAll(".pcard").forEach((el) => {
    el.addEventListener("mouseenter", () => (el.querySelector(".hover").style.opacity = "1"));
    el.addEventListener("mouseleave", () => (el.querySelector(".hover").style.opacity = "0"));
  });
}
function wirePlaylists() {
  const sel = $("#playlistSelect");
  if (!sel) return;
  renderPlaylistUI();
  sel.addEventListener("change", renderPlaylistGrid);
  $("#btn-playlist-create").onclick = async () => {
    const name = ($("#playlistNewName").value || "").trim();
    if (!name) {
      flash("Enter a name first", "err");
      return;
    }
    try {
      await api.playlistCreate({ name });
    } catch (e) {
      flash(e.message, "err");
      return;
    }
    config = await api.getConfig();
    $("#playlistNewName").value = "";
    renderPlaylistUI();
    // Auto-select the new playlist so users see it as the pick target
    $("#playlistSelect").value = name;
    renderPlaylistGrid();
    flash(`Playlist “${name}” created`, "ok");
  };
  $("#btn-playlist-delete").onclick = async () => {
    const name = currentPlaylistName();
    if (!name) {
      flash("Pick a playlist first", "err");
      return;
    }
    if (!confirm(`Delete playlist "${name}"? (Wallpaper files stay in cache but become prunable.)`))
      return;
    await api.playlistDelete({ name });
    config = await api.getConfig();
    renderPlaylistUI();
    await refreshInfo();
    flash(`Deleted “${name}”`, "ok");
  };
  $("#btn-playlist-rename").onclick = async () => {
    const from = currentPlaylistName();
    if (!from) {
      flash("Pick a playlist first", "err");
      return;
    }
    const to = prompt("New name for playlist:", from);
    if (!to || to === from) return;
    try {
      await api.playlistRename({ from, to: to.trim() });
    } catch (e) {
      flash(e.message, "err");
      return;
    }
    config = await api.getConfig();
    renderPlaylistUI();
    $("#playlistSelect").value = to.trim();
    renderPlaylistGrid();
    flash(`Renamed to “${to.trim()}”`, "ok");
  };
  $("#btn-playlist-add-current").onclick = async () => {
    const name = currentPlaylistName();
    if (!name) {
      flash("Pick a playlist first", "err");
      return;
    }
    if (!currentWp) {
      flash("No current wallpaper", "err");
      return;
    }
    await api.playlistAddItem({
      name,
      item: {
        id: currentWp.id,
        url: currentWp.url,
        file: currentWp.file,
        resolution: currentWp.resolution,
        thumb: "",
        file_type: "",
      },
    });
    config = await api.getConfig();
    renderPlaylistUI();
    await refreshInfo();
    flash(`Added current wallpaper to “${name}”`, "ok");
  };
  $("#btn-playlist-use").onclick = async () => {
    const name = currentPlaylistName();
    if (!name) {
      flash("Pick a playlist first", "err");
      return;
    }
    await api.playlistSetActive({ name });
    config = await api.setConfig({ sourceMode: "playlist" });
    hydrateInputs(config);
    renderPlaylistUI();
    flash(`Cycling from playlist “${name}”`, "ok");
    await showPresetResult(name);
  };
  $("#playlistGrid").addEventListener("click", async (e) => {
    const card = e.target.closest(".pcard");
    if (!card) return;
    const id = card.dataset.id;
    const name = currentPlaylistName();
    const pl = config?.playlists?.[name];
    if (!pl) return;
    const item = pl.items.find((i) => String(i.id) === String(id));
    if (!item) return;
    const btn = e.target.closest(".icon-btn");
    const act = btn?.dataset.act || "set";
    if (act === "open") {
      await openOnWallhaven(item);
      return;
    }
    if (act === "del") {
      await api.playlistRemoveItem({ name, id: item.id });
      config = await api.getConfig();
      renderPlaylistUI();
      await refreshInfo();
      return;
    }
    if (act === "up" || act === "down") {
      const ids = pl.items.map((i) => i.id);
      const idx = ids.indexOf(item.id);
      const j = act === "up" ? idx - 1 : idx + 1;
      if (j < 0 || j >= ids.length) return;
      [ids[idx], ids[j]] = [ids[j], ids[idx]];
      await api.playlistReorder({ name, ids });
      config = await api.getConfig();
      renderPlaylistGrid();
      return;
    }
    // Default: set this playlist item as wallpaper (also pauses cycling)
    try {
      flash("Setting wallpaper…");
      await api.historySetFromFile(item);
      await refreshInfo();
      flash("Wallpaper set", "ok");
    } catch (err) {
      flash("Failed: " + err.message, "err");
    }
  });
}

// ---------- Cache location ----------
async function refreshCacheDir() {
  const input = $("#cacheDirPath");
  if (!input) return null;
  try {
    const info = await api.cacheInfo();
    input.value = info.dir;
    input.title = info.dir + (info.isDefault ? " (default)" : "");
    return info;
  } catch {
    return null;
  }
}
function wireCacheLocation() {
  if (!$("#cacheDirPath")) return;
  refreshCacheDir();
  const applyDir = async (dir, movableFiles) => {
    let move = false;
    if (movableFiles > 0) {
      move = window.confirm(
        `Move the ${movableFiles} existing cached file(s) into the new folder?\n\nOK = move them across (history stays intact).\nCancel = leave them where they are and start fresh.`,
      );
    }
    flash("Updating cache location…");
    try {
      const r = await api.cacheSetDir({ dir, move });
      await refreshCacheDir();
      await refreshInfo();
      config = await api.getConfig();
      flash(
        move
          ? `Cache moved — ${r.moved} file(s) transferred${r.failed ? `, ${r.failed} failed` : ""}`
          : "Cache location updated",
        "ok",
      );
    } catch (e) {
      flash("Failed: " + e.message, "err");
    }
  };
  $("#btn-cache-change").onclick = async () => {
    const pick = await api.cachePickDir();
    if (!pick || !pick.dir) return;
    await applyDir(pick.dir, pick.movableFiles);
  };
  $("#btn-cache-default").onclick = async () => {
    const info = await api.cacheInfo();
    if (info.isDefault) {
      flash("Already using the default location", "ok");
      return;
    }
    await applyDir("", info.fileCount);
  };
  $("#btn-cache-open").onclick = async () => {
    try {
      await api.cacheOpenDir();
    } catch (e) {
      flash("Could not open folder: " + e.message, "err");
    }
  };
}

// ---------- Local folder rotation ----------
async function renderFolderSources(rescan = false) {
  const list = $("#folderSourceList");
  if (!list) return;
  const info = await api.folderSources({ rescan });
  const paths = info.paths || [];
  list.innerHTML = paths.length
    ? paths
        .map(
          (p) => `<div style="display:flex; gap:6px; align-items:center;">
        <input type="text" readonly value="${escapeHtml(p)}" title="${escapeHtml(p)}" style="flex:1; min-width:120px;" />
        <button class="btn secondary" type="button" data-folder-remove="${escapeHtml(p)}" title="Remove this folder">✕</button>
      </div>`,
        )
        .join("")
    : '<span style="color:var(--muted); font-size:12px;">No folders yet — add one to rotate local wallpapers.</span>';
  const st = $("#folderStatus");
  if (st) {
    const usingFolders = config?.sourceMode === "folder";
    st.textContent = `${info.count} image(s) found${usingFolders ? " • folders are the active cycle source" : ""}`;
    st.className = "status" + (usingFolders ? " ok" : "");
  }
  list.querySelectorAll("[data-folder-remove]").forEach((btn) => {
    btn.onclick = async () => {
      await api.folderRemoveSource({ folderPath: btn.getAttribute("data-folder-remove") });
      config = await api.getConfig();
      await renderFolderSources(true);
      flash("Folder removed", "ok");
    };
  });
}
// Offer the folders this PC already has, rather than making the user go and
// find a path they have never typed. Dropbox, Google Drive and OneDrive all
// sync into ordinary folders, so there is nothing to integrate with: the app
// just has to know where to look.
async function renderFolderQuickAdd() {
  const host = $("#folderQuickAdd");
  if (!host) return;
  let roots = [];
  try {
    roots = (await api.folderCloudRoots?.()) || [];
  } catch {}
  if (!roots.length) {
    host.style.display = "none";
    host.innerHTML = "";
    return;
  }
  host.style.display = "flex";
  host.innerHTML =
    '<span style="font-size:11px; color:var(--muted);">Found on this PC:</span>' +
    roots
      .map(
        (r) =>
          `<button type="button" class="btn secondary quick-folder" data-path="${escapeHtml(r.path)}" title="${escapeHtml(r.path)}" style="font-size:12px; padding:4px 10px;">＋ ${escapeHtml(r.label)}</button>`,
      )
      .join("");
  host.querySelectorAll(".quick-folder").forEach((btn) => {
    btn.onclick = async () => {
      const r = await api.folderAddKnown?.(btn.dataset.path);
      if (!r) {
        flash("That folder is no longer there", "err");
        renderFolderQuickAdd();
        return;
      }
      config = await api.getConfig();
      await renderFolderSources(true);
      renderFolderQuickAdd();
      flash(`Added — ${r.count} picture${r.count === 1 ? "" : "s"} available`, "ok");
    };
  });
}

function wireFolderRotation() {
  if (!$("#btn-folder-add")) return;
  const rec = $("#folderRecursive"),
    ord = $("#folderOrder");
  if (rec) rec.checked = config?.folderRecursive !== false;
  if (ord) ord.value = config?.folderOrder || "random";
  renderFolderSources();
  $("#btn-folder-add").onclick = async () => {
    const r = await api.folderAddSource();
    if (!r) return;
    config = await api.getConfig();
    await renderFolderSources(true);
    flash(`Folder added — ${r.count} image(s) available`, "ok");
  };
  renderFolderQuickAdd();
  $("#btn-folder-rescan").onclick = async () => {
    await renderFolderSources(true);
    flash("Folders rescanned", "ok");
  };
  $("#btn-folder-use").onclick = async () => {
    const info = await api.folderSources({ rescan: true });
    if (!info.count) {
      flash("Add a folder with images first", "err");
      return;
    }
    config = await api.setConfig({ sourceMode: "folder" });
    hydrateInputs(config);
    await renderFolderSources();
    flash("Cycling from your local folders", "ok");
  };
  const persist = async () => {
    config = await api.setConfig({
      folderRecursive: !!rec?.checked,
      folderOrder: ord?.value || "random",
    });
    await renderFolderSources(true);
  };
  rec?.addEventListener("change", persist);
  ord?.addEventListener("change", persist);
}

// ---------- Local library (folder import / bulk export) ----------
function wireLibrary() {
  if (!$("#btn-lib-browse")) return;
  const refreshExport = () => {
    const sel = $("#libExportSelect");
    if (!sel) return;
    const pls = (config && config.playlists) || {};
    const names = Object.keys(pls).sort((a, b) => a.localeCompare(b));
    sel.innerHTML =
      '<option value="">- pick a playlist to export -</option>' +
      names
        .map(
          (n) =>
            `<option value="${escapeHtml(n)}">${escapeHtml(n)} (${pls[n].items.length})</option>`,
        )
        .join("");
  };
  refreshExport();
  $("#btn-lib-browse").onclick = async () => {
    const p = await api.folderPick();
    if (p) $("#libFolderPath").value = p;
  };
  $("#btn-lib-import").onclick = async () => {
    const folderPath = $("#libFolderPath").value.trim();
    if (!folderPath) {
      $("#libStatus").textContent = "Pick a folder first.";
      return;
    }
    $("#libStatus").textContent = "Importing…";
    try {
      const r = await api.folderImportAsPlaylist({
        folderPath,
        playlistName: $("#libPlaylistName").value.trim(),
      });
      config = await api.getConfig();
      renderPlaylistUI();
      refreshExport();
      $("#libStatus").textContent =
        `Imported ${r.added} new files into "${r.name}" (total ${r.total}).`;
      $("#libPlaylistName").value = "";
    } catch (e) {
      $("#libStatus").textContent = "Failed: " + e.message;
    }
  };
  $("#btn-lib-export").onclick = async () => {
    const name = $("#libExportSelect").value;
    if (!name) {
      $("#libStatus").textContent = "Pick a playlist first.";
      return;
    }
    $("#libStatus").textContent = "Exporting…";
    try {
      const r = await api.playlistExport({ name });
      if (r.canceled) {
        $("#libStatus").textContent = "Export canceled.";
        return;
      }
      $("#libStatus").textContent =
        `Copied ${r.copied} files to ${r.folder} (${r.skipped} skipped).`;
    } catch (e) {
      $("#libStatus").textContent = "Failed: " + e.message;
    }
  };
  // Portable status shown in App card
  api
    .portableInfo?.()
    .then((info) => {
      const el = $("#portableStatus");
      if (!el || !info) return;
      el.textContent = info.portable
        ? `Enabled — data at ${info.dataDir}`
        : `Disabled — data at ${info.dataDir}`;
    })
    .catch(() => {});
}

// ---------- Account & cloud sync ----------
let acctState = null;

function fmtWhen(ms) {
  if (!ms) return "Never";
  const d = new Date(ms);
  return d.toLocaleString();
}

function renderAccount(s) {
  acctState = s || acctState;
  const st = acctState || {};
  const status = $("#acctStatus");
  if (!status) return;
  if (st.signedIn) {
    status.textContent = "Signed in" + (st.email ? " as " + st.email : "");
  } else if (st.pairing) {
    status.textContent = "Waiting for you to approve the sign-in in your browser…";
  } else {
    status.textContent = "Not signed in — settings stay on this machine only.";
  }
  const show = (id, on) => {
    const el = $(id);
    if (el) el.style.display = on ? "" : "none";
  };
  show("#btn-acct-signin", !st.signedIn && !st.pairing);
  show("#btn-acct-cancel", !!st.pairing);
  // The code is only meaningful while a pairing is actually outstanding.
  if (!st.pairing) showPairCode(null);
  show("#btn-acct-signout", !!st.signedIn);
  show("#btn-acct-web", !!st.signedIn);
  const cb = $("#cloudSyncEnabled");
  if (cb) cb.checked = st.cloudSyncEnabled !== false;
  const ls = $("#acctLastSync");
  if (ls) ls.textContent = fmtWhen(st.lastSyncedAt);
  const push = $("#btn-sync-push"),
    pull = $("#btn-sync-pull");
  if (push) push.disabled = !st.signedIn;
  if (pull) pull.disabled = !st.signedIn;
}

async function refreshAccount() {
  if (!api.accountStatus) return;
  try {
    renderAccount(await api.accountStatus());
  } catch {}
}

// Shows the pairing code the website will ask for. It is generated by the
// server and shown only here, on the machine being linked: that is what stops
// someone sending you a link that signs their app into your account.
function showPairCode(code) {
  const box = $("#pairCodeBox");
  const el = $("#pairCode");
  if (!box || !el) return;
  if (code) {
    el.textContent = String(code);
    box.style.display = "";
  } else {
    el.textContent = "";
    box.style.display = "none";
  }
}

function wireAccount() {
  if (!$("#btn-acct-signin") || !api.accountSignIn) return;
  $("#btn-acct-signin").onclick = async () => {
    flash("Opening your browser to sign in…");
    try {
      const started = await api.accountSignIn();
      showPairCode(started && started.code);
      await refreshAccount();
    } catch (e) {
      showPairCode(null);
      flash("Could not start sign-in: " + e.message, "err");
    }
  };
  $("#btn-acct-cancel").onclick = async () => {
    try {
      await api.accountCancelSignIn();
    } catch {}
    showPairCode(null);
    await refreshAccount();
    flash("Sign-in cancelled");
  };
  $("#btn-acct-signout").onclick = async () => {
    try {
      await api.accountSignOut();
    } catch {}
    await refreshAccount();
    flash("Signed out", "ok");
  };
  $("#btn-acct-web").onclick = () => api.accountOpenWeb?.("/account");
  $("#cloudSyncEnabled").onchange = async () => {
    config = await api.setConfig({ cloudSyncEnabled: $("#cloudSyncEnabled").checked });
    await refreshAccount();
    flash(config.cloudSyncEnabled ? "Cloud sync on" : "Cloud sync off", "ok");
  };
  $("#btn-sync-push").onclick = async () => {
    flash("Uploading…");
    try {
      const r = await api.syncPush({ force: true });
      flash(r?.ok ? "Uploaded to your account" : "Upload failed", r?.ok ? "ok" : "err");
    } catch (e) {
      flash("Upload failed: " + e.message, "err");
    }
    await refreshAccount();
  };
  $("#btn-sync-pull").onclick = async () => {
    flash("Downloading…");
    try {
      const r = await api.syncPull({ force: true });
      if (r?.ok) {
        config = await api.getConfig();
        hydrateInputs(config);
        flash(r.changed ? "Downloaded and applied your cloud profile" : "Already up to date", "ok");
      } else flash("Download failed", "err");
    } catch (e) {
      flash("Download failed: " + e.message, "err");
    }
    await refreshAccount();
  };
  refreshAccount();
}

api.onAccountChanged?.((s) => {
  renderAccount(s);
  flash(s?.signedIn ? "Account linked — syncing" : "Account updated", "ok");
});
api.onSyncStatus?.((s) => {
  if (s?.ok) {
    if (acctState) acctState.lastSyncedAt = s.at;
    renderAccount();
  } else if (s?.error) flash(s.error, "err");
});
api.onAppToast?.((t) => {
  if (t?.msg) flash(t.msg, t.kind || "ok");
  if (t?.stats) renderStats?.();
});

// ---------- Unsaved changes ----------
//
// Two saving models lived side by side with nothing to tell them apart: theme
// and accent colour save the moment they are picked, everything else waits
// for Save. So the Save button now says which state you are in: "Saved" and
// greyed out when there is nothing pending, "Save changes" when there is.
//
// Dirty means "the form differs from what it showed when last loaded or
// saved", compared against a snapshot of the form itself rather than against
// config, because the form and config spell some values differently and a
// direct comparison would call a freshly loaded page dirty.
const SAVES_ITSELF = ["theme", "uiAccent"];
// Where you are in the window, not settings: collect() carries them so a save
// remembers the layout, but moving between pages or folding a card is not an
// unsaved change. Found by driving it: without this, visiting any page other
// than the one you started on lit up Save changes.
const WINDOW_STATE = ["uiPage", "uiTabs", "sectionsOpen", "collapsed", "cardOrder"];
let formBaseline = null;
function formSnapshot() {
  try {
    const c = collect();
    for (const k of [...SAVES_ITSELF, ...WINDOW_STATE]) delete c[k];
    return JSON.stringify(c);
  } catch {
    return null;
  }
}
function markFormSaved() {
  formBaseline = formSnapshot();
  renderSaveState();
}
function formDirty() {
  return formBaseline !== null && formSnapshot() !== formBaseline;
}
function renderSaveState() {
  const b = document.getElementById("btn-save");
  if (!b) return;
  const dirty = formDirty();
  b.disabled = !dirty;
  b.textContent = dirty ? "Save changes" : "Saved";
  b.classList.toggle("dirty", dirty);
  b.title = dirty
    ? "You have changes that are not saved yet."
    : "Everything is saved. Theme and colour save as soon as you pick them.";
}
{
  let t = null;
  const later = () => {
    clearTimeout(t);
    t = setTimeout(renderSaveState, 150);
  };
  // Clicks too: some settings are buttons (the timetable's day chips), not inputs.
  for (const ev of ["input", "change", "click"]) document.addEventListener(ev, later, true);
}

$("#btn-save").onclick = async () => {
  const c = collect();
  config = await api.setConfig(c);
  applyAccent(config.uiAccent);
  applyTheme(config.theme);
  markFormSaved();
  flash("Settings saved", "ok");
};
$("#btn-next").onclick = async () => {
  flash("Fetching wallpaper…");
  await api.next();
  await refreshInfo();
  flash("Wallpaper updated", "ok");
};

// ---------- Title-bar wallpaper controls ----------
// Like / dislike / previous / next / pause all live in the title bar so they
// are one click away from every page.
var cyclePaused = false;
function renderPlayPause() {
  const b = document.getElementById("hdr-playpause");
  if (!b) return;
  // The label is what the button will do; the highlight shows the state. It
  // used to say "Playing" or "Paused", which reads equally well as a state or
  // as an instruction.
  b.textContent = cyclePaused ? "Resume" : "Pause";
  b.title = cyclePaused
    ? "Wallpaper changes are paused. Click to resume."
    : "Wallpaper changes automatically. Click to pause.";
  b.setAttribute("aria-pressed", String(cyclePaused));
  b.classList.toggle("on", cyclePaused);
}
document.getElementById("hdr-thumb")?.addEventListener("click", () => goPage("home"));
// Both title bar thumbs go through the same path the Library uses, so the
// toggle, the cached sets and the lit state can never disagree. The old handler
// added the id to likedIds unconditionally, even when the click had just
// cleared the like, which left the button lit for a wallpaper that was no
// longer liked.
async function reactLikeCurrent() {
  if (!currentWp || !currentWp.id) return flash("No wallpaper yet", "err");
  try {
    await changeWallpaperReaction(currentWp, "liked");
  } catch (e) {
    flash(e.message || "Could not update wallpaper", "err");
  }
}
async function reactDislikeCurrent() {
  if (!currentWp || !currentWp.id) return flash("No wallpaper yet", "err");
  // Clearing a dislike must not skip: there is nothing to move away from. Only
  // a fresh dislike picks a replacement, which is what the tooltip promises.
  if (wallpaperState(currentWp.id) === "disliked") {
    try {
      await changeWallpaperReaction(currentWp, "disliked");
    } catch (e) {
      flash(e.message || "Could not update wallpaper", "err");
    }
    return;
  }
  // Permanent, and it moves on straight away, so it gets an Undo rather than
  // a confirmation box: the cheap action stays one click, the mistake stays
  // one click to reverse.
  const item = { ...currentWp };
  const r = await api.dislike();
  if (!r.ok) return flash(r.reason, "err");
  dislikedIds.add(String(r.id));
  config = await api.getConfig();
  renderHeaderReactions();
  flash("Disliked. It won't be shown again.", "ok", {
    label: "Undo",
    run: async () => {
      const u = await api.undoDislike(item);
      if (!u || !u.ok) return flash((u && u.reason) || "Could not undo that", "err");
      dislikedIds.delete(String(item.id));
      config = await api.getConfig();
      await loadHistory();
      refreshInfoFrom(u.info);
      flash("Undone. It's back on your desktop.", "ok");
    },
  });
}
document.getElementById("hdr-like")?.addEventListener("click", reactLikeCurrent);
document.getElementById("hdr-dislike")?.addEventListener("click", reactDislikeCurrent);
document.getElementById("hdr-prev")?.addEventListener("click", async () => {
  const info = await api.wpBack();
  await loadHistory();
  refreshInfoFrom(info);
});
document.getElementById("hdr-playpause")?.addEventListener("click", async () => {
  if (!api.setPaused) {
    flash("Pause needs a newer app version", "err");
    return;
  }
  cyclePaused = !!(await api.setPaused());
  renderPlayPause();
  flash(cyclePaused ? "Automatic changes paused" : "Automatic changes resumed", "ok");
});
document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-ext]");
  if (a) {
    e.preventDefault();
    api.openExternal(a.dataset.ext);
  }
});
// Wallpaper changes can arrive in bursts (skip, prefetch, schedule tick); one
// refresh per quiet moment is plenty and avoids rebuilding lists repeatedly.
let changedTimer = null;
api.onChanged(() => {
  clearTimeout(changedTimer);
  changedTimer = setTimeout(async () => {
    await loadHistory();
    refreshInfo();
  }, 150);
});

// Put the new values on screen, not just in the variable.
//
// Without hydrateInputs the form kept whatever was typed before a cloud pull
// arrived, and the next Save read the stale values straight back out of the
// DOM and uploaded them -- silently undoing whatever the other machine had
// just changed. The user had not edited those fields; they pressed Save.
api.onConfigChanged?.(async (cfg) => {
  config = cfg;
  try {
    hydrateInputs(config);
  } catch {}
  refreshUpdateBanner();
  updateScheduleStatus();
});

(async () => {
  config = await api.getConfig();
  cardOrder = migrateCardOrder(
    Array.isArray(config.cardOrder) && config.cardOrder.length ? config.cardOrder : DEFAULT_ORDER,
  );
  collapsed =
    config.collapsed && typeof config.collapsed === "object" ? { ...config.collapsed } : {};
  uiPage =
    typeof config.uiPage === "string" && PAGES.some((p) => p.id === config.uiPage)
      ? config.uiPage
      : "home";
  uiTabs = config.uiTabs && typeof config.uiTabs === "object" ? { ...config.uiTabs } : {};
  sectionsOpen =
    config.sectionsOpen && typeof config.sectionsOpen === "object"
      ? { ...config.sectionsOpen }
      : {};
  applyAccent(config.uiAccent || "#7c5cff");
  applyTheme(config.theme || "glass");
  renderSidebar();
  renderPageHead();
  renderCards();
  hydrateInputs(config);
  await loadHistory();
  await refreshInfo();
  try {
    const v = await api.appVersion();
    document.getElementById("app-version").textContent = "v" + v;
    const sv = document.getElementById("sidebar-version");
    if (sv) sv.textContent = "v" + v;
    document.title = "WallRaven - Settings";
  } catch {}
  refreshUpdateBanner();
  await refreshAccount();

  try {
    const meta = await api.updateInfo?.();
    if (meta && meta.storeManaged) {
      storeManaged = true;
      storeMessage = meta.storeMessage || "The Microsoft Store keeps this copy up to date.";
    }
  } catch {}
  applyStoreUi();
  showIntroPanel().catch(() => {});
  if (uiPage === "browse" && !browseState.searched) {
    try {
      runBrowse();
    } catch {}
  }
  try {
    hotkeyStatus = await api.hotkeysStatus?.();
  } catch {}
  renderHotkeyStatus();
  api.onHotkeysStatus?.((st) => {
    hotkeyStatus = st;
    renderHotkeyStatus();
  });
  renderUpdatesCard();
  refreshUpdateBanner();

  if (!storeManaged)
    api
      .updateCheck?.()
      .then((info) => {
        if (info) {
          config.updateInfo = info;
          refreshUpdateBanner();
          renderUpdatesCard();
        }
      })
      .catch(() => {});
  api.onUpdateStatus?.(async (s) => {
    const wrap = $("#upd-progress-wrap"),
      bar = $("#upd-progress");
    if (s.phase === "downloading") {
      if (wrap) wrap.style.display = "";
      if (bar) bar.style.width = (s.percent || 0) + "%";
      setUpdStatus(`Downloading… ${s.percent || 0}%`);
      return;
    }
    if (wrap) wrap.style.display = "none";
    if (s.phase === "downloaded") {
      config = await api.getConfig();
      renderUpdatesCard();
      setUpdStatus("Installer downloaded and ready.", "ok");
      flash("Update downloaded — click Install & restart", "ok");
    } else if (s.phase === "available") {
      config = await api.getConfig();
      renderUpdatesCard();
      refreshUpdateBanner();
    } else if (s.phase === "uptodate") {
      config = await api.getConfig();
      renderUpdatesCard();
      setUpdStatus("You are on the latest version.", "ok");
    } else if (s.phase === "installing")
      setUpdStatus("Launching installer — WallRaven will close…");
    else if (s.phase === "store") {
      storeManaged = true;
      storeMessage = s.message || storeMessage;
      renderUpdatesCard();
    } else if (s.phase === "error") setUpdStatus(s.message || "Update failed", "err");
  });

  // Fade-to-peek: hovering the Fade button drops the WHOLE window (chrome,
  // header, toasts and all) to invisible so you can see the wallpaper behind
  // it. Click to pin it faded; click again, press Esc or move the mouse away
  // to bring it back.
  const fadeBtn = fadeBtnEl || document.getElementById("btn-fade");
  if (fadeBtn && api.setWindowOpacity) {
    let restoreTimer = null;
    // Kept so the guards below read the same as before. Nothing sets it now
    // that clicking does not pin.
    const pinned = false;
    let faded = false;
    let fadedAt = 0;
    // Windows makes a layered window click-through once its alpha gets close
    // to zero, which fired an instant mouseleave and snapped the window back
    // to full opacity (looked like Fade had stopped working). Keep a small
    // floor so the window still receives mouse events, and ignore leave
    // events that arrive right after fading.
    const FADED = 0.06;
    let armTimer = null;
    const fade = () => {
      clearTimeout(restoreTimer);
      faded = true;
      fadedAt = Date.now();
      fadeBtn.classList.remove("arming");
      api.setWindowOpacity(FADED);
    };
    // One second of deliberate hovering before anything happens, with the
    // button turning pearlescent on the way so you can see it coming.
    const arm = () => {
      if (faded || pinned) return;
      clearTimeout(armTimer);
      fadeBtn.classList.add("arming");
      armTimer = setTimeout(fade, 1000);
    };
    const disarm = () => {
      clearTimeout(armTimer);
      fadeBtn.classList.remove("arming");
    };
    const restore = (force) => {
      if (pinned && !force) return;
      if (faded && !force && Date.now() - fadedAt < 400) return;
      clearTimeout(restoreTimer);
      restoreTimer = setTimeout(() => {
        faded = false;
        api.setWindowOpacity(1);
      }, 40);
    };
    fadeBtn.addEventListener("mouseenter", arm);
    fadeBtn.addEventListener("focus", arm);
    fadeBtn.addEventListener("mouseleave", () => {
      disarm();
      restore(false);
    });
    fadeBtn.addEventListener("blur", () => {
      disarm();
      restore(false);
    });
    // If the cursor genuinely moves elsewhere in the window, come back.
    document.addEventListener("mousemove", (e) => {
      if (!faded || pinned) return;
      if (e.target === fadeBtn || fadeBtn.contains(e.target)) return;
      restore(true);
    });
    // Clicking used to pin the window invisible. With the whole window at 6%
    // opacity there is nothing left to aim at, including the button itself, so
    // the only ways back were Escape or blurring the window, neither of which
    // is discoverable. Hovering is the whole feature; a click does nothing.
    fadeBtn.addEventListener("click", (e) => {
      e.preventDefault();
    });
    // Safety: never leave the window stuck invisible.
    window.addEventListener("blur", () => {
      disarm();
      pinned = false;
      fadeBtn.classList.remove("on");
      restore(true);
    });
  }
})();
