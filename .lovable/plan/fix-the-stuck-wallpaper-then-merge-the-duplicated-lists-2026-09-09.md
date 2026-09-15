## Fix the stuck wallpaper, then merge the duplicated lists

Three pieces of work in the desktop app: a real bug fix, then two rounds of tidying so the same idea isn't listed three times.

---

### 1. The bug: wallpaper stops changing after applying a community or built-in preset

What happens today: a shared preset carries the *other person's timetable* with it. When you apply it, their schedule rules replace yours. A rule can say "use playlist X" or "use my Wallhaven collection 12345" — things that don't exist on your machine. The next time the timetable ticks, Wallraven switches your source to that missing playlist or collection, every fetch then fails, and rotation quietly stops.

Reverting to your own preset doesn't help, because your own presets never touch the timetable — the broken rule is still there, still firing.

A second, quieter version of the same problem: a shared preset can turn on NSFW/sketchy results, which Wallhaven refuses to return without your own API key, so every search comes back empty.

Fixes:
- Stop sharing and importing timetables. A preset carries searches, tags, categories, purity, sort and colours only — never schedule rules. Existing shared presets that contain a schedule get it ignored on apply.
- When a shared preset asks for NSFW or sketchy results and no API key is set, apply the rest and show a clear message: "This preset needs your own Wallhaven API key for adult results — using safe results instead."
- Make rotation self-healing: if the chosen source is a playlist that's gone or a collection that returns nothing, fall back to a plain search instead of failing, and say so once in the message strip.
- Show failures instead of swallowing them: when a rotation fails, surface the reason in the Current wallpaper card rather than leaving the app looking idle.
- Applying any preset resets the "next up" prefetch queue, so a stale pre-downloaded pick from the old filters isn't used.

### 2. One idea, one name: Favourites

Right now there are three overlapping things:
- **Likes** — a heart on the current wallpaper; also silently copies it into a hidden "Liked" playlist.
- **Your Wallhaven favourites** — a separate card reading favourites from your Wallhaven account.
- **Pinned** — cache protection: files in a playlist are never deleted by cache cleanup, described as "pinned" in some places and "favourite" in others.

Consolidation:
- **Favourites** becomes the single user-facing name for wallpapers you've hearted. One card, one list, with thumbnails, and a "shuffle only my favourites" switch. The hidden "Liked" playlist becomes this list, so nothing is lost.
- **Pinned** stops being a user-facing concept. Cache text changes from "1.2 MB pinned" to "kept — favourites and playlists are never deleted". Pinning stays as internal behaviour only.
- **Your Wallhaven favourites** folds in as a source option inside the same card ("From my Wallhaven account"), not its own card.
- **Dislikes** stays separate and keeps its name (it's the opposite action, not a duplicate), but moves next to Favourites as "Blocked wallpapers".

### 3. One place for saved setups: Collections

Currently four separate cards: Presets, Preset library & community, Playlists, Local library.

Consolidation into a single **Collections** card with tabs:
- **Mine** — your saved presets and playlists together, each row showing what it is (a search setup, or a fixed set of images) with Apply / Rename / Delete / Share.
- **Browse** — the built-in starter presets and the community gallery in one list, with a "Built-in / Community" filter, search and sort. Applying from here works the same, minus the timetable import above.
- **Folders** — the local library / import-a-folder flow.

The timetable (Schedule) stays its own card — it's about *when*, not *what*, and it now references collections by name.

---

### Technical notes

- `electron/settings.html`: remove `SHARE_FIELDS`' `schedule` entry; add purity/API-key guard in `applySharedPreset`; merge cards `favorites` + likes into one `favourites`, and `presets` + `community` + `playlists` + `library` into `collections`; migrate `cardOrder`/`collapsed` keys for existing users so nothing disappears.
- `electron/cloud.cjs`: drop `schedule` from `sanitizeShared` so newly published presets never carry it.
- `electron/main.cjs`: `applyScheduleRule` validates `sourceRef` before switching mode; `fetchAndSetWallpaper` falls back to search when a playlist/collection source is unusable and reports the reason via `notifySettings`; clear `prefetched` on `config:set` when filters change; rename pinned wording in cache stats output.
- Version bump to 0.7.4 plus changelog entries. No database or website changes.

### Verification

1. Apply a community preset containing a schedule → your timetable is untouched, rotation keeps working, next/previous still work.
2. Apply an NSFW preset with no API key → warning shown, safe results still rotate.
3. Point a playlist rule at a deleted playlist → rotation falls back to search with one message, not silence.
4. Heart a wallpaper → it appears in Favourites, survives a restart, and cache cleanup never deletes it.
5. Existing user's card order and collapsed state still make sense after the merge.
