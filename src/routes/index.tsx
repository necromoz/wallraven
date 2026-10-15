import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Cloud,
  Folder,
  Gamepad2,
  LayoutGrid,
  Monitor,
  RefreshCw,
  Search,
  WifiOff,
} from "lucide-react";

import { RELEASES_PAGE, useLatestRelease } from "@/lib/latest-release";
import feat05 from "@/assets/feat-05.jpg";
import appHome from "@/assets/app-home.jpg";
import appBrowse from "@/assets/app-browse.jpg";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "WallRaven — a new wallpaper whenever you want one" },
      {
        name: "description",
        content:
          "WallRaven keeps your Windows desktop looking fresh: pick the style you like, let it change on its own, save the ones you love, and keep the same setup on every PC.",
      },
      { property: "og:title", content: "WallRaven — a new wallpaper whenever you want one" },
      {
        property: "og:description",
        content:
          "Pick the style you like, let your wallpaper change on its own, save your favourites, and keep the same setup on every PC.",
      },

      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      // Used to be hotlinked straight from Lovable's own R2 bucket (a
      // preview-build URL with their domain baked into the filename), so
      // what people saw sharing wallraven.app depended on Lovable's
      // infrastructure staying up indefinitely. public/og-image.png is
      // rendered from the site's own brand assets (scripts/og-image.mjs) and
      // served from our own domain.
      {
        property: "og:image",
        content: "https://wallraven.app/og-image.png",
      },
      {
        property: "og:image:width",
        content: "1200",
      },
      {
        property: "og:image:height",
        content: "630",
      },
      {
        name: "twitter:image",
        content: "https://wallraven.app/og-image.png",
      },
    ],
  }),
  component: Index,
});

type Bullet = {
  icon: typeof Search;
  title: string;
  body: string;
};

const BULLETS: Bullet[] = [
  {
    icon: Search,
    title: "Find the look you want",
    body: "Tags, colours and categories — no search syntax to learn.",
  },
  {
    icon: RefreshCw,
    title: "Changes on its own",
    body: "Every few minutes or once a day, your call.",
  },
  {
    icon: LayoutGrid,
    title: "65+ ready-made presets",
    body: "One click and your whole desktop changes.",
  },
  {
    icon: Monitor,
    title: "Every monitor, cropped right",
    body: "A different wallpaper per screen, plus a matching lock screen.",
  },
  {
    icon: Folder,
    title: "Your own pictures too",
    body: "Point it at a folder on your PC and it cycles those the same way.",
  },
  {
    icon: Cloud,
    title: "Same setup everywhere",
    body: "Sign in once and your filters and favourites follow you.",
  },
  {
    icon: WifiOff,
    title: "Works offline",
    body: "Wallpapers are saved ahead of time.",
  },
  {
    icon: Gamepad2,
    title: "Stays out of the way",
    body: "Spots full-screen games and apps and leaves you alone.",
  },
];

// Original abstract wing motif — a faint decorative watermark, not a logo.
function WingMotif({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 900 900" className={className}>
      <path
        d="M450 80 C 300 140, 160 260, 90 460 C 220 420, 330 430, 420 490 C 330 520, 230 600, 170 740 C 300 680, 400 660, 470 690 C 420 760, 400 820, 410 860 C 480 780, 560 700, 610 600 C 560 610, 510 600, 480 570 C 580 540, 680 470, 740 360 C 670 380, 610 370, 570 330 C 660 280, 740 200, 780 110 C 680 140, 590 150, 520 130 C 560 100, 580 70, 580 40 C 530 60, 480 70, 450 80 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
      />
    </svg>
  );
}

// A framed "window" around a real screenshot, so it reads as the actual app
// rather than decorative art.
function AppWindow({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="shadow-lift relative overflow-hidden rounded-none border border-border bg-card">
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2.5">
        <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
        <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
        <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
      </div>
      <img src={src} alt={alt} loading="lazy" width={1400} height={1000} className="block w-full" />
    </div>
  );
}

function Index() {
  const latest = useLatestRelease();
  const downloadLabel = `Download for Windows${latest ? ` — v${latest.version}` : ""}`;

  return (
    <main className="min-w-0">
      {/* Hero — everything you need lands in the first screen */}
      <section className="rise relative grid gap-8 overflow-hidden rounded-none border border-border bg-card/50 p-6 sm:p-8 lg:grid-cols-[1fr_1.15fr] lg:items-center lg:gap-10 lg:p-10">
        <WingMotif className="pointer-events-none absolute -top-24 -left-32 hidden h-[480px] w-[480px] text-primary opacity-[0.06] lg:block" />
        <div className="relative z-10">
          <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-primary uppercase">
            <span className="h-px w-5 bg-primary" />
            Windows desktop app
          </span>
          <h1 className="font-display mt-4 text-3xl leading-[1.1] font-bold tracking-tight text-balance uppercase sm:text-4xl">
            Wallpapers that keep their own schedule.
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
            WallRaven sits quietly in your taskbar and keeps your desktop looking new. Choose the
            kind of pictures you like, let it change them on its own, and save the ones you love.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a
              href={latest?.url ?? RELEASES_PAGE}
              className="glow-ring prism-btn inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5"
            >
              {downloadLabel}
            </a>
            <Link
              to="/presets"
              className="inline-flex items-center justify-center rounded-lg border border-input bg-card/50 px-5 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
            >
              Browse presets
            </Link>
          </div>
          <p className="mt-5 text-xs tracking-wide text-muted-foreground/70 uppercase">
            Free · Windows 10 &amp; 11 · No account required to start
          </p>
        </div>
        <div className="relative z-10">
          <AppWindow src={appHome} alt="WallRaven's Now Playing screen, showing the current wallpaper and a quick way to step through recent ones" />
        </div>
      </section>

      {/* Everything it does — one screenshot, a compact list, no endless scroll */}
      <section className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-10">
        <AppWindow src={appBrowse} alt="WallRaven's Browse screen, searching Wallhaven by tag, colour and category" />
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight">Everything it does</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">Set it up once. Then just enjoy the view.</p>
          <ul className="mt-5 grid gap-4 sm:grid-cols-2">
            {BULLETS.map((b) => (
              <li key={b.title} className="flex gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-primary">
                  <b.icon className="h-3.5 w-3.5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{b.title}</div>
                  <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{b.body}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Cross-promo */}
      <section className="glass-card relative mt-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-none p-8 sm:flex-row sm:items-center">
        <img
          src={feat05}
          alt=""
          aria-hidden
          loading="lazy"
          width={768}
          height={512}
          className="absolute inset-0 h-full w-full object-cover opacity-40 saturate-150 contrast-105"
        />
        <span
          aria-hidden
          className="absolute inset-0 bg-gradient-to-r from-card via-card/85 to-card/40"
        />
        <div className="relative">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            Borrow someone else's preset
          </h2>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Shared presets bring the style with them. Your own timetable, your screens, your keys
            and your account details stay with you.
          </p>
        </div>
        <Link
          to="/presets"
          className="prism-btn relative inline-flex shrink-0 items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5"
        >
          Browse presets
        </Link>
      </section>

      {/* Final CTA */}
      <section className="mt-8 flex flex-col items-center border-y border-border py-10 text-center">
        <h2 className="font-display max-w-xl text-2xl leading-tight font-bold tracking-tight text-balance uppercase sm:text-3xl">
          Give your desktop something to do.
        </h2>
        <a
          href={latest?.url ?? RELEASES_PAGE}
          className="glow-ring prism-btn mt-6 inline-flex items-center justify-center rounded-lg px-6 py-3 text-sm font-semibold transition-transform hover:-translate-y-0.5"
        >
          {downloadLabel}
        </a>
        <p className="mt-4 text-xs tracking-wide text-muted-foreground/70 uppercase">
          Windows 10 &amp; 11 · Free
        </p>
      </section>

      <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 pt-6 text-xs text-muted-foreground">
        <span>WallRaven — an unofficial companion for Wallhaven.cc</span>
        <span>Not affiliated with Wallhaven</span>
      </footer>
    </main>
  );
}
