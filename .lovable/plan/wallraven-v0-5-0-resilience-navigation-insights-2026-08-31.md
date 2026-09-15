## Wallraven v0.5.0 — Resilience, Navigation & Insights

Five quality-of-life features for the desktop app, all in the Electron layer (`electron/main.cjs`, `electron/preload.cjs`, `electron/settings.html`). No web/backend changes, no schema changes. Bump `electron/VERSION` to `0.5.0` and add a CHANGELOG entry.

---

### 1. Offline / cached-only mode

Today a dead or metered connection makes `fetchAndSetWallpaper` throw and the wallpaper just stops changing. Add a graceful fallback.

- **Connectivity probe** before each rotation: a short (3s) `https.get` to `https://wallhaven.cc/api/v1/wallpapers/1` (cheap, always 200). On failure (or a user toggle), switch to **cached-only** selection.
- **Cached-only selection**: pick a random cached wallpaper file from `CACHE_DIR` (excluding the current one and respecting pinned files like the folder-rotation path already does), apply it with `applyWallpaper`. No API call, no download.
- **Settings toggle**: "When offline, cycle cached wallpapers" (default on). Also a manual "Cached-only mode" toggle for metered connections / travellers.
- **Surfacing**: a toast in the message strip — "Offline — cycling cached wallpapers" — repeated only when the state changes, not every rotation.
- Also guard the manual `wp:next`: if offline and cached-only is on, serve from cache instead of erroring.

### 2. Smart prefetch (instant rotation)

Each rotation currently downloads on demand, so there's a fetch-then-set pause. Pre-warm the next candidate.

- After a successful rotation, schedule a background prefetch (debounced ~10s, skipped while a fullscreen app is active, skipped if offline).
- Prefetch runs the same `searchWithFallback` selection logic, picks one candidate not already cached and not recently shown, downloads it to `CACHE_DIR/<id>.<ext>`, and records it in a small `prefetched` set in memory.
- The next rotation prefers a prefetched candidate (instant apply, no download); if none, falls back to today's live fetch.
- Failure is silent — prefetch is best-effort and never blocks the UI or the timer.

### 3. Wallpaper crossfade — honest scope

Windows has **no API** to crossfade a programmatically-set desktop wallpaper (`SystemParametersInfo` swaps instantly). A true desktop fade would require a borderless, click-through, always-on-bottom fullscreen overlay window animated on opacity — fragile, can fight desktop-icon z-order, and breaks multi-monitor. **Not recommended.**

What we *will* deliver as the "crossfade" part:
- A smooth crossfade in the **Current wallpaper preview** in the Settings window (the thumbnail fades between old and new on each rotation).
- A 1–2s fade of the app's own **Fade/peek** window transitions.

The big perceived win is really **prefetch** (above): with the next image already on disk, the swap feels instant instead of "freeze → new wallpaper". The plan pairs them for that reason.

### 4. Back / forward history navigation

Replace the single-step `setPreviousWallpaper` (which re-appends and loses forward state) with browser-style navigation.

- Add `historyNav`: a cursor index into a forward/back stack. New rotation pushes onto the stack and clears the forward stack (like a browser).
- **Back** and **Forward** move the cursor and re-apply the wallpaper at that position *without* duplicating history entries or mutating the timeline.
- Expose in three places: tray menu (Previous / Next wallpaper, with Forward greyed out when at the top), hotkeys (`Ctrl+Alt+Left` / `Ctrl+Alt+Right`, configurable), and **arrow buttons on the Current wallpaper card** in Settings.
- Keep the existing 200-item history timeline intact for the History grid; navigation is a separate cursor over it.

### 5. Wallhaven API key — validate & surface (already wired)

The API key field already exists and is sent on every search. Don't rebuild it — add the missing UX:

- **"Validate key" button** next to the field: hits the Wallhaven API with the key and shows ✓ valid / ✗ invalid + account username, so users know it works before relying on NSFW/collections.
- **Sync to account**: store the key in the cloud profile (`user_settings.config`) so it follows the user across machines (it's the user's own key on their own account). Marked as a sensitive section; never logged.
- Clearer helper text: "Required for NSFW purity and reading your Wallhaven collections. Sent on every search for higher rate limits."

### 6. Statistics card

A new card giving the History grid context. Computed from existing data plus a few lightweight counters.

- **Wallpapers shown**: all-time and this-month, from `history.items[].ts`.
- **Cache**: total MB, pinned MB, file count, hit rate (rotations served from cache vs downloaded — needs a small counter incremented in `fetchAndSetWallpaper`).
- **Likes / dislikes**: counts from the existing arrays.
- **Fallback rate**: how often filters were too narrow and Wallraven dropped a constraint (track from `searchWithFallback`'s `usedFallback`).
- **Most-shown sources**: top 3 search queries or playlists by count (from history + a small tally).
- A "Reset statistics" button (clears the counters; history itself is untouched).

---

### Implementation notes

- New config keys: `offlineCachedOnly` (bool), `offlineCachedOnlyManual` (bool), `prefetchEnabled` (bool, default true), `historyNav` (cursor state), `stats` (counters object). All get default values in `DEFAULT_CONFIG` and sync-stamped where appropriate.
- New IPC handlers: `wp:back`, `wp:forward`, `stats:get`, `stats:reset`, `apikey:validate`. Exposed via `preload.cjs`.
- New Settings card "Statistics" added to `cardOrder` default; back/forward arrows on the Current card; Validate button on the API key row.
- Offline probe reuses the existing `httpsGetJSON`; prefetch reuses `searchWithFallback` + `downloadFile`.

### Verification before packaging

1. Toggle offline (disable network in the dev VM or point probe at a bad host) → confirm cached-only rotation works and the toast shows once.
2. Enable prefetch → confirm the next rotation applies instantly with no download, and that fullscreen pause still defers it.
3. Back/Forward via tray, hotkey, and card arrows → confirm cursor moves without duplicating history entries; new rotation clears forward.
4. Validate API key button returns ✓ for a real key.
5. Statistics card shows non-zero counts after a few rotations; Reset clears counters only.
6. Bump to **v0.5.0**, rebuild the installer, verify the in-app version reads 0.5.0.
