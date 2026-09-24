# Wallraven changelog

## v1.3.0 — 24 Sep 2026

### New

- **Browse your wallpapers.** Now playing is a carousel: the wallpaper on your desktop in the middle, your last 25 to the left and what comes next to the right. Drag it, use the slider or the arrow keys, or click a picture to bring it to the middle. Nothing on your desktop changes until you press Set as wallpaper. Double-click the middle one to see it full size, and move through them from there too.
- **Why this one.** Now playing says how the wallpaper was chosen: the timetable entry in charge, the preset it switched to, and the search, playlist, folder or collection it came from.
- **The thumbs show where you stand.** Like and dislike light up when the wallpaper on screen is already liked or disliked, in the tray too, and pressing a lit one undoes it.
- **Undo a dislike.** Dislike & skip leaves a notice with Undo, which brings the wallpaper back.
- **Clear likes**, next to Clear dislikes. It asks first, because a Liked collection is something you built on purpose.

### Changed

- **Save tells you when there is something to save.** It says Saved when there is nothing pending and Save changes when there is. Theme and colour still save the moment you pick them.
- **Pause says Pause.** The button names what it will do, and lights up while paused.
- **Less repetition.** Now playing no longer repeats the title bar's buttons, and Home no longer repeats the sidebar.
- **Easier to read** in the Nord, Glass and Raven themes.
- A lit dislike is a different colour from a lit like, and the window is called WallRaven.

### Fixed

- **A preset switched on by the timetable matches your screen.** "Match my screen" was ignored on that route, so it searched every resolution and aspect ratio.
- **A timetable switch starts with the new search.** The first wallpaper after a timetable entry took over could still come from the previous one.
- **The app only names a preset while it is really in use.** It used to go on naming the last preset you loaded after you had changed its settings.
- **Clearing likes or dislikes clears them properly.** The Library kept showing entries that nothing else remembered.
- **The next wallpaper is ready sooner** after starting up, saving a change or a timetable switch.

## v1.2.1 — 18 Sep 2026

### Fixed

- **One wallpaper per action.** Applying a preset changed the wallpaper two or three times in quick succession, because saving the settings and asking for a wallpaper each started one of their own.
- **The theme sticks.** Picking a theme only took effect properly when you pressed Save, so applying or saving a preset brought the old one back. Themes and the accent colour now save themselves as soon as you pick them.
- **Fade does nothing when clicked.** It used to pin the window invisible, which also hides the button, leaving no obvious way back. Hovering over it still works as before.
- **The thumbnail in the title bar** is the same height as the buttons next to it.

## v1.2.0 — 17 Sep 2026

### New

- **Browse has its own search.** Looking something up no longer overwrites the search your wallpapers rotate on. The box and the sort order in Browse apply to that search only, and opening the page shows the top wallpapers of the month without being asked.
- **Saving does something you can see.** Change what you are searching for, press Save, and a matching wallpaper arrives straight away instead of at some point in the next half hour.
- **The wallpaper on screen is in the title bar**, next to the like and dislike buttons that act on it.
- **The timetable explains itself.** Every entry says in plain words when it starts, when it stops, on which days and how often the wallpaper changes. The entry in charge is marked, entries are listed in the order they take effect, days are buttons with weekday and weekend shortcuts, and two entries set to the same time on the same day say so instead of one silently never happening.
- **WallRaven introduces itself.** A first run explains what the app does and where the controls are; an update shows what was added.
- **Your cloud folders are offered.** Dropbox, Google Drive and OneDrive all sync into ordinary folders, so "Pictures on this PC" offers whichever of them exist on this machine, and their Pictures subfolders, as one-click buttons.
- **Settings are grouped.** General is now Appearance, Startup, Gaming, Network and Portable mode, and each setting's explanation sits with the setting.
- **Sizes read as sizes.** 20480 MB is 20 GB.

### Fixed

- **Back and Forward work.** They did nothing at all once the cache had deleted the picture, which it does constantly. A wallpaper from Wallhaven is now downloaded again, pictures from your own folders that have been deleted are skipped, and the arrows grey out when there is nothing left to go back to.
- **The app can no longer claim a wallpaper it never set.** Windows accepts a picture that is not there, paints the desktop black and reports success, so the history, the statistics and the notification all recorded a wallpaper nobody could see.
- **A hung change can no longer overwrite a newer one.** If a change took more than 30 seconds the app started again without it, and the original would eventually finish and put its own wallpaper on top of the one you had asked for.
- **Keyboard shortcuts say when they are refused.** Another program owning the combination made the shortcut do nothing, with nothing anywhere to explain it.
- **Fade is back.** It was being deleted the first time you clicked anything in the sidebar.
- **Your timetable survives a sync.** A settings sync from your account could replace a timetable that had entries in it with an empty one.
- **AI art stays excluded.** The control only offered a way to put it back, which is not what its label said.

## v1.1.0 — 17 Sep 2026

- **Signing in works again.** It had stopped working entirely: the website moved and the app did not follow the redirect, so it gave up and blamed your internet connection. It now follows the site wherever it lives.
- **Linking the app to your account is safe.** Previously, anyone who could get you to open a link could have signed their own copy of WallRaven into your account with one button press, and nothing on the page would have looked wrong. Now the app shows you a code and the website asks you to type it, so linking only works if you are sat at the machine doing the asking.
- **Your saved wallpapers stop disappearing.** Syncing stripped the file locations off your playlists, which left the cache cleaner free to delete the pictures in them. Liked wallpapers could vanish from disk with nothing to explain it.
- **Wallpapers no longer stop changing until you restart.** Opening the presets gallery when a change was due could jam the queue permanently. The app sat on "Fetching…" forever and said nothing.
- **Disliking hits the right wallpaper.** After pressing Back, Like and Dislike acted on a different picture from the one on screen, so Dislike could blacklist a wallpaper you had never seen and then rotate away from the one you were looking at.
- **Opening Settings no longer resets your rotation timer.** WallRaven remembers which page you were on, and saving that was restarting the countdown. Glancing at Settings 25 minutes into a 30-minute cycle cost you another 30 minutes.
- **"Different wallpaper per monitor" shows the wallpaper it just fetched.** With a playlist selected it was quietly ignoring every new wallpaper and showing the same fixed pair forever, while still announcing the change.
- **Choosing a wallpaper by hand respects your settings.** Picking one from Browse skipped lock screen mirroring and the per-monitor mode, which only worked on automatic changes.
- **Pausing from the tray updates the window.** It kept saying "Playing", and pressing it then started cycling again.
- **WallRaven tells you when it breaks.** Crashes are now recorded and shown in Settings, with your username, folders and Wallhaven key stripped out. Nothing is sent anywhere unless you read it and choose to send it.
- **Cloud sync is more careful with your settings.** It no longer overwrites the cloud when it cannot read it first, no longer signs you out because a network device returned the wrong error, and tells you when a download fails instead of continuing to report everything as fine.
- **Sign-in with Google has been removed** for now. It only ever worked through the service that used to host the website, so it could not come with us. Email and password are unaffected.

## v1.0.2 — 16 Sep 2026

- **Updates are checked before they are installed**: WallRaven now only accepts an update from its own release sites, over a secure connection, and checks the downloaded installer against a published fingerprint before running it. If anything does not match, the update is discarded rather than installed. A silent background update will not run at all unless that check passed.

## v1.0.1 — 16 Sep 2026

- **Choose which apps pause your wallpaper from a list**: the old button tried to detect whatever was in front of you, which could only ever be WallRaven itself, because pressing a button in WallRaven brings WallRaven to the front. It now shows what you have open and you pick.

## v1.0.0 — 16 Sep 2026

- **WallRaven is 1.0.** It now builds, tests and releases itself, instead of depending on the tool it was first written in.
- **Pausing for your games actually works**: naming specific apps to pause for never matched anything, because the app was reading its own helper process instead of the game in front of you.
- **Timetable rules no longer stop at midnight**: an evening rule used to lapse at 00:00 and leave you on your ordinary settings until the morning. A rule now stays in force until the next one starts.
- **Your settings survive a crash**: likes, playlists, presets, hotkeys and the timetable are saved so that losing power mid-write can no longer wipe them back to defaults.
- **Fewer surprise sign-outs**: two background jobs refreshing your login at the same moment could cancel each other out and unlink the device.
- **No more wallpapers stuck forever**: a request that connected and then went quiet could block every wallpaper change until you restarted. Requests now give up instead of hanging.
- **Broken downloads are thrown away**: a picture that arrived incomplete used to be set as your wallpaper and then kept in the cache as though it were fine.
- **Searching presets with a comma works**: it used to return nothing at all.
- **Upgrades keep their settings**: options added in an update no longer arrive empty for anyone coming from an older version.

## v0.8.13 — 15 Sep 2026

- **New Raven Fyra 🔥 theme**: a warm red, orange and yellow pastel theme with Raven as a red-haired fire mage beside a fire-clad raven, backed by new 4K artwork.

## v0.8.12 — 14 Sep 2026

- **Liked and disliked pictures are obvious**: each one now carries a permanent thumbs badge and coloured frame, so you can see and clear its status at a glance.
- **Presets are just presets again**: the desktop list sorts by most popular or newest, with no liking.
- **Cereal game is a 30-second score attack**: faster pieces, more bombs, and bombs set off other bombs for chain reactions.
- **Hidden game statistics**: once you have played a round, games played and your top score appear on the Statistics page.

## v0.8.11 — 13 Sep 2026

- **Clear a like or dislike**: pressing the lit thumb now returns the wallpaper to neutral, in every list, instead of quietly re-applying the same reaction.
- **Hover shows what will happen**: the thumbs light up in your theme colour, and a lit thumb dims to show the click will clear it.
- **Presets work properly again**: applying a preset switches back to searching and fetches the next wallpaper straight away, and tells you if nothing matched.
- **No more stuck wallpapers**: a download that stalls now times out instead of leaving the app unable to change picture until a restart.
- **Cereal game pace**: the game now builds speed at a sensible rate, so a round lasts a couple of minutes.

## v0.8.10 — 13 Sep 2026

- **Cereal game rebalanced**: the pace now builds more gradually, every mouse press registers immediately, and game over shows your final score before you choose to play again.
- **Sharper Raven theme**: the original Raven background is now restored at 4K resolution, and its theme name is simply Raven.

## v0.8.9 — 13 Sep 2026

- **Browse results stay put**: your search results no longer vanish when you visit Library or minimise the window.
- **Raven theme refreshed**: a large panoramic Raven scene now sits behind the panels instead of a small centred picture.
- **New Raven Summer theme**: a sunny summer look you can pick in Settings.
- **Smooth resizing**: dragging the window edge no longer makes the mouse lag while the layout catches up.

## v0.8.8 — 11 Sep 2026

- **Lighter on your PC**: picture lists only load while you're looking at them and use small previews, so the app uses far less memory.
- **Recently shown loads faster**: it starts with the latest 24 pictures and you can show more.
- **Liked, Disliked and Recently shown all match**: same size thumbnails and same buttons at every window size.

## v0.8.7 — 11 Sep 2026

- **You see the change straight away**: applying a preset, a playlist or your liked pictures now fetches a new wallpaper immediately.
- **Disliked pictures show their thumbnails again**: older entries get their preview picture back.
- **Consistent buttons everywhere**: every picture in Recently shown, Liked and Disliked has the same thumbs up, thumbs down and open-on-Wallhaven buttons, with matching labels and matching up/down arrows across lists.

## v0.8.6 — 11 Sep 2026

- **Thumbs up button is back where it belongs**: all the buttons on a Recently shown thumbnail now fit inside the picture, so the thumbs up no longer slides out of view.
- **Raven on the installer**: the setup screens now show her larger and centred.

## v0.8.5 — 11 Sep 2026

- **Liked and Disliked are now two clear lists**: each shows thumbnails with a thumbs up or thumbs down, and every picture in Recently shown, Liked and Disliked has both buttons. Liked pictures are kept in the cache forever, disliked ones are never shown again, and pressing the highlighted button again puts a picture back to neutral.
- **Support WallRaven**: a Ko-fi link now sits under Settings > Help.
- **Peek button never moves**: it stays in the bottom-left corner at every window size, and now waits a second while it lights up so you can't set it off by accident.
- **Tidier controls**: only one forward button in the tray menu, and the app is called WallRaven everywhere, without the version number in the window title.
- **Pinned and taskbar icon fixed**: the shortcut now points at a stable icon file so it stops going blank.
- The little something in Settings > Help plays on a plain floor now.

## v0.8.4 — 10 Sep 2026

- **Peek button always reachable**: it stays in the bottom-left corner even when the window is narrow.
- The little something in Settings > Help now plays in a proper fixed-size bowl, so it's the same challenge whatever size the window is, roughly 3% of pieces are bombs that clearly blow up their neighbours, and the eating sounds are gone.

## v0.8.3 — 10 Sep 2026

- **Like and dislike now match**: thumbs up and thumbs down everywhere — top bar, Now playing and Recently shown.
- The little something in Settings > Help keeps speeding up so a round lasts a minute or two, hides behind a bowl instead of a label, sits below Feedback, adds occasional rainbow pieces that pop everything next to them, and has five proper munching sounds.

## v0.8.2 — 10 Sep 2026

- The little something in Settings > Help now tumbles properly: pieces fall gently, bounce off each other and pile up naturally instead of stacking in neat columns, they actually look like cereal (stars, hearts, moons, clovers, diamonds, pillows and oat rings), and the end-of-game message sits in front of the pile. No instructions — just a bowl.

## v0.8.1 — 10 Sep 2026

- **Playback controls along the top**: like, dislike and skip, back and forward arrows, and a play/pause button that shows whether cycling is running or paused.
- **Peek/fade button moved** down to the bottom left next to the version, out of the way of the next-wallpaper button.
- **Tidier update options**: both automatic-update tick boxes now line up in one neat column.
- **Changelog always shows**: if a build didn't bundle it, Wallraven fetches the published one.
- **Something silly** hiding in Settings > Help. Ask for cereal.

## v0.8.0 — 10 Sep 2026

The new Wallraven: six places down the left (Home, Browse, Library, Presets, Schedule, Settings) instead of one endless settings page, plus everything from the test builds.

- **Home** shows the wallpaper you're on now, big and whole, with one-tap buttons to browse, pick a preset, change the schedule or open your library.
- **Library** gathers recently shown, favourites and blocked, playlists and your own pictures under tabs; **Settings** is tabbed too.
- **Like straight from Recently shown** with a heart on every thumbnail.
- **New Raven theme** built around the mascot, with a matching pearlescent pink-violet accent. Settings > General > Theme.
- **Uses the width of your window**: panels sit side by side and split into columns on a wide window, so there's much less scrolling.
- **Open on Wallhaven works again**, and says plainly when a picture came from your own folders.
- **Tidier scrolling**: slim themed scrollbars that no longer sit on top of your thumbnails.
- Copying a shared preset brings its searches, filters and colours — your own timetable is left alone, and the wording now says so.

## v0.8.0-beta.3 — test build

- **Open on Wallhaven works again**: the button now rebuilds the picture's Wallhaven page from its ID when no link was saved, and says plainly when a picture came from your own folders so it has no page to open.
- **Uses the width of your window**: panels sit side by side and lay their sections out in two or three columns on a wide window, so there's far less scrolling.

## v0.8.0-beta.2 — test build

- **Home preview stays inside its panel** when the window is maximised, instead of the picture spilling over the edge.
- **Like straight from Recently shown**: every thumbnail now has a heart, so you can add or remove a wallpaper from Liked without waiting for it to come back around.
- **New Raven theme** built around the Wallraven mascot, with her watching over the app and a matching pearlescent pink-violet accent. Pick it under Settings > General > Theme.

## v0.8.0-beta.1 — test build

- **A proper app, not one long settings page.** Wallraven now has six places down the left: **Home**, **Browse**, **Library**, **Presets**, **Schedule** and **Settings**. You only see what belongs to where you are.
- **Home** shows the wallpaper you're looking at right now, big, with one-tap buttons to browse, pick a preset, change the schedule or open your library.
- **Library** gathers everything you already have — recently shown, favourites and blocked, playlists, your own pictures — with tabs to jump between them.
- **Settings** is now tabbed (General, Storage, Keyboard, Account & sync, Wallhaven, Updates, Help) instead of a wall of cards.
- **Presets** puts your own presets and the shared ones side by side.
- Nothing was removed: every control still does exactly what it did, it just lives somewhere sensible. Wallraven remembers the page and tab you left open.

## v0.7.8 — 10 Sep 2026

- **Wallpaper fade removed for good**: it kept pulling focus away from whatever you were doing, and it didn't fade properly. Wallpapers now change instantly with no overlay and no interruption. The setting is gone.

## v0.7.7 — 10 Sep 2026

- **Shorter cards**: every section inside a card (History, Colours, Playlists, Hotkeys, Cache, and the rest) now opens and closes on its own, so a card is a short list of headings instead of one endless column. Only the first section is open to start with, and Wallraven remembers what you left open.
- **Wider cards**: settings now fill the window in up to three roomy columns instead of one thin strip, and oversized cards were split into focused ones (My presets, Browse presets, Playlists, Storage, Keyboard shortcuts and more each stand alone).
- **How it's shown** now lives under _Search & filters_ where you'd expect it, not under _Cycle_.
- **Fade fixed**: the fade between wallpapers showed a black screen for a few seconds instead of your old picture. It now paints the outgoing wallpaper properly, and if the picture can't be drawn in time it simply skips the fade rather than blacking out your desktop.
- **Grouping simplified**: the confusing "Complexity" grouping (with its empty Intermediate and Advanced buckets) is gone. Group by Category, or leave everything in one list.

## v0.7.6 — 9 Sep 2026

- **One preset list**: the presets that come with Wallraven and the ones people share now sit in the same list under _Browse presets_, instead of two separate tabs with an empty community side.
- **The website Presets page shows them too**, so there's always something to browse and try.
- **Called presets everywhere**: no more "gallery", "looks" or "ready-made setups" for the same thing.

## v0.7.5 — 9 Sep 2026

- **Settings tidied into six sections**: instead of sixteen cards with overlapping jobs, Settings now reads as _Now playing_ (current wallpaper, history, statistics), _Search & filters_ (search, resolution & aspect, colours, browse and pick one yourself), _Favourites & blocked_, _Collections_, _Cycle & timetable_ (how often, timetable, and how the picture is fitted across your monitors) and _App_ (general, Wallhaven API key, cache & storage, hotkeys, account & cloud sync, updates & changelog, feedback).
- **Things live where you'd look for them**: colours and resolution sit with the rest of the search filters, the timetable sits with the cycle interval, and the cache moved out of the cycle settings into App next to the other program options.
- Nothing was removed and every control behaves the same; your existing order and collapsed sections are carried across on first launch.

## v0.7.4 — 9 Sep 2026

- **Fixed: wallpaper stopped changing after applying a preset**: shared and built-in presets used to bring the author's timetable with them, pointing your schedule at playlists and Wallhaven collections that only existed on their PC. Presets now carry search settings only, and timetable rules that reference something missing quietly fall back to your search.
- **Never silently stuck again**: if the chosen source has nothing to serve (a playlist whose files were deleted, a folder on an unplugged drive, an empty collection) Wallraven uses your search instead and tells you why, and automatic rotation errors now show up in Settings rather than only in the log.
- **A preset needing adult results without your own Wallhaven API key** now applies as safe results with a clear message, instead of returning nothing.
- **One name for one thing**: locally hearted wallpapers are now simply **Favourites**, with their own section listing them, a "only shuffle my favourites" button and your blocked list; "pinned" is gone from the interface — those files are described as _kept_ in the cache. Your Wallhaven account favourites are now a source inside Favourites.
- **Collections**: saved setups, the built-in and community library, playlists and local folders are now sections of a single **Collections** card instead of four separate ones. Your card order and collapsed sections carry over automatically.

## v0.7.3 — 8 Sep 2026

- **Wallpaper fade is back, safely**: an optional crossfade between wallpapers, off by default under Appearance → Fade. The old version could steal keyboard focus; the new overlay can't be focused or clicked at all, and if it ever does grab focus Wallraven switches the fade off for the rest of the session and tells you. It's also skipped while a fullscreen app or game is running.

## v0.7.2 — 5 Sep 2026

- **Sign-in kept encrypted**: your saved Wallraven sign-in is now encrypted with Windows' own protection instead of sitting on disk as plain text (existing files are upgraded automatically on next launch).
- **Safer links**: Wallraven only ever hands normal web links to your browser now, and revealing a file in Explorer can no longer be tripped up by an odd file name.
- **Lighter on your disk and memory**: settings are saved once after a burst of changes instead of on every single change, and the popular-tags list no longer grows without limit while you browse.

## v0.7.1 — 3 Sep 2026

- **Memory leak fixed**: every wallpaper change, lock-screen update and game-detection check ran a PowerShell helper whose output pipe was never drained and which had no timeout — a single stuck helper (the lock-screen call being the worst offender) became a permanent ~60 MB process, and they stacked up until the machine ran out of RAM. All PowerShell calls now stream their output, are size-capped, time out and have their whole process tree killed, plus any straggler is cleaned up when Wallraven quits.
- **Bounded caches**: prefetched wallpaper candidates and gallery thumbnail entries are now capped instead of growing for the life of the session.

## v0.7.0 — 2 Sep 2026

- **Change animations removed**: the wallpaper transition overlay could steal keyboard focus from whatever you were working in, so it's gone entirely. Wallpapers now swap instantly and the setting no longer appears.

## v0.6.9 — 1 Sep 2026

- **Updates itself on launch**: Wallraven now checks for a new version every time it starts and, if one exists, downloads and installs it silently in the background then restarts — no installer prompts, no download hunting. Turn it off with "Update automatically on launch" in the Updates card.

## v0.6.8 — 1 Sep 2026

- **Module view bar**: group cards by complexity (Essentials / Simple / Intermediate / Advanced) or category, and hide whole groups — remembered between launches.
- **Text wrapping fixed**: narrow cards now stack labels above their controls instead of squeezing hint text into a sliver, and long file paths wrap properly.

## v0.6.7 — 1 Sep 2026

- **API key clarity**: separate "Enter API key" field and a "Key status" line (Missing / Not validated / Validated / Invalid).
- **API key validation fixed**: it now checks the key you just typed against Wallhaven's authenticated endpoint, so a correct key validates without saving first and nonsense is rejected instantly.
- **Smart prefetch** moved next to Offline mode instead of sitting in the wrong column.
- **Preset library**: a clear "Share a preset" heading and explainer above the sharing controls.
- **Changelog is collapsible**, so the Updates card stays compact.
- **New Feedback card**: send bug reports, feature requests or general feedback (with an optional email) straight from the app.

## v0.6.6 — 1 Sep 2026

- **No more "Too Many Attempts"**: every Wallhaven call (wallpaper fetches, fallback chain, collections, preset thumbnails) now shares one rate-limit-aware queue. Wallpaper changes always get priority; preset thumbnails yield to them and pause completely while Wallhaven is rate-limiting.
- **Thumbnails cost API calls once**: preview lookups are cached on disk between sessions and only load when a preset scrolls into view.
- **Cleaner errors**: a rate limit now shows one short message instead of a wall of repeated HTTP 429 text, and suggests adding your API key.

## v0.6.5 — 1 Sep 2026

- **Glass is now the default theme**, repainted to match the website: deep ink surfaces, a pastel-prismatic aurora (sky, periwinkle, rose, mint) and prismatic gradient buttons.
- **Midnight** remains available in the theme picker.

## v0.6.4 — 1 Sep 2026

- **Preset cards fixed**: thumbnail, title and metadata now stack above a wrapping button row, so Apply/Save/Like no longer overlap the text.
- **Thumbnails actually load**: preview lookups are queued and spaced instead of firing ~30 at once (which tripped Wallhaven's rate limit), with retries and caching of successful results only.
- **Account tidy-up**: your username field, availability hint and Manage account link all live in the _Account & cloud sync_ card now; the share block just points there.

## v0.6.3 — 1 Sep 2026

- **Preset thumbnails**: every built-in and community preset now shows a live Wallhaven preview of what it pulls, in the app gallery and on the website.
- **Consistent icon everywhere**: tray, taskbar, installer, window and website favicon all use the same rounded prismatic mark.
- **Wider layouts**: the settings window no longer caps at three columns — cards now fill the full window width (5 columns at 1920px).
- **Fade fixed**: hovering Fade drops the whole window again — near-zero opacity made Windows treat the window as click-through, which instantly snapped it back.
- **Website refresh**: single clear feature list, plus a new /changelog page linked in the nav.

## v0.6.2 — 31 Aug 2026

- **Update checker fixed**: manifest and installer downloads now follow HTTP redirects (the custom domain redirect was breaking checks) and the check tries wallraven.app first, falling back to the Lovable URL. No more "Could not reach the update server".

## v0.6.1 — 31 Aug 2026

- **New icon**: fresh Wallraven mark designed to stay legible as a tiny square — used for the system tray (crisp 16px variant), window/taskbar icon, installer and website favicon.

## v0.6.0 — 6 Sep 2026

- **Built-in preset library**: a new _Preset library & community_ card ships ~65 curated presets across Videogames, Anime, Nature, Cars, Abstract, Space, Minimal, Cityscape, Fantasy & Sci-Fi, Animals, Seasonal and Moods — including day/night and workday schedule presets. Filter by category, search, apply instantly or save a copy as your own preset.
- **Community presets**: publish your own presets for other users, browse by most liked / newest / most copied, and like the ones you keep. Also browsable on the web at wallraven.lovable.app/presets.
- **Safe imports**: shared presets only carry search, tags, categories, purity, sort, colours, AI filter, cycle interval and schedule. Your resolution, aspect ratio, monitor setup, API key, theme and layout are never overwritten or uploaded.
- **Stays linked across updates**: a temporary network or server hiccup while refreshing your session no longer signs the device out — only an explicitly rejected session unlinks it, so you shouldn't have to re-pair after an update.
- **Fade improved**: hovering Fade now takes the entire window (header, toasts and all) to near-invisible, and clicking pins it faded until you click again, press Esc or the window loses focus.

## v0.5.0 — 31 Aug 2026

- **Offline / cached-only mode**: Wallraven detects when the network drops (or you force it for metered connections) and cycles only through cached wallpapers — no failed requests or stutter. Toasts on online/offline transitions.
- **Smart prefetch**: the next candidate is downloaded in the background a few seconds after each rotation, so your next wallpaper swaps in instantly with no waiting on the network.
- **Back / forward history navigation**: browser-style ◀ / ▶ buttons (and Ctrl+Alt+←/→ hotkeys) step through your wallpaper history without re-fetching. The forward stack clears on any new rotation, just like a browser.
- **Crossfade preview**: the Current-card thumbnail fades between wallpapers instead of snapping.
- **API key validation**: a "Validate" button on the API key row confirms your Wallhaven key works (and shows your username) before you rely on it for NSFW/collections.
- **Statistics card**: new card showing wallpapers shown (all-time + this month), cache hit rate, offline fallback rate, likes/dislikes counts, cached file count and size, and your top sources.
- Wallpaper-change notifications now note when a fallback resolution was used.
- **Cache survives updates**: app data now lives in a fixed `Wallraven` folder instead of the old package-derived `wallhaven-tray` path, and any legacy folder is migrated across automatically on first launch.
- **Choose where the cache lives**: new _Cache location_ row in Cycle & cache — pick any folder, jump back to the default, and open the folder in Explorer (fixed the old button that bounced Explorer to your desktop).
- **Move on relocate**: when you change the cache folder Wallraven asks whether to move existing files, and rewrites history/playlist paths so nothing is orphaned.
- **Rotate a plain folder**: point Wallraven at one or more local folders and it cycles them like Windows does — no playlist needed — with shuffle or in-order playback, optional sub-folders, and all the usual interval/fit/schedule/hotkey/multi-monitor behaviour.

## v0.4.2 — 23 Aug 2026

- **Auto-update**: Wallraven now checks a published update manifest, downloads the new installer itself (with progress), and can launch it for you — no more hunting for download links. Optional "download automatically in the background".
- **Per-app gaming pause**: choose between pausing rotations for _any_ fullscreen window or only for specific apps you list. "Detect app I'm running now" fills the list for you.
- **Changelog in the app**: this page, bundled with every build, so you can see what changed.
- **Test cache cleanup**: dry-run the storage slider to see exactly which oldest wallpapers would be deleted (and which are protected), then apply it for real.

## v0.4.1

- Gaming toggle: skip automatic wallpaper changes while a fullscreen app/game is in the foreground.
- Security: pinned the `seroval` serialization dependency to a patched release.

## v0.4.0

- Account and cloud sync via browser-based device pairing (settings, presets, playlists, likes).
- Manage-account and password-reset flows on the web app.

## v0.3.8

- Visual query builder with AND/OR chips.
- Optional "match Windows lock screen to current wallpaper".

## v0.3.7

- Search syntax: commas are separate searches (OR), `+`/spaces combine tags (AND).
- Presets: overwrite the current preset without retyping its name.
- Removed duplicate inline status messages that made cards jump.

## v0.3.6

- Toasts replace each other instead of stacking.
- Fixed hard-to-read dropdowns in the Glass theme.

## v0.3.5

- Sticky header with right-aligned messages that no longer cover the Next/Save buttons.
- Hover "Fade" button drops the window to 2% opacity to peek at the wallpaper.

## v0.3.3–v0.3.4

- New **Glass** theme with backdrop blur and accent glow.
- Simpler, larger high-contrast "WR" tray/app icon.
- Installer force-cleans the install directory so versions no longer stick.

## v0.3.2

- Rolled back the unfinished cloud account features; plain "WR" branding.

## v0.2.0

- Scheduler engine, likes/dislikes, tag blacklist, fit modes.
- Portable mode, global hotkeys, local library import/export, multi-monitor support.
