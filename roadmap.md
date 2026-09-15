# Roadmap

- [x] Release v0.8.13 with the final 4K Raven Fyra 🔥 theme artwork.
- [x] Memory leak: PowerShell helpers spawned per wallpaper change had unread stdout pipes and no timeout, so hung helpers became permanent ~60 MB processes. Now routed through a hardened runner (drains + caps output, times out, kills process tree, cleans up on quit). Prefetch and thumbnail caches bounded. Version bumped to 0.7.1.
- [x] Onboarding wizard / tutorial — descoped by user request.
- [x] Quality pass (v0.7.2): saved session tokens encrypted via safeStorage; `shell.openExternal` restricted to http(s); explorer.exe `/select` quote-injection guarded; popular-tags cache bounded; config writes debounced with flush on quit.
- [x] Quality pass (website): per-IP rate limits on all public endpoints (feedback, pairing start/poll, copy counter, thumbnails); copy counter now an atomic DB function with one count per visitor per preset per hour; pairing verifier compared in constant time; thumbnail cache capped at 500 entries.
- [ ] Feedback inbox: submissions land in the private `feedback` table with no UI to read them. Needs an owner-only page (user_roles + admin route) if the user wants visibility in-app.
- [x] Likes/dislikes UI: separate collapsible Liked and Disliked galleries, preserve wallpaper details for dislikes, and use mutually exclusive toggle controls on all wallpaper thumbnails.
- [x] Settings recategorisation (v0.7.5): 16 cards merged into 6 (Now playing, Search & filters, Favourites & blocked, Collections, Cycle & timetable, App); cache moved under App, colours/resolution/browse under Search, timetable under Cycle, hotkeys/account/updates/feedback under App; legacy card ids migrated.
- [x] Settings layout repair: split oversized merged cards back into focused cards, moved display mode into Search & filters, and replaced narrow masonry columns with a wide responsive grid.
- [x] Fade transition fix (v0.7.7): overlay.html's inline script was blocked by its own CSP, so the overlay window rendered as a black screen for the whole fade. main.cjs/transition.cjs now inject the outgoing wallpaper via executeJavaScript, wait for it to decode, and skip the fade entirely if it can't paint.
- [x] Card packing: cards flow into wide columns (460px) so tall cards no longer leave large empty rows; per-section collapsible headings retained.
- [ ] Homepage redesign mock-up (not committed): elegant WuWa / Zenless Zone Zero styled direction built around the new WallRaven mascot character sheet.
- [x] App icon: user reviewed raven-head and perched-raven badges and decided to keep the existing "WR" mark. Do not re-propose replacing it.
- [x] App shell restructure (0.8.0-beta.1, test build only): six destinations (Home, Browse, Library, Presets, Schedule, Settings) in a left sidebar, sub-tabs on Library and Settings, quick actions on Home. All 19 cards still built once so existing wiring is untouched; page/tab choice persisted as `uiPage`/`uiTabs`. Main update channel deliberately left on 0.7.7.
- [x] Raven theme background: replaced the small mascot watermark with large, integrated, low-distraction artwork that remains balanced across window sizes.
- [x] Raven Beach theme: added a selectable sunny summer variation with Raven, her companion, and readable glass panels.
- [x] Cereal game polish: slowed the difficulty curve, registered pieces on pointer-down, and added an explicit final-score screen with a Play again control.
- [x] Raven theme quality: restored the original scene at 4K and removed “(mascot)” from its name.

## Packaging note
- Always package with `--icon=electron/icon.ico` so the exe embeds the WR icon; without it Windows pins the default Electron logo. `app.setAppUserModelId("com.wallraven.app")` keeps taskbar grouping stable.
