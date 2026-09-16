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

## Release gates

All three are now closed in code. None are verified end to end, and the
distinction matters:

1. ~~**The auto-updater runs unverified executables.**~~ Closed. Pinned host
   allowlist, published SHA-256 checked before the installer is run, redirects
   re-checked at every hop. The remaining gap is real: the checksum arrives in
   the same manifest as the download URL, so this protects against a swapped
   file on a trusted server, not against that server being taken over. Only a
   signed installer fixes that, and signing also stops SmartScreen frightening
   people. Not done: it costs money, or a Microsoft Store listing.
2. ~~**Device pairing is a one-click account takeover.**~~ Closed. Server
   generates both codes, the user types the short one off the screen of the
   machine being paired, no CORS. **Never tested against a real pairing**: the
   endpoints need `SUPABASE_SERVICE_ROLE_KEY` on the Worker and it is not set.
3. ~~**No crash reporting.**~~ Closed. Crashes are recorded locally, redacted
   (home directory, username, Wallhaven key), shown in Settings, and sent only
   when the person chooses to, through the feedback endpoint into Steve's own
   database. No third party. Still no beta channel, and still one tester.

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
- All Wallhaven API calls are serialised through one promise chain (`WH_CHAIN`) and
  the JSON helpers have no timeouts, so one stalled request wedges every wallpaper
  change. 0.8.13 papers over this with a 30-second lock takeover.

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

