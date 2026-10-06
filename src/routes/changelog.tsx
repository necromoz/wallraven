import { createFileRoute } from "@tanstack/react-router";

import changelogRaw from "../../electron/CHANGELOG.md?raw";

export const Route = createFileRoute("/changelog")({
  head: () => ({
    meta: [
      { title: "Changelog — WallRaven for Windows" },
      {
        name: "description",
        content:
          "Every WallRaven release, version by version: new features, fixes and improvements for the Wallhaven wallpaper companion on Windows.",
      },
      { property: "og:title", content: "Changelog — WallRaven for Windows" },
      {
        property: "og:description",
        content:
          "Every WallRaven release, version by version: new features, fixes and improvements for the Wallhaven wallpaper companion.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChangelogPage,
});

type Release = { heading: string; items: string[] };

// electron/CHANGELOG.md also carries beta entries, because the app shows its
// own notes in What's new. This page is public, so it lists stable releases
// only: anything like "v1.3.1-beta.1" is a pre-release and stays out until it
// ships under a plain version number.
const PRERELEASE = /^v?\d+\.\d+\.\d+-/;

function parseChangelog(md: string): Release[] {
  const releases: Release[] = [];
  let current: Release | null = null;
  for (const line of md.split(/\r?\n/)) {
    if (line.startsWith("## ")) {
      const heading = line.slice(3).trim();
      current = PRERELEASE.test(heading) ? null : { heading, items: [] };
      if (current) releases.push(current);
    } else if (line.startsWith("- ") && current) {
      current.items.push(line.slice(2).trim());
    }
  }
  return releases;
}

// Only **bold** matters in these notes; render it without pulling in a
// markdown dependency.
function renderInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-foreground">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function ChangelogPage() {
  const releases = parseChangelog(changelogRaw);

  return (
    <main className="mx-auto w-full max-w-4xl pb-24 pt-7">
      <h1 className="text-gradient font-display text-4xl font-semibold tracking-tight">
        Changelog
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Everything that has shipped in WallRaven, newest first. The desktop app checks for updates
        automatically and shows these same notes before installing.
      </p>

      <ol className="mt-10 space-y-8">
        {releases.map((rel) => (
          <li key={rel.heading} className="glass-card rounded-2xl p-6">
            <h2 className="font-display text-lg font-semibold tracking-tight">{rel.heading}</h2>
            <ul className="mt-4 space-y-2.5">
              {rel.items.map((item, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
                  <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <span>{renderInline(item)}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </main>
  );
}
