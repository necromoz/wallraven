import { createFileRoute, Link } from "@tanstack/react-router";

import { RELEASES_PAGE, useLatestRelease } from "@/lib/latest-release";
import feat01 from "@/assets/feat-01.jpg";
import feat02 from "@/assets/feat-02.jpg";
import feat04 from "@/assets/feat-04.jpg";
import feat05 from "@/assets/feat-05.jpg";
import feat08 from "@/assets/feat-08.jpg";
import feat09 from "@/assets/feat-09.jpg";
import characterUrl from "@/assets/wallraven-character.png";

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

type Feature = {
  tag: string;
  image: string;
  title: string;
  body: string;
};

// A handful of hero features, not the whole list — shown as alternating
// full-width rows before the interlude.
const FEATURES_A: Feature[] = [
  {
    tag: "Discover",
    image: feat01,
    title: "Find the look you want",
    body: "Pick tags, colours and categories from a simple panel — no search syntax to learn.",
  },
  {
    tag: "Auto-cycle",
    image: feat02,
    title: "A fresh wallpaper, automatically",
    body: "Change every few minutes or once a day, and step back to the one you liked.",
  },
  {
    tag: "Presets",
    image: feat04,
    title: "Presets that just work",
    body: "Over 65 hand-picked presets with previews. One click and your desktop changes.",
  },
  {
    tag: "Multi-monitor",
    image: feat08,
    title: "Looks right on every screen",
    body: "A different wallpaper per monitor, sensible cropping, and a matching lock screen.",
  },
];

// The interlude's own feature — pulled out of the grid and given a full-width
// banner, since "stays out of the way" reads better as a statement than a card.
const FOCUS_FEATURE: Feature = {
  tag: "Focus",
  image: feat09,
  title: "Stays out of the way when gaming",
  body: "WallRaven spots full-screen games and apps and leaves your wallpaper alone until you're done.",
};

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

function FeatureRow({ feature, number }: { feature: Feature; number: number }) {
  const reversed = number % 2 === 0;
  return (
    <div className={`flex flex-col border-t border-border md:flex-row ${reversed ? "md:flex-row-reverse" : ""}`}>
      <div className="flex flex-1 flex-col justify-center p-8 sm:p-10 md:basis-2/5">
        <span className="inline-flex items-center gap-2 text-xs font-bold tracking-[0.2em] text-primary uppercase">
          {String(number).padStart(2, "0")} — {feature.tag}
        </span>
        <h3 className="font-display mt-3 text-2xl font-bold tracking-tight">{feature.title}</h3>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
      </div>
      <div
        className={`relative min-h-[260px] flex-1 overflow-hidden border-border md:basis-3/5 ${
          reversed ? "md:border-r" : "md:border-l"
        }`}
      >
        <img
          src={feature.image}
          alt=""
          loading="lazy"
          width={1264}
          height={848}
          className="h-full w-full object-cover saturate-150 contrast-105"
        />
      </div>
    </div>
  );
}

function Index() {
  const latest = useLatestRelease();
  const downloadLabel = `Download for Windows${latest ? ` — v${latest.version}` : ""}`;

  return (
    <main className="min-w-0">
      {/* Hero */}
      <section className="rise relative overflow-hidden rounded-none border border-border bg-card/50">
        <WingMotif className="pointer-events-none absolute -top-28 -left-36 h-[560px] w-[560px] text-primary opacity-[0.06]" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-[46%] lg:block"
        >
          <div className="absolute inset-x-8 top-6 bottom-6 rounded-full bg-primary/14 blur-[110px]" />
          <img
            src={characterUrl}
            alt=""
            width={960}
            height={1408}
            className="relative h-full w-full object-cover object-top opacity-70 [mask-image:linear-gradient(to_right,transparent,rgba(0,0,0,1)_38%)]"
          />
        </div>
        <div className="relative z-10 max-w-2xl p-8 sm:p-10 lg:py-14">
          <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-primary uppercase">
            <span className="h-px w-5 bg-primary" />
            Windows desktop app
          </span>
          <h1 className="font-display mt-5 text-4xl leading-[1.08] font-bold tracking-tight text-balance uppercase sm:text-5xl">
            Wallpapers that keep their own schedule.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
            WallRaven sits quietly in your taskbar and keeps your desktop looking new. Choose the
            kind of pictures you like, let it change them on its own, save the ones you love, and
            have the same setup waiting on every PC you use.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
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
          <p className="mt-6 text-xs tracking-wide text-muted-foreground/70 uppercase">
            Free · Windows 10 &amp; 11 · No account required to start
          </p>
        </div>
      </section>

      {/* Editorial statement */}
      <section className="mt-14 flex flex-col items-center border-y border-border py-12 text-center">
        <span aria-hidden className="h-9 w-px bg-border" />
        <p className="font-display mt-6 max-w-2xl text-xl leading-snug font-semibold tracking-tight text-balance sm:text-2xl">
          Not a widget. Not a slideshow. A desktop that finds what you like, keeps its own
          schedule, and stays out of the way when it matters.
        </p>
        <span aria-hidden className="mt-6 h-9 w-px bg-border" />
      </section>

      {/* Features, rows 1-6 */}
      <section className="border-b border-border">
        {FEATURES_A.map((f, i) => (
          <FeatureRow key={f.title} feature={f} number={i + 1} />
        ))}
      </section>

      {/* Interlude */}
      <section className="relative h-[360px] overflow-hidden border-b border-border sm:h-[420px]">
        <img
          src={FOCUS_FEATURE.image}
          alt=""
          aria-hidden
          loading="lazy"
          width={1264}
          height={848}
          className="absolute inset-0 h-full w-full object-cover saturate-150 contrast-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
        <div className="absolute inset-x-6 bottom-8 sm:inset-x-10">
          <span className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
            Always ready
          </span>
          <p className="font-display mt-3 max-w-lg text-xl leading-snug font-bold tracking-tight uppercase sm:text-2xl">
            Saved ahead of time. Cropped for every screen. Gone the moment you need focus.
          </p>
        </div>
      </section>

      {/* Cross-promo */}
      <section className="glass-card relative mt-10 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-none p-8 sm:flex-row sm:items-center">
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
      <section className="mt-10 flex flex-col items-center border-y border-border py-16 text-center">
        <span className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
          Get started
        </span>
        <h2 className="font-display mt-5 max-w-xl text-3xl leading-tight font-bold tracking-tight text-balance uppercase sm:text-4xl">
          Give your desktop something to do.
        </h2>
        <a
          href={latest?.url ?? RELEASES_PAGE}
          className="glow-ring prism-btn mt-7 inline-flex items-center justify-center rounded-lg px-6 py-3 text-sm font-semibold transition-transform hover:-translate-y-0.5"
        >
          {downloadLabel}
        </a>
        <p className="mt-4 text-xs tracking-wide text-muted-foreground/70 uppercase">
          Windows 10 &amp; 11 · Free
        </p>
      </section>

      <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 pt-6 text-xs text-muted-foreground">
        <span>WallRaven — an unofficial companion for Wallhaven.cc</span>
        <span>Not affiliated with Wallhaven</span>
      </footer>
    </main>
  );
}
