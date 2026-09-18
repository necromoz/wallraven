import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Cloud,
  Folder,
  Gamepad2,
  Heart,
  Keyboard,
  LayoutGrid,
  Monitor,
  RefreshCw,
  Search,
  Sun,
  Users,
  WifiOff,
} from "lucide-react";

import feat01 from "@/assets/feat-01.jpg";
import feat02 from "@/assets/feat-02.jpg";
import feat03 from "@/assets/feat-03.jpg";
import feat04 from "@/assets/feat-04.jpg";
import feat05 from "@/assets/feat-05.jpg";
import feat06 from "@/assets/feat-06.jpg";
import feat07 from "@/assets/feat-07.jpg";
import feat08 from "@/assets/feat-08.jpg";
import feat09 from "@/assets/feat-09.jpg";
import feat10 from "@/assets/feat-10.jpg";
import feat11 from "@/assets/feat-11.jpg";
import feat12 from "@/assets/feat-12.jpg";
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
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/dd65d7f3-42ef-4fec-b807-ef256cae4b30/id-preview-3ea2f649--83217dbf-e2de-40b7-838c-7579bfa4d41f.lovable.app-1783517153126.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/dd65d7f3-42ef-4fec-b807-ef256cae4b30/id-preview-3ea2f649--83217dbf-e2de-40b7-838c-7579bfa4d41f.lovable.app-1783517153126.png",
      },
    ],
  }),
  component: Index,
});

const FEATURES = [
  {
    icon: Search,
    image: feat01,
    title: "Find the look you want",
    body: "Pick tags, colours and categories from a simple panel — no search syntax to learn.",
  },
  {
    icon: RefreshCw,
    image: feat02,
    title: "A fresh wallpaper, automatically",
    body: "Change every few minutes or once a day, and step back to the one you liked.",
  },
  {
    icon: Sun,
    image: feat03,
    title: "Different by time of day",
    body: "Calm mornings, bolder evenings, something quieter during work hours.",
  },
  {
    icon: LayoutGrid,
    image: feat04,
    title: "Presets that just work",
    body: "Over 65 hand-picked presets with previews. One click and your desktop changes.",
  },
  {
    icon: Users,
    image: feat05,
    title: "Presets from other people",
    body: "Share your own and try other people's. Your screen and account details stay private.",
  },
  {
    icon: Heart,
    image: feat06,
    title: "Your own collections",
    body: "Group the wallpapers you love and keep them safe from cleanups.",
  },
  {
    icon: Folder,
    image: feat07,
    title: "Your own pictures too",
    body: "Point WallRaven at folders on your PC and it cycles those the same way.",
  },
  {
    icon: Monitor,
    image: feat08,
    title: "Looks right on every screen",
    body: "A different wallpaper per monitor, sensible cropping, and a matching lock screen.",
  },
  {
    icon: Gamepad2,
    image: feat09,
    title: "Stays out of the way when gaming",
    body: "Spots full-screen games and apps and leaves your wallpaper alone until you're done.",
  },
  {
    icon: Keyboard,
    image: feat10,
    title: "Keyboard shortcuts",
    body: "Skip, go back, save or pause without opening the app.",
  },
  {
    icon: Cloud,
    image: feat11,
    title: "Same setup on every PC",
    body: "Sign in once and your filters, collections and favourites follow you.",
  },
  {
    icon: WifiOff,
    image: feat12,
    title: "Works offline",
    body: "Wallpapers are saved ahead of time, so it keeps going without a connection.",
  },
];

function Index() {
  return (
    <main className="min-w-0">
      {/* Hero panel */}
      <section className="rise relative overflow-hidden rounded-2xl border border-border bg-card/50">
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
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs tracking-wide text-muted-foreground uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Windows desktop app
          </span>
          <h1 className="text-gradient mt-4 font-display text-4xl leading-[1.07] font-semibold tracking-tight text-balance sm:text-5xl">
            Wallpapers that keep their own schedule.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
            WallRaven sits quietly in your taskbar and keeps your desktop looking new. Choose the
            kind of pictures you like, let it change them on its own, save the ones you love, and
            have the same setup waiting on every PC you use.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a
              href="https://wallraven.app/__l5e/assets-v1/0f35ffb2-d4f9-4478-83c3-55bd09170b19/Wallraven-Setup-v0.8.13.exe"
              className="glow-ring prism-btn inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5"
            >
              Download for Windows — v0.8.13
            </a>
            <Link
              to="/presets"
              className="inline-flex items-center justify-center rounded-lg border border-input bg-card/50 px-5 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
            >
              Browse presets
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mt-12">
        <h2 className="font-display text-2xl font-semibold tracking-tight">Everything it does</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Set it up once. Then just enjoy the view.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <article
              key={f.title}
              className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card/60 transition-colors hover:border-primary/50"
            >
              <div className="relative aspect-[3/2] overflow-hidden">
                <img
                  src={f.image}
                  alt=""
                  loading="lazy"
                  width={768}
                  height={512}
                  className="h-full w-full object-cover saturate-150 contrast-105 transition-transform duration-700 group-hover:scale-105"
                />
                <span
                  aria-hidden
                  className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent"
                />
              </div>
              <div className="relative flex flex-1 flex-col p-5 pt-4">
                <span className="font-display text-xs text-muted-foreground/70">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-1.5 pr-10 font-display text-base font-semibold">{f.title}</h3>
                <p className="mt-2 pr-10 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
                <f.icon
                  aria-hidden
                  className="absolute right-4 bottom-4 h-5 w-5 text-muted-foreground/60 transition-colors group-hover:text-primary"
                />
              </div>
              <span className="absolute inset-x-0 bottom-0 h-px scale-x-0 bg-gradient-to-r from-primary to-ember transition-transform duration-500 group-hover:scale-x-100" />
            </article>
          ))}
        </div>
      </section>

      <section className="glass-card relative mt-16 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl p-8 sm:flex-row sm:items-center">
        <img
          src={feat12}
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

      <footer className="mt-16 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-6 text-xs text-muted-foreground">
        <span>WallRaven — an unofficial companion for Wallhaven.cc</span>
        <span>Not affiliated with Wallhaven</span>
      </footer>
    </main>
  );
}
