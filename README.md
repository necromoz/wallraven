# WallRaven

A Windows wallpaper manager for [Wallhaven](https://wallhaven.cc). It sits in
the tray, changes your wallpaper on a timer, and gives you the same filters the
site does: resolution, aspect ratio, categories, purity, colours, tags.

Not affiliated with Wallhaven. It uses their public API.

**Download:** [latest release](https://github.com/wallraven-app/wallraven/releases/latest)
· **Site:** [wallraven.app](https://wallraven.app)

## What it does

- Rotates wallpapers from a Wallhaven search, one of your collections, a saved
  playlist, or folders on your PC. Dropbox, Google Drive and OneDrive folders
  work like any other folder.
- A timetable, if you want different sources at different times of day.
- Likes and dislikes: liked wallpapers are kept forever, disliked ones never
  come back.
- Multi-monitor, fit modes, lock screen mirroring, global keyboard shortcuts.
- Pauses while a fullscreen game is running.
- An optional account that syncs your settings, presets and playlists between
  machines, and a gallery of presets other people have shared.

Everything works without an account. The Wallhaven API key is optional too, and
only needed for your own collections and NSFW content.

## Installing

Download the installer from the
[releases page](https://github.com/wallraven-app/wallraven/releases/latest) and
run it. It installs per-user, so it needs no administrator rights.

It is not code-signed yet, so SmartScreen will warn you. Choose **More info**,
then **Run anyway**. Each release publishes a `SHA256SUMS.txt` beside the
installer if you want to check what you downloaded:

```
certutil -hashfile Wallraven-Setup-v1.2.1.exe SHA256
```

The app updates itself: it checks on launch, verifies the download against the
published checksum, and will not install anything that does not match.

## Repository layout

| Path                   | What it is                                                      |
| ---------------------- | --------------------------------------------------------------- |
| `electron/`            | the tray app, which is the product                              |
| `src/`                 | the website: sign-in, device pairing, the shared preset gallery |
| `supabase/migrations/` | the database schema and its row-level security                  |
| `scripts/`             | the build: packaging, the installer, the Store package          |
| `.github/workflows/`   | CI: tests, typecheck, installer build, release publishing       |

## Building it yourself

```
npm install
npm test                                       # 15 test files, a few seconds
node scripts/build-desktop.mjs --platform win32 --arch x64
```

The installer step needs [NSIS](https://nsis.sourceforge.io). Without it the
build still produces the unpacked app in `electron/app`.

To run the app straight from source while working on it, `npm run app`, or
double-click `Run WallRaven.bat`.

## Licence and credit

Copyright (c) 2026 Steve Shaw. All rights reserved. The source is public so you
can see what you are installing; it is not licensed for reuse, modification or
redistribution. Ask if you would like to do something with it.

Wallpapers belong to the people who made them. WallRaven displays them through
Wallhaven's public API and claims no ownership or endorsement. Please follow,
favourite and credit artists on Wallhaven.
