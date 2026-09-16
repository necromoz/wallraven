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

These are fine while it's two machines. None of them can ship to the public:

1. **The auto-updater runs unverified executables.** `autoInstallUpdates` defaults
   true, `downloadUrl` comes from a remote manifest with no host allowlist, no
   checksum and no signature check, then gets spawned with `/S`. Needs a pinned
   host, a published SHA-256, and a signed installer. Unsigned installers also get
   hammered by SmartScreen, so signing is a usability fix as much as a security one.
2. **Device pairing is a one-click account takeover.** `/api/public/pair/start` has
   wildcard CORS and accepts a caller-chosen code; `/link?pair=X` hands over access
   and refresh tokens on one button press. Needs server-generated codes and a code
   the user visually matches.
3. **No crash reporting and no beta channel in use.** Two people testing by hand
   does not survive contact with strangers.

## Known traps

- `package-lock.json` declares version `0.2.0` against a `0.8.13` package and about
  half its entries resolve to Lovable's private npm mirror, so `npm ci` fails.
  Regenerate against `registry.npmjs.org` before setting up any CI.
- `src/routes/__root.tsx:108` fails `tsc` on a fresh install: a newer
  `@tanstack/react-router` tightened `ErrorComponentProps.error` to `unknown`.
- `settings.html` at the repo root is a **dead duplicate** of
  `electron/settings.html`. Only the one in `electron/` is loaded. Edit the wrong
  one and nothing happens.
- The site URL is hardcoded in five places across `cloud.cjs` and `main.cjs`, split
  between `wallraven.lovable.app` and `wallraven.app`.
- All Wallhaven API calls are serialised through one promise chain (`WH_CHAIN`) and
  the JSON helpers have no timeouts, so one stalled request wedges every wallpaper
  change. 0.8.13 papers over this with a 30-second lock takeover.

## Hosting

`wallraven.app` is still served by Lovable and the domain is registered through
them (Name.com is the sponsoring registrar). This repo is not connected to
Lovable, so pushes here do not redeploy it; Lovable keeps serving what it last
built.

The site now also runs on Steve's own Cloudflare account, on the Workers free
plan, at `necromoz-wallraven.necromoz.workers.dev`. It is deployed by hand with
`npx wrangler deploy` from a checkout, after `npm run build`. Two secrets are set
on the Worker (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`); both are publishable
values, and nothing secret is involved. Landing page, preset gallery, changelog,
sign-in page and the update manifest were all verified working there.

DNS has not moved. Cutting `wallraven.app` over is a separate, deliberate step.

Two things to know before relying on this:

- The Workers free plan allows 10ms of CPU per server-rendered request against
  5 minutes on paid. Pages render fine under light use, but this has never been
  under load. If pages start returning Cloudflare error 1102, that limit is why,
  and the fix is to pre-render the pages that do not need a server rather than
  to start paying.
- Google sign-in does not go to Supabase. `@lovable.dev/cloud-auth-js` brokers it
  through `oauth.lovable.app`, so that one flow depends on Lovable wherever the
  site is hosted. Email and password sign-in, registration and password resets
  all talk to Supabase directly. Replacing it means a Google OAuth client
  configured in Supabase.
