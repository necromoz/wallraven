# Settings: fewer, better-named sections

Today there are 16 top-level cards, several of which are one control, and a few
put unrelated things together (cache sits inside "Cycle", the Wallhaven key sits
inside "App"). This reorganises them into 6 cards with labelled sections inside.

## Proposed structure

```text
Now playing            Current wallpaper · History · Statistics
Search & filters       Search · Resolution & aspect · Colours · Browse & pick
Favourites             My favourites & blocked · From my Wallhaven account
Collections            Saved setups · Built-in & community · Playlists · Folders
Cycle & timetable      How often · Timetable · How it's shown (fit, monitors)
App                    General · Wallhaven API key · Cache & storage · Hotkeys ·
                       Account & cloud sync · Updates & changelog · Feedback
```

What moves, and why:
- **Colours**, **Resolution & aspect** and **Browse & pick** join
  **Search & filters** — all four are about choosing what turns up.
- **Timetable** moves inside **Cycle** — both answer "when does it change".
- **Fit mode** and **multi-monitor** join Cycle as "How it's shown", so nothing
  about the wallpaper itself lives under App.
- **Cache limit, location, clear cache, cleanup test** move to **App**, and the
  Wallhaven API key becomes its own labelled section there instead of sitting
  above the theme picker.
- **Hotkeys**, **Account & cloud sync**, **Updates & changelog** and
  **Feedback** all become sections of **App** — everything about the program
  rather than the pictures now lives in one place, in that order.
- The grouping menu's categories shrink from seven overlapping ones
  (Now playing, Sources, Appearance, Timing, Presets, System, Account) to four:
  Now playing, Where wallpapers come from, When they change, App.

Nothing is removed: every existing control stays, with the same behaviour.

## Technical notes

- `electron/settings.html`: split `tpl-cycle` into `tpl-cycle` (interval),
  `tpl-display` (fit + multi-monitor) and `tpl-cache`; split the API-key block
  out of `tpl-app` into `tpl-apikey`. HTML moves verbatim so all element ids and
  existing wiring keep working.
- Rebuild `CARD_META` / `DEFAULT_ORDER` around the 6 cards above using the
  existing `parts` mechanism, and rewrite `CATEGORIES`.
- Extend `CARD_MIGRATIONS` so saved layouts map old ids to new cards
  (`resolution`/`colors`/`browse` → `search`, `schedule` → `cycle`,
  `history`/`statistics` → `current`, `hotkeys`/`account`/`updates`/`feedback` →
  `app`, plus the existing favourites/collections entries), and carry collapsed
  state across.
- Bump `electron/VERSION` to 0.7.5 with a changelog entry. No website or
  database changes.

## Verification

- Every section renders once, in the new order, with no duplicate element ids.
- Settings saved on 0.7.3/0.7.4 open with a sensible order, nothing missing.
- Cache stats, cleanup test, API-key validation, hotkeys, timetable rules and
  colour palette all still work from their new homes.
