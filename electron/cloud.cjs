// Wallraven cloud account + sync (v0.4.0)
// Browser-based pairing: the app never handles your password.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const { shell, app, safeStorage } = require('electron');

const SITE_URL = 'https://wallraven.lovable.app';
const SUPABASE_URL = 'https://bwvbilkfcmjnvopjpaer.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_g0yinRk5yCpzNvpOhF8tVg_gW4ansSo';

// ---------- tiny JSON https helper ----------
// Timeouts matter here as much as anywhere: pollSignIn runs on a 2.5s interval
// while pairing, so a request that hangs would stack up indefinitely, and a
// hung token refresh would leave the account stuck in a half-signed-in state.
const REQUEST_CONNECT_TIMEOUT = 15000;
const REQUEST_TOTAL_TIMEOUT = 30000;

function request(url, { method = 'GET', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body == null ? null : Buffer.from(JSON.stringify(body));
    let settled = false;
    let overall = null;
    const done = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(overall);
      fn(arg);
    };

    const req = https.request(
      {
        method,
        hostname: u.hostname,
        path: u.pathname + u.search,
        timeout: REQUEST_CONNECT_TIMEOUT,
        headers: {
          'content-type': 'application/json',
          'user-agent': 'Wallraven',
          ...(payload ? { 'content-length': payload.length } : {}),
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('error', (e) => done(reject, e));
        res.on('end', () => {
          let parsed = null;
          try { parsed = data ? JSON.parse(data) : null; } catch { parsed = data; }
          done(resolve, { status: res.statusCode, body: parsed });
        });
      },
    );
    overall = setTimeout(() => {
      req.destroy();
      done(reject, new Error('request timed out'));
    }, REQUEST_TOTAL_TIMEOUT);
    req.on('timeout', () => { req.destroy(); done(reject, new Error('connection timed out')); });
    req.on('error', (e) => done(reject, e));
    if (payload) req.write(payload);
    req.end();
  });
}

// ---------- persisted session ----------
let AUTH_PATH = null;
function authPath() {
  if (!AUTH_PATH) AUTH_PATH = path.join(app.getPath('userData'), 'account.json');
  return AUTH_PATH;
}
// Session tokens are encrypted at rest with the OS keystore (DPAPI on
// Windows) so a stolen copy of the file isn't a usable login. Plaintext is
// only used as a fallback where the OS offers no encryption, and older
// plaintext files are read once and re-written encrypted.
function canEncrypt() {
  try { return safeStorage.isEncryptionAvailable(); } catch { return false; }
}
function loadAuth() {
  try {
    if (!fs.existsSync(authPath())) return null;
    const raw = fs.readFileSync(authPath(), 'utf8');
    if (raw.startsWith('enc:')) {
      if (!canEncrypt()) return null;
      const json = safeStorage.decryptString(Buffer.from(raw.slice(4), 'base64'));
      return JSON.parse(json);
    }
    const parsed = JSON.parse(raw);
    if (canEncrypt()) saveAuth(parsed); // upgrade legacy plaintext in place
    return parsed;
  } catch {}
  return null;
}
function saveAuth(a) {
  try {
    if (canEncrypt()) {
      const blob = 'enc:' + safeStorage.encryptString(JSON.stringify(a)).toString('base64');
      fs.writeFileSync(authPath(), blob, { mode: 0o600 });
    } else {
      fs.writeFileSync(authPath(), JSON.stringify(a, null, 2), { mode: 0o600 });
    }
  } catch (e) { console.error('auth save', e); }
}
function clearAuth() {
  try { if (fs.existsSync(authPath())) fs.unlinkSync(authPath()); } catch {}
}

let auth = null;
function currentAuth() {
  if (auth === null) auth = loadAuth();
  return auth;
}

// Supabase rotates the refresh token on every use, so two refreshes racing
// with the same token means the first wins and the second comes back
// invalid_grant. That is treated as a hard failure and clears the session, so
// the device silently unlinks and has to be paired again.
//
// It is easy to hit: the 15-minute cloudPull timer, a settings push and a
// username lookup can all notice the expiry within milliseconds of each other.
// Holding a single in-flight promise means concurrent callers await the same
// request instead of starting their own.
let refreshInFlight = null;

async function accessToken() {
  const a = currentAuth();
  if (!a || !a.refresh_token) return null;
  const stillValid = a.access_token && a.expires_at && a.expires_at * 1000 - Date.now() > 60_000;
  if (stillValid) return a.access_token;

  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = refreshAccessToken(a).finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

async function refreshAccessToken(a) {
  let res;
  try {
    res = await request(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY },
      body: { refresh_token: a.refresh_token },
    });
  } catch {
    // Offline / DNS failure — keep the saved session so the device stays
    // linked and simply retry next time.
    return null;
  }

  if (res.status !== 200 || !res.body?.access_token) {
    // Only drop the session when the server explicitly rejects the refresh
    // token. Anything else (5xx, rate limit, gateway error) is transient and
    // must NOT unlink the device — that was forcing a re-pair after updates.
    const code = res.body?.error || res.body?.error_code || '';
    const hardFail = res.status === 400 && /invalid_grant|refresh_token_not_found|invalid_request/i.test(String(code) + JSON.stringify(res.body || ''));
    if (hardFail || res.status === 401 || res.status === 403) {
      clearAuth();
      auth = null;
    }
    return null;
  }
  auth = {
    access_token: res.body.access_token,
    refresh_token: res.body.refresh_token || a.refresh_token,
    expires_at: res.body.expires_at || Math.floor(Date.now() / 1000) + (res.body.expires_in || 3600),
    email: res.body.user?.email || a.email,
    user_id: res.body.user?.id || a.user_id,
  };
  saveAuth(auth);
  return auth.access_token;
}


// ---------- pairing ----------
//
// The app asks the website to start a pairing, and gets back two things: a code
// to show you, and a secret it keeps to itself.
//
// It used to work the other way round. The app invented a code, and the website
// accepted it and put it in the link it opened in your browser. That meant
// anyone could invent a code of their own, send you a link carrying it, and
// collect your account the moment you pressed the button on that page, because
// nothing on it told you the request was not yours. Now the code comes from the
// server and never travels in a link: you read it off this app and type it into
// the website yourself, which is only possible if you are sitting at the machine
// that asked.
let pairing = null; // { deviceCode, userCode, deadline }

async function startSignIn(deviceName) {
  cancelSignIn();

  const res = await request(`${SITE_URL}/api/public/pair/start`, {
    method: 'POST',
    body: { device_name: deviceName || 'Wallraven desktop' },
  });
  if (res.status !== 200 || !res.body?.device_code || !res.body?.user_code) {
    throw new Error('Could not start sign-in. Check your internet connection.');
  }

  const ttlMs = Math.max(60, Number(res.body.expires_in) || 600) * 1000;
  // The device code is the secret half and must never be shown or logged.
  pairing = {
    deviceCode: res.body.device_code,
    userCode: String(res.body.user_code),
    deadline: Date.now() + ttlMs,
  };

  // No code in the URL, by design. The page asks for it.
  const url = typeof res.body.verification_uri === 'string' && res.body.verification_uri.startsWith(`${SITE_URL}/`)
    ? res.body.verification_uri
    : `${SITE_URL}/link`;
  await shell.openExternal(`${url}?link=1`);
  return { code: pairing.userCode, url };
}

function cancelSignIn() {
  pairing = null;
}

// Called on a timer by main; returns 'pending' | 'signed_in' | 'expired' | 'idle'
async function pollSignIn() {
  if (!pairing) return { status: 'idle' };
  if (Date.now() > pairing.deadline) {
    pairing = null;
    return { status: 'expired' };
  }
  const res = await request(`${SITE_URL}/api/public/pair/poll`, {
    method: 'POST',
    body: { device_code: pairing.deviceCode },
  });
  if (res.status === 410) { pairing = null; return { status: 'expired' }; }
  if (res.status !== 200 || res.body?.status !== 'ok') return { status: 'pending' };

  const session = res.body.session || {};
  pairing = null;
  auth = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at || Math.floor(Date.now() / 1000) + 3600,
    email: null,
    user_id: null,
  };
  saveAuth(auth);

  // Fetch the email for display.
  try {
    const me = await request(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${auth.access_token}` },
    });
    if (me.status === 200 && me.body?.email) {
      auth.email = me.body.email;
      auth.user_id = me.body.id;
      saveAuth(auth);
    }
  } catch {}

  return { status: 'signed_in', email: auth.email };
}

async function signOut() {
  USERNAME_CACHE = null;
  const token = currentAuth()?.access_token;
  if (token) {
    try {
      await request(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
      });
    } catch {}
  }
  clearAuth();
  auth = null;
  cancelSignIn();
  return { ok: true };
}

let USERNAME_CACHE = null;

function status() {
  const a = currentAuth();
  return {
    signedIn: Boolean(a && a.refresh_token),
    email: a?.email || null,
    username: USERNAME_CACHE,
    pairing: Boolean(pairing),
  };
}

// ---------- account username (stored on the account, syncs across machines) ----------
const USERNAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{2,23}$/;

function normalizeUsername(name) {
  return String(name || '').trim().replace(/\s+/g, '');
}

async function getUsername() {
  const token = await accessToken().catch(() => null);
  const a = currentAuth();
  if (!token || !a?.user_id) return { ok: false, reason: 'signed_out', username: null };
  const res = await request(
    `${SUPABASE_URL}/rest/v1/profiles?select=username&id=eq.${encodeURIComponent(a.user_id)}`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } },
  );
  if (res.status !== 200 || !Array.isArray(res.body)) return { ok: false, reason: 'read_failed', username: null };
  USERNAME_CACHE = res.body[0]?.username || null;
  return { ok: true, username: USERNAME_CACHE };
}

async function setUsername(name) {
  const token = await accessToken().catch(() => null);
  const a = currentAuth();
  if (!token || !a?.user_id) return { ok: false, reason: 'signed_out' };
  const clean = normalizeUsername(name);
  if (!USERNAME_RE.test(clean)) return { ok: false, reason: 'invalid' };
  const res = await request(`${SUPABASE_URL}/rest/v1/profiles`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: { id: a.user_id, username: clean },
  });
  if (res.status === 409 || (res.status >= 300 && /duplicate|unique/i.test(JSON.stringify(res.body || '')))) {
    return { ok: false, reason: 'taken' };
  }
  if (res.status >= 300) return { ok: false, reason: 'write_failed' };
  USERNAME_CACHE = clean;
  return { ok: true, username: clean };
}

async function isUsernameAvailable(name) {
  const clean = normalizeUsername(name);
  if (!USERNAME_RE.test(clean)) return { ok: false, reason: 'invalid' };
  const a = currentAuth();
  const res = await request(
    `${SUPABASE_URL}/rest/v1/profiles?select=id,username&username=ilike.${encodeURIComponent(clean)}`,
    { headers: { apikey: SUPABASE_ANON_KEY } },
  );
  if (res.status !== 200 || !Array.isArray(res.body)) return { ok: false, reason: 'read_failed' };
  const taken = res.body.some((r) => r.id !== a?.user_id);
  return { ok: true, available: !taken };
}


// ---------- what syncs ----------
// Machine-specific keys deliberately excluded: apiKey, autoStart, startMinimized,
// cardOrder/collapsed (per-screen layout), monitorMode, updateInfo, playlistIndex.
const SECTIONS = {
  settings: [
    'query', 'categories', 'purity', 'sorting', 'order', 'topRange',
    'minResolution', 'resolutions', 'ratios', 'atleastResolution', 'colors',
    'aiArtFilter', 'cycleMinutes', 'cacheMaxMB', 'uiAccent', 'theme',
    'notifyOnChange', 'whUsername', 'sourceMode', 'collectionId', 'fitMode',
    'hotkeysEnabled', 'hotkeys', 'schedule', 'matchLockScreen',
  ],
  presets: ['presets'],
  playlists: ['playlists', 'activePlaylist', 'playlistTagFilters'],
  likes: ['likes', 'dislikes', 'blacklistTagIds'],
};

function sectionFromConfig(config, name) {
  const out = {};
  for (const key of SECTIONS[name]) {
    if (config[key] !== undefined) out[key] = config[key];
  }
  return out;
}

function stripPlaylists(playlists) {
  // Only metadata syncs — never local cache file paths.
  const out = {};
  for (const [name, pl] of Object.entries(playlists || {})) {
    out[name] = {
      createdAt: pl?.createdAt || Date.now(),
      items: (pl?.items || []).map((it) => ({
        id: it.id,
        url: it.url,
        thumb: it.thumb,
        resolution: it.resolution,
        file_type: it.file_type,
        tags: it.tags,
      })),
    };
  }
  return out;
}

async function fetchRemote() {
  const token = await accessToken();
  if (!token) return null;
  const res = await request(
    `${SUPABASE_URL}/rest/v1/user_settings?select=config,updated_at&limit=1`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } },
  );
  if (res.status !== 200 || !Array.isArray(res.body)) return null;
  return res.body[0] || { config: {} };
}

async function writeRemote(cloudConfig) {
  const token = await accessToken();
  const a = currentAuth();
  if (!token || !a?.user_id) return false;
  const res = await request(`${SUPABASE_URL}/rest/v1/user_settings?on_conflict=user_id`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: [{ user_id: a.user_id, config: cloudConfig }],
  });
  return res.status >= 200 && res.status < 300;
}

// Push local -> cloud. force = overwrite regardless of stamps.
async function push(config, { force = false } = {}) {
  const a = currentAuth();
  if (!a?.refresh_token) return { ok: false, reason: 'signed_out' };
  if (!a.user_id) await accessToken();

  const remote = (await fetchRemote())?.config || {};
  const next = { ...remote };
  const now = Date.now();

  for (const name of Object.keys(SECTIONS)) {
    const local = sectionFromConfig(config, name);
    if (name === 'playlists' && local.playlists) local.playlists = stripPlaylists(local.playlists);
    const localStamp = config._syncStamps?.[name] || 0;
    const remoteStamp = remote?.[name]?.updatedAt || 0;
    if (force || localStamp >= remoteStamp) {
      next[name] = { updatedAt: force ? now : localStamp || now, data: local };
    }
  }

  const ok = await writeRemote(next);
  return ok ? { ok: true, at: now } : { ok: false, reason: 'write_failed' };
}

// Pull cloud -> local. Returns the config patch to apply (or null).
async function pull(config, { force = false } = {}) {
  const a = currentAuth();
  if (!a?.refresh_token) return { ok: false, reason: 'signed_out' };

  const remote = (await fetchRemote())?.config;
  if (!remote) return { ok: false, reason: 'read_failed' };

  const patch = {};
  const stamps = { ...(config._syncStamps || {}) };
  let changed = false;

  for (const name of Object.keys(SECTIONS)) {
    const section = remote[name];
    if (!section || !section.data) continue;
    const remoteStamp = section.updatedAt || 0;
    const localStamp = stamps[name] || 0;
    if (force || remoteStamp > localStamp) {
      Object.assign(patch, section.data);
      stamps[name] = remoteStamp || Date.now();
      changed = true;
    }
  }

  if (!changed) return { ok: true, changed: false, at: Date.now() };
  patch._syncStamps = stamps;
  return { ok: true, changed: true, patch, at: Date.now() };
}

// ---------- community presets ----------
// Only these fields ever travel in a shared preset. Screen-specific values
// (atleastResolution, resolutions, ratios), layout, API keys and anything
// machine-local are deliberately excluded.
// Shared presets carry search intent only. Timetables are deliberately NOT
// shared: an imported rule can point at a playlist or collection the recipient
// doesn't have, which used to silently stop their wallpaper from changing.
const SHARE_FIELDS = [
  'query', 'categories', 'purity', 'sorting', 'order', 'topRange',
  'aiArtFilter', 'colors',
];

function sanitizeShared(data) {
  const src = data && typeof data === 'object' ? data : {};
  const out = {};
  for (const k of SHARE_FIELDS) if (src[k] !== undefined) out[k] = src[k];
  if (out.categories && typeof out.categories === 'object') {
    out.categories = {
      general: !!out.categories.general,
      anime: !!out.categories.anime,
      people: !!out.categories.people,
    };
  }
  if (out.purity && typeof out.purity === 'object') {
    out.purity = { sfw: !!out.purity.sfw, sketchy: !!out.purity.sketchy, nsfw: !!out.purity.nsfw };
  }
  if (Array.isArray(out.colors)) out.colors = out.colors.slice(0, 8).map(String);
  delete out.cycleMinutes;
  return out;
}

function loadBuiltinPresets() {
  try {
    const p = path.join(__dirname, 'builtin-presets.json');
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    return { categories: raw.categories || [], presets: raw.presets || [] };
  } catch (e) {
    console.error('builtin presets', e);
    return { categories: [], presets: [] };
  }
}

async function browseCommunityPresets({ category = '', search = '', sort = 'top', limit = 60 } = {}) {
  const params = new URLSearchParams();
  params.set('select', 'id,name,description,category,tags,author_name,data,like_count,copy_count,created_at,user_id');
  params.set('hidden', 'eq.false');
  params.set('limit', String(Math.max(1, Math.min(200, limit))));
  if (category) params.set('category', `eq.${category}`);
  // PostgREST reads commas and parentheses as filter syntax, so a raw term
  // escapes the intended condition. Practically it also meant that typing a
  // comma in the preset search box returned a 400 and an empty gallery.
  const safeSearch = String(search || '').replace(/[,()*"\\]/g, ' ').replace(/\s+/g, ' ').trim();
  if (safeSearch) params.set('or', `(name.ilike.*${safeSearch}*,description.ilike.*${safeSearch}*)`);
  params.set('order', sort === 'new' ? 'created_at.desc' : sort === 'copied' ? 'copy_count.desc' : 'like_count.desc');

  const token = await accessToken().catch(() => null);
  const headers = { apikey: SUPABASE_ANON_KEY };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await request(`${SUPABASE_URL}/rest/v1/community_presets?${params.toString()}`, { headers });
  if (res.status !== 200 || !Array.isArray(res.body)) return { ok: false, items: [] };

  let liked = [];
  if (token) {
    const l = await request(`${SUPABASE_URL}/rest/v1/preset_likes?select=preset_id`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (l.status === 200 && Array.isArray(l.body)) liked = l.body.map((r) => r.preset_id);
  }
  const me = currentAuth()?.user_id || null;
  return {
    ok: true,
    items: res.body.map((r) => ({ ...r, liked: liked.includes(r.id), mine: !!me && r.user_id === me })),
  };
}

function cleanAuthorName(name, email) {
  const n = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 32);
  if (n) return n;
  return (email || 'Anonymous').split('@')[0];
}

async function publishCommunityPreset({ name, description = '', category = 'Other', tags = [], data = {}, authorName = '' }) {
  const token = await accessToken();
  const a = currentAuth();
  if (!token || !a?.user_id) return { ok: false, reason: 'signed_out' };
  if (!USERNAME_CACHE) await getUsername().catch(() => {});
  const clean = sanitizeShared(data);
  const res = await request(`${SUPABASE_URL}/rest/v1/community_presets`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, Prefer: 'return=representation' },
    body: {
      user_id: a.user_id,
      author_name: USERNAME_CACHE || cleanAuthorName(authorName, a.email),
      name: String(name || '').slice(0, 80),
      description: String(description || '').slice(0, 300),
      category: String(category || 'Other').slice(0, 40),
      tags: (Array.isArray(tags) ? tags : []).slice(0, 8).map((t) => String(t).slice(0, 24)),
      data: clean,
    },
  });
  if (res.status >= 300) return { ok: false, reason: 'write_failed' };
  return { ok: true, preset: Array.isArray(res.body) ? res.body[0] : res.body };
}

// Rename the display name on every preset this account has published.
async function renameCommunityAuthor(authorName) {
  const token = await accessToken();
  const a = currentAuth();
  if (!token || !a?.user_id) return { ok: false, reason: 'signed_out' };
  const finalName = cleanAuthorName(authorName, a.email);
  const res = await request(
    `${SUPABASE_URL}/rest/v1/community_presets?user_id=eq.${encodeURIComponent(a.user_id)}`,
    {
      method: 'PATCH',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, Prefer: 'return=representation' },
      body: { author_name: finalName },
    },
  );
  if (res.status >= 300) return { ok: false, reason: 'write_failed' };
  return { ok: true, name: finalName, count: Array.isArray(res.body) ? res.body.length : 0 };
}


async function deleteCommunityPreset(id) {
  const token = await accessToken();
  if (!token) return { ok: false, reason: 'signed_out' };
  const res = await request(`${SUPABASE_URL}/rest/v1/community_presets?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  return { ok: res.status < 300 };
}

async function likeCommunityPreset(id, liked) {
  const token = await accessToken();
  const a = currentAuth();
  if (!token || !a?.user_id) return { ok: false, reason: 'signed_out' };
  if (liked) {
    const res = await request(`${SUPABASE_URL}/rest/v1/preset_likes`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, Prefer: 'resolution=ignore-duplicates' },
      body: { preset_id: id, user_id: a.user_id },
    });
    return { ok: res.status < 300 };
  }
  const res = await request(
    `${SUPABASE_URL}/rest/v1/preset_likes?preset_id=eq.${encodeURIComponent(id)}&user_id=eq.${a.user_id}`,
    { method: 'DELETE', headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } },
  );
  return { ok: res.status < 300 };
}

async function markCommunityPresetCopied(id) {
  try {
    const res = await request(`${SITE_URL}/api/public/presets/copied`, { method: 'POST', body: { id } });
    return { ok: res.status < 300 };
  } catch {
    return { ok: false };
  }
}

module.exports = {
  SECTIONS,
  SHARE_FIELDS,
  sanitizeShared,
  loadBuiltinPresets,
  browseCommunityPresets,
  publishCommunityPreset,
  renameCommunityAuthor,
  deleteCommunityPreset,
  likeCommunityPreset,
  markCommunityPresetCopied,

  status,
  getUsername,
  setUsername,
  isUsernameAvailable,
  startSignIn,
  pollSignIn,
  cancelSignIn,
  signOut,
  push,
  pull,
};
