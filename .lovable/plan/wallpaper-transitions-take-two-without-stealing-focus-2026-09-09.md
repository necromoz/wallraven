## Wallpaper transitions, take two — without stealing focus

Yes, this is doable. The focus theft last time came from *how* the fade window was shown, not from the fade itself. Windows has no API to crossfade a wallpaper, so the effect needs a full-screen window that shows the old image, fades it out, and closes — and that window must be created and shown in a way that never becomes the active window.

### What went wrong before

The overlay window was created and shown with the normal show path, so Windows made it the foreground window. Whatever the user was typing into lost focus for the length of the fade.

### The fix

Create the overlay with every "don't touch me" flag set, and never call the focusing show path:

- `focusable: false`, `frame: false`, `transparent: true`, `skipTaskbar: true`, `resizable: false`, `movable: false`, `hasShadow: false`, `thickFrame: false`, `type: 'toolbar'`, `webPreferences: { offscreen: false, nodeIntegration: false }`
- Show it only with `showInactive()` — never `show()`, `focus()`, `setAlwaysOnTop` with focus side-effects, or `loadURL` before the flags are set
- `setIgnoreMouseEvents(true, { forward: true })` so clicks pass through to whatever is underneath
- `setAlwaysOnTop(true, 'screen-saver')` for layering, then immediately `blur()`-safe: do not call `moveTop()`
- Destroy the window as soon as the fade ends (and on a hard timeout) so nothing lingers

### Safety rails

Because this bit users once, the feature ships defensive:

1. **Off by default.** New setting "Fade between wallpapers (experimental)" in Settings, plus a short note that it draws a brief click-through overlay.
2. **Focus guard.** Right before showing the overlay, record the current foreground window; right after showing, verify focus did not move. If it did, restore it, disable the effect for the session, and show a one-line message in the settings strip. One misbehaviour and the app self-disables rather than annoying the user.
3. **Skip when it could hurt.** No overlay while a fullscreen app/game is detected (the existing pause detection), while the screen is locked, or when the fade would overlap another fade.
4. **Short and bounded.** Fade duration fixed at ~600ms (no slider this time), single overlay per rotation, per-monitor geometry taken from `screen.getAllDisplays()` so multi-monitor setups fade across the whole desktop.

### Files touched

- `electron/transition.cjs` — new, small: builds the overlay window, renders the outgoing image, animates opacity via CSS, resolves and destroys.
- `electron/main.cjs` — call it from `applyWallpaper()` just before the wallpaper swap, guarded by config + fullscreen check; new config key `fadeTransition` (default `false`); flush/destroy any live overlay on `will-quit`.
- `electron/settings.html` — one toggle in the appearance card with the experimental note.
- `electron/cloud.cjs` — include `fadeTransition` in synced settings.
- `electron/VERSION` + `electron/CHANGELOG.md` — bump to 0.7.3.

### Verification before packaging

1. Type continuously into Notepad while forcing rotations — the caret must never leave Notepad, and typed text must be unbroken.
2. Click through the overlay mid-fade — the click must land on the window underneath.
3. Run with the toggle off — confirm zero overlay windows are ever created.
4. Multi-monitor: confirm the fade covers all displays and no stray window is left behind (Task Manager / no ghost taskbar entry).
5. Fullscreen game detection: confirm no overlay appears while a fullscreen app is active.

### Honest recommendation

Worth pursuing with the guard above; not worth it without it. If step 1 fails on your machine even once, the right answer is to drop desktop fades permanently and keep the fade only inside the Settings preview thumbnail.
