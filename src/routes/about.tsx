import { createFileRoute, Link } from "@tanstack/react-router";

// Steve's own words about why WallRaven exists. Edit freely, but keep it in his
// voice: plain, first person, no marketing.

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — WallRaven" },
      {
        name: "description",
        content:
          "Why WallRaven exists: a wallpaper app one person made for himself, built with AI, shared as a thank-you to Wallhaven.",
      },
      { property: "og:title", content: "About — WallRaven" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AboutPage,
});

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] leading-relaxed text-muted-foreground">{children}</p>;
}

function H({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="pt-4 font-display text-xl font-semibold tracking-tight text-foreground">
      {children}
    </h2>
  );
}

function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-2xl pb-24 pt-7">
      <h1 className="text-gradient font-display text-4xl font-semibold tracking-tight">About</h1>

      <div className="mt-8 space-y-5">
        <P>
          Hi, I'm NecroMoz. I made WallRaven for myself, because I spend a lot of time looking at my
          desktop and wanted it to show me something new from Wallhaven every so often without me
          having to go and find it. After spending months looking for the perfect app, I gave up and
          made my own.
        </P>

        <H>How it started</H>
        <P>
          It began as a small tray app that pulled a random wallpaper from Wallhaven's API on a
          timer. It went through a few names on the way (Wallhaven Buddy, Rotato, Wallbuddy, all
          either taken or terrible) before I landed on WallRaven: a haven, a raven, close enough.
        </P>
        <P>
          Then I kept wanting more from it as I tested. A way to like and dislike pictures so it
          learned what I wanted. Playlists. Presets. A timetable so I could share my desktop safely
          in the day and enjoy something a little more fun in the evenings. Pausing while I'm in a
          game. Every feature in it is there because I wanted it on my own PC first.
        </P>

        <H>It's vibe coded, honestly</H>
        <P>
          I've worked in sustainable IT for decades, but I'm not a programmer and I don't write
          code. WallRaven was built by describing what I wanted to AI tools and testing what came
          back: first Lovable, and since September, Claude. I decide what it should do, try it,
          break it, and ask for it to be fixed. That's the whole method and I'm not trying to hide
          it! It's been fun and challenging in equal measure.
        </P>
        <P>
          I'm telling you that up front because you deserve to know what you're installing. I've
          taken the boring parts seriously: updates are checked against a published checksum before
          they run, crash reports never leave your PC unless you send them, and there's no tracking
          of any kind (the{" "}
          <Link to="/privacy" className="text-foreground underline">
            privacy page
          </Link>{" "}
          has the detail). But it's one person's hobby project, made in the evenings while juggling
          work and a young kid, and it will have rough edges. If you find one, the feedback button
          in the app comes straight to me. Trust me, I want to know about it!
        </P>

        <H>A thank-you to Wallhaven</H>
        <P>
          None of this would exist without{" "}
          <a className="text-foreground underline" href="https://wallhaven.cc/">
            Wallhaven
          </a>{" "}
          and the people who upload to it. It's been my go-to for wallpapers for years, and
          WallRaven is really just a different way of enjoying what they've built. Every picture
          comes straight from Wallhaven, and the app links each one back to its page there.
          Nothing is copied or hosted here.
        </P>
        <P>
          WallRaven isn't affiliated with or endorsed by Wallhaven. It's a fan's tribute, nothing
          more.
        </P>

        <H>Not a business</H>
        <P>
          WallRaven is free, and it'll stay that way. I have no desire to make money from it. No
          ads, no premium tier, no selling your data. There's a Ko-fi tip button within the app if
          you want to say thanks. If a single person ever donates, I'll be a happy man. I'm sharing
          it because I use it every day and thought other people who love Wallhaven might too.
        </P>
        <P>Thanks for giving it a go.</P>
        <P>Steve</P>

        <p className="pt-4 text-sm text-muted-foreground">
          <Link to="/" className="underline">
            Back to WallRaven
          </Link>
        </p>
      </div>
    </main>
  );
}
