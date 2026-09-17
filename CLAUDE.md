# WallRaven

A Wallhaven-backed wallpaper manager. Two halves in one repo:

- **`electron/`** — the Windows tray app. This is the product. `main.cjs` is the
  main process, `settings.html` is the entire UI, `cloud.cjs` is account and sync.
- **`src/`** — the website (TanStack Start, builds to Cloudflare Workers via nitro).
  Sign-in, device pairing, the community preset gallery.
- **`supabase/migrations/`** — the database schema and its row-level security.

## Who this is for

Steve owns this. He is an IT infrastructure manager, not a programmer: he reads
and reasons about infrastructure, security, identity and networking fluently, and
does not write code. So:

- Explain infrastructure decisions normally. Do not simplify RLS, token refresh,
  code signing, DNS or deployment concepts for him.
- Do not hand him shell commands, type errors or lint output to action. Do those
  yourself.
- When something can't be verified from here, say so and say what would verify it,
  rather than asserting it works.

Steve is currently the only user. A friend helped with UAT early on and has since
uninstalled it. A public release is the goal, possibly with donations. That
distinction matters: several problems in this codebase are tolerable today and
unacceptable the day strangers install it. It also means there is no second pair
of eyes, so anything that only shows up on someone else's machine will not be
caught before release.

## Ground rules

- **Never commit `.env`.** Publishable Supabase keys only; anything secret goes in
  the hosting platform's environment. Anything prefixed `VITE_` is inlined into the
  browser bundle.
- **Never commit binaries.** A packaged build drops ~111 MB installers into
  `electron/`. GitHub rejects anything over 100 MB per file, and that is exactly
  what broke Lovable's GitHub connect. Installers ship as release assets.
- **Run `npx tsc --noEmit` before saying a change works.** `npm run build` does not
  typecheck, so a type error will build cleanly and fail at runtime.
- **`npm run lint` is noise.** ~1,638 errors, all Prettier formatting, none of them
  real. Ignore it until someone runs `npm run format` once as a standalone commit.
- Commit in small, self-contained steps with a message saying *why*. The history is
  Steve's undo button and he cannot debug his way out of a bad state.

## Running it locally

Steve does not use a terminal. `Run WallRaven.bat` at the repo root is his way
in: double-click, it installs dependencies on first run and offers the two
profiles below. Keep it working -- a test checks it still calls scripts that
exist. Electron is a devDependency, so the app runs straight from the repo with
no packaging step:

- `npm run app` uses the real profile, so it sees the settings, cache, history
  and playlists of the installed copy. **Quit the installed WallRaven from the
  tray first**: the single-instance lock is keyed on the profile, so otherwise
  the dev run just focuses the running one and exits.
- `npm run app:clean` uses `.devprofile/` instead and can run alongside the
  installed copy. A fresh profile, so it starts signed out with no cache.

Two things a dev run deliberately does not do, both in `applyAutoStart`:

- It never registers start-up. `process.execPath` is `electron.exe` inside
  `node_modules`, and writing that to the Run key would overwrite the installed
  copy's entry with a path that disappears on the next `npm install`.
- The tray tooltip says `WallRaven (dev)` so two running copies can be told
  apart.

Edits to `electron/` take effect on restart; there is no build step for the app
itself. `npm test` after every change -- it is a few seconds and covers the
logic that is awkward to reach by hand.

## Building without a Windows machine

The installer can be built from Linux: NSIS cross-compiles, and
`scripts/build-desktop.mjs` now uses `-D` off Windows and `/D` on it. That is
how 1.2.0-beta.1 was produced from the desktop Linux VM, which is the only
shell this session can actually run a build in.

Two things that matter if it is done again:

- Build on local disk, not in the mounted folder. The packaged app is ~360 MB
  and writing that through the mount is slow enough to look hung. Copy the
  repo out (no `node_modules`, symlink it instead), build there, copy back only
  the installer.
- NSIS is not installed in that VM and there is no root. `apt-get download nsis
  nsis-common`, `dpkg-deb -x` each into a prefix, then run it with `NSISDIR`
  pointing at `usr/share/nsis` and that `usr/bin` on PATH.

A build made this way is unsigned, exactly like the CI one, and is not
published anywhere: the update manifest still points at the last real release.

## Release gates

All four are closed. What is verified and what is merely written differs from
gate to gate, and the distinction matters:

1. ~~**The auto-updater runs unverified executables.**~~ Closed. Pinned host
   allowlist, published SHA-256 checked before the installer is run, redirects
   re-checked at every hop. The remaining gap is real: the checksum arrives in
   the same manifest as the download URL, so this protects against a swapped
   file on a trusted server, not against that server being taken over. Only a
   signed installer fixes that, and signing also stops SmartScreen frightening
   people. Signing is being solved through the Microsoft Store, which is free
   and signs the package itself -- see below.
2. ~~**Device pairing is a one-click account takeover.**~~ Closed. Server
   generates both codes, the user types the short one off the screen of the
   machine being paired, no CORS. `/api/public/pair/start` was checked live on
   17 Sep and returns a server-generated pair: the service role key is set on
   the Worker and the endpoint works. A pairing has still not been carried
   through to a signed-in app end to end.
3. ~~**No crash reporting.**~~ Closed. Crashes are recorded locally, redacted
   (home directory, username, Wallhaven key), shown in Settings, and sent only
   when the person chooses to, through the feedback endpoint into Steve's own
   database. No third party. Still no beta channel, and still one tester.

4. ~~**Nobody except Steve can sign up.**~~ Closed, and confirmed by signing up
   with an address outside the Supabase organisation: the mail arrived. The
   templates are still Supabase's generic ones and say so; branding them is
   cosmetic and outstanding. Original note kept because the failure mode is
   worth remembering:

   **Nobody except Steve can sign up.** Supabase's built-in email service only
   delivers to members of the project's team and sends two messages an hour,
   and the project requires email confirmation. So a stranger signing up waits
   forever for a mail that was never sent. Invisible during development because
   the only tester is the team owner. Fix is a real SMTP provider: Resend is
   set up against `wallraven.app` with DKIM, SPF on the `send.` return path and
   a monitor-only DMARC record. Verify by signing up with an address that is
   **not** in the Supabase organisation; testing with Steve's own proves
   nothing.

## Releasing the pairing change

The desktop half of the pairing rewrite is committed but **must not ship before
the site does**, and this is easy to get wrong in either direction:

- A new app against the old server fails. `wallraven.app` is still Lovable's
  build, which expects the app to supply a code. The new app does not send one,
  so pairing would break for anyone who updates before the cutover.
- An old app against the new server also fails, by design: the old flow is the
  vulnerability. `/link` detects the old `?pair=` style and tells the person to
  update rather than failing silently.

So the order is: move DNS, confirm the site serves from Cloudflare, then release
the app. At that point update every installed copy, including Steve's own, or it
cannot pair.

## Microsoft Store

The route to a signed build without paying for a certificate every year:
Microsoft signs Store submissions itself, and a Store-installed app gets no
SmartScreen warning at all. Registration is free for individuals.

The build produces the package already. `node scripts/build-desktop.mjs
--platform win32 --arch x64 --msix` packs `electron/app` with
`electron/msix/AppxManifest.template.xml` and the logos in
`electron/msix/assets/`, and CI builds it in the same job as the installer and
fails if `makeappx` produced nothing. It is **not verified**: nothing here has
run on Windows yet, and the first CI run on a Windows runner is what will say
whether `makeappx` is found and the manifest is accepted.

What only Steve can do is reserve the app name in Partner Center. That produces
three values -- Package Identity Name, Publisher (an X.500 name, `CN=...`) and
Publisher Display Name -- which must match the reservation exactly. They go in
as repository **variables** (not secrets; they are public in every package):
`MSIX_IDENTITY_NAME`, `MSIX_PUBLISHER`, `MSIX_PUBLISHER_DISPLAY_NAME`. Until
they exist the build falls back to obvious placeholders, which install locally
and can never be submitted.

Two consequences inside the app, both already handled:

- **The updater must not run.** A packaged app cannot replace itself and the
  Store services it. `electron/packaging.cjs` answers "is this a Store build"
  from `process.windowsStore`, and check, download, install, the scheduled
  checks, the tray item and the Updates card all defer to it.
- **Start-up is Windows's to control.** A packaged app cannot write its own Run
  key; the manifest declares a startup task, disabled, which the user turns on
  under Settings > Apps > Startup. A startup task cannot pass arguments, so a
  Store build reads "start minimized" instead of `--hidden`.

Keep the NSIS installer either way: it is the only route for anyone not using
the Store, and the updater is what serves them.

## Known traps

- ~~`package-lock.json` resolves to Lovable's private npm mirror.~~ Regenerated
  against `registry.npmjs.org`; all 588 entries are public and `npm ci` works.
- `settings.html` is ~210 KB and drifts easily. It has been edited on Steve's PC
  in ways a container copy will not have. Hash-check before overwriting it, or
  patch it in place.
- `src/routes/__root.tsx:108` fails `tsc` on a fresh install: a newer
  `@tanstack/react-router` tightened `ErrorComponentProps.error` to `unknown`.
- There is no scratch checkout in the cloud container, deliberately. One existed,
  could not reach GitHub, silently fell behind and nearly had old code copied out
  of it over new. Work on the copy on Steve's PC via the device shell; it is the
  only one that can push.
- The site URL is hardcoded in five places across `cloud.cjs` and `main.cjs`, split
  between `wallraven.lovable.app` and `wallraven.app`.
- ~~The JSON helpers have no timeouts, so one stalled request wedges every
  wallpaper change.~~ Fixed: connect, stall and overall deadlines plus a body
  size cap on every JSON request, and the gate no longer lets a low-priority
  call wait behind a high-priority one that is queued behind it. Wallhaven calls
  are still serialised through one chain (`WH_CHAIN`), which is deliberate --
  Wallhaven rate-limits per key -- and the 30-second fetch-lock takeover is
  still there as a last resort.
- Windows accepts a wallpaper path that does not exist, paints the desktop black
  and reports success. `assertImageReadable` is the guard; do not call
  `setWindowsWallpaper` or the per-monitor variant around it.
- The cache prunes oldest-first, so most history entries older than a few hours
  have no file behind them. Anything that shows or sets a history entry has to
  cope: Wallhaven ones are re-downloaded from the id, local ones are gone.

## Hosting and the database

Both moved, or are ready to. Neither is live.

The **database** is done and is the one thing fully migrated. It used to be a
Supabase project owned by Lovable ("Lovable Cloud"), invisible from Steve's own
dashboard, with no service role key and no automated transfer. Lovable exported
it; the schema and its one account's worth of data are restored into a project
Steve owns (`bwvbilkfcmjnvopjpaer`, organisation NecroMoz, London, free tier).
Accounts could not be copied, so the single account was re-registered against
the same address.

The **site** builds and deploys to Steve's Cloudflare account on the Workers
free plan, at `necromoz-wallraven.necromoz.workers.dev`. Deploy by hand:
`npm run build` then `npx wrangler deploy` from a checkout. Three secrets belong
on the Worker; two are set (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`) and
`SUPABASE_SERVICE_ROLE_KEY` is not, which is why pairing 500s there.

**DNS moved on 17 Sep and the cutover is done.** `wallraven.app` runs on
Cloudflare's nameservers and is attached to the Worker as a custom domain, so
the apex and `www` are `AAAA 100::` (the IPv6 discard address Cloudflare parks
Worker-served hostnames on). Lovable is no longer in the path for anything.
Rolling back means recreating two A records pointing at 185.158.133.1.

The old note, kept because the reasoning still applies to any future move:

**DNS has not moved.** `wallraven.app` still uses Name.com's nameservers and
still points at Lovable's server, so the live site is Lovable's build, talking
to the database we migrated off. Cloudflare will only attach a custom domain to
a Worker if it runs the zone, so this needs the nameservers changed at the
registrar, which needs access Lovable holds. That is the single blocker for
everything public-facing. The domain carries no mail, TXT or CAA records, so the
move can only affect the website.

Free plan limits worth knowing: 10ms CPU per server-rendered request (5 minutes
on paid). Pages render fine under light use but this has never been under load.
If pages start returning Cloudflare error 1102, pre-render the pages that do not
need a server rather than paying.

Google sign-in still goes through `oauth.lovable.app` and will break when the
database moves for real, because those tokens are only valid for Lovable's
project. Email and password sign-in is unaffected. Fixing it needs a Google
OAuth client configured against the new Supabase project.

