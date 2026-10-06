import { createFileRoute, Link } from "@tanstack/react-router";

// Written from what the code actually does, checked on 6 Oct 2026. If you change
// what is collected, where it is stored or who processes it, change this page in
// the same commit. The facts it rests on:
//   - auth.users, profiles, user_settings, community_presets, preset_likes:
//     everything tied to an account, all ON DELETE CASCADE from auth.users.
//   - feedback: not linked to an account; email only if the person typed one.
//   - device_pairings: short-lived, five-minute expiry.
//   - src/lib/rate-limit.ts: IP addresses held in memory only, never stored.
//   - electron/cloud.cjs SECTIONS: what sync uploads. The Wallhaven API key is
//     deliberately not in it.
//   - No analytics, trackers or advertising anywhere on the site or in the app.

const CONTACT = "privacy@wallraven.app";
const UPDATED = "6 October 2026";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy — WallRaven" },
      {
        name: "description",
        content:
          "What WallRaven collects, why, where it is kept, who else handles it, and how to have it deleted.",
      },
      { property: "og:title", content: "Privacy — WallRaven" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="glass-card rounded-2xl p-6">
      <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function Item({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <li>
      <span className="font-semibold text-foreground">{name}.</span> {children}
    </li>
  );
}

function PrivacyPage() {
  const mail = <a className="text-foreground underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>;
  return (
    <main className="mx-auto w-full max-w-4xl pb-24 pt-7">
      <h1 className="text-gradient font-display text-4xl font-semibold tracking-tight">Privacy</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        WallRaven is a hobby project run by one person, Steve Shaw, in the UK. He is the data
        controller for anything described here. You can use the desktop app without an account,
        and then nothing about you is stored here. Last updated {UPDATED}.
      </p>

      <div className="mt-10 space-y-6">
        <Section title="Without an account">
          <p>
            The desktop app keeps its settings, history, likes and downloaded wallpapers on your own
            PC. It fetches wallpapers directly from Wallhaven using your own Wallhaven API key, if
            you give it one; that key stays on your PC and is never sent here. Wallhaven's own
            privacy policy covers what it sees.
          </p>
          <p>
            The app checks this site for updates, which tells the site your IP address, as any web
            request does. The site keeps no log of it.
          </p>
        </Section>

        <Section title="With an account">
          <p>Signing up is optional. If you do, this is what is kept:</p>
          <ul className="list-disc space-y-2 pl-5">
            <Item name="Your email address and a password">
              To sign you in. The password is stored only as a salted hash; nobody can read it. If
              you sign in with Google instead, Google tells us your email address and name.
            </Item>
            <Item name="A username, if you choose one">
              Shown publicly on presets you share. It can be changed once every 30 days.
            </Item>
            <Item name="Synced settings, if you sign the app in">
              Your search settings, timetable, presets, playlists, likes and dislikes, so they
              follow you between PCs. Not your Wallhaven API key, and not the wallpaper files
              themselves.
            </Item>
            <Item name="Presets you share, and presets you like">
              Shared presets are public, with your username on them.
            </Item>
            <Item name="The name of a PC you pair">
              Held for the few minutes a pairing takes.
            </Item>
          </ul>
        </Section>

        <Section title="Feedback and crash reports">
          <p>
            The app records crashes on your PC and shows them to you. Nothing is sent unless you
            choose to send it. Before sending, it removes your Windows username, your home folder
            and your Wallhaven API key from the report. Feedback and crash reports are not linked
            to your account. Your email address is only attached if you type it in so that you can
            get a reply.
          </p>
        </Section>

        <Section title="What is never collected">
          <p>
            No analytics, no tracking, no advertising, no fingerprinting, and nothing sold or
            shared for marketing. The site stores only your sign-in session in your browser, which
            is what keeps you signed in; there are no tracking cookies, so there is no cookie
            banner.
          </p>
        </Section>

        <Section title="Why, legally">
          <ul className="list-disc space-y-2 pl-5">
            <Item name="To provide the account you asked for">
              Your email, password, username, synced settings and presets. Without them there is
              no account.
            </Item>
            <Item name="Legitimate interests">
              Briefly holding IP addresses in memory to stop scripted abuse of the public pages, and
              sending you the emails your account needs (confirming your address and resetting your
              password).
            </Item>
            <Item name="Your consent">
              Crash reports and feedback, which are only sent when you choose to send them.
            </Item>
          </ul>
        </Section>

        <Section title="Who else handles it">
          <ul className="list-disc space-y-2 pl-5">
            <Item name="Supabase">
              Runs the database and sign-in. The data is stored in London (AWS eu-west-2).
            </Item>
            <Item name="Cloudflare">Serves this site from its network.</Item>
            <Item name="Resend">Sends the account emails, so it sees your email address.</Item>
            <Item name="Google">Only if you choose to sign in with Google.</Item>
          </ul>
          <p>
            Some of these companies are based in the United States and may process data there.
            Each is bound by data processing terms that include the UK's approved safeguards for
            international transfers.
          </p>
        </Section>

        <Section title="How long it is kept">
          <p>
            Account data is kept until you delete the account. Pairing records expire after five
            minutes. Feedback is kept while it is useful for fixing what it reports, and deleted on
            request.
          </p>
        </Section>

        <Section title="Your rights, and deleting your account">
          <p>
            You can ask for a copy of what is held about you, have it corrected, or have your
            account deleted. Deleting an account removes your email address, username, synced
            settings, shared presets and likes together. To do any of this, email {mail} from the
            address on the account. You will get an answer within a month, usually much sooner.
          </p>
          <p>
            If you are unhappy with how your data is handled, you can complain to the Information
            Commissioner's Office at{" "}
            <a className="text-foreground underline" href="https://ico.org.uk/make-a-complaint/">
              ico.org.uk
            </a>
            , though please get in touch first.
          </p>
        </Section>

        <Section title="Children">
          <p>
            WallRaven is not meant for children under 13, and accounts should not be made for them.
          </p>
        </Section>

        <p className="text-sm text-muted-foreground">
          <Link to="/" className="underline">
            Back to WallRaven
          </Link>
        </p>
      </div>
    </main>
  );
}
