#!/usr/bin/env node
//
// Render the site's social-preview card (public/og-image.png) from the
// site's own brand assets and colour tokens.
//
// This used to be a URL hotlinked straight from Lovable's own R2 bucket --
// a preview-build filename with their domain baked in -- so what people saw
// when wallraven.app was shared on Discord, Twitter, etc. depended on
// Lovable's infrastructure staying up indefinitely, on a site that no
// longer has anything else to do with Lovable. This renders the same
// character art, icon and gradient heading style as the homepage hero
// (src/routes/index.tsx) to a flat 1200x630 PNG, served from our own
// domain.
//
//   node scripts/og-image.mjs                  writes public/og-image.png
//   node scripts/og-image.mjs --out /tmp/x.png  writes elsewhere instead
//
// Needs Playwright and a Chromium build, same as scripts/shoot-settings.mjs:
//
//   npm i -D playwright && npx playwright install chromium
//
// or point it at a Chromium you already have:
//
//   CHROMIUM=/path/to/chrome node scripts/og-image.mjs

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const OUT = path.resolve(ROOT, arg("out", "public/og-image.png"));
const CHARACTER = path.join(ROOT, "src/assets/wallraven-character.png");
const ICON = path.join(ROOT, "src/assets/wallraven-icon.png");

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error(
    "playwright is not installed. npm i -D playwright, then npx playwright install chromium",
  );
  process.exit(1);
}

// Same colour tokens as src/styles.css's dark theme and .text-gradient
// utility, and the same hero composition as index.tsx: character art faded
// in from the right behind a soft primary-colour glow, gradient heading on
// the left. Kept as one self-contained HTML string rather than importing
// the real stylesheet, since this renders standalone, outside the app.
const html = `<!doctype html>
<html><head><meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500&display=swap"
  rel="stylesheet"
/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 1200px;
    height: 630px;
    background: oklch(0.16 0.018 275);
    overflow: hidden;
    font-family: "DM Sans", ui-sans-serif, system-ui, sans-serif;
  }
  .stage { position: relative; width: 1200px; height: 630px; }
  .glow {
    position: absolute;
    top: -120px;
    right: -60px;
    width: 640px;
    height: 640px;
    border-radius: 999px;
    background: oklch(0.82 0.095 285 / 22%);
    filter: blur(110px);
  }
  .character {
    position: absolute;
    top: 0;
    right: -40px;
    width: 620px;
    height: 630px;
    object-fit: cover;
    object-position: top;
    opacity: 0.8;
    -webkit-mask-image: linear-gradient(to right, transparent, rgba(0, 0, 0, 1) 42%);
    mask-image: linear-gradient(to right, transparent, rgba(0, 0, 0, 1) 42%);
  }
  .content { position: relative; z-index: 2; padding: 82px 0 0 82px; max-width: 700px; }
  .brand { display: flex; align-items: center; gap: 14px; margin-bottom: 44px; }
  .icon { width: 48px; height: 48px; border-radius: 13px; }
  .brand-name {
    font-family: "Space Grotesk", sans-serif;
    font-weight: 600;
    font-size: 26px;
    color: oklch(0.965 0.006 265);
    letter-spacing: -0.01em;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border: 1px solid oklch(1 0 0 / 14%);
    background: oklch(0.213 0.022 275 / 70%);
    border-radius: 999px;
    padding: 7px 14px;
    font-size: 13px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: oklch(0.72 0.024 265);
    margin-bottom: 26px;
  }
  .dot { width: 7px; height: 7px; border-radius: 999px; background: oklch(0.82 0.095 285); }
  h1 {
    font-family: "Space Grotesk", sans-serif;
    font-weight: 700;
    font-size: 58px;
    line-height: 1.08;
    letter-spacing: -0.015em;
    background-image: linear-gradient(
      100deg,
      oklch(0.965 0.006 265) 8%,
      oklch(0.83 0.08 230) 38%,
      oklch(0.82 0.095 285) 58%,
      oklch(0.84 0.07 350) 88%
    );
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    max-width: 620px;
  }
  p.tagline { margin-top: 26px; font-size: 21px; line-height: 1.55; color: oklch(0.72 0.024 265); max-width: 540px; }
</style></head>
<body>
  <div class="stage">
    <div class="glow"></div>
    <img class="character" src="file://${CHARACTER}" alt="" />
    <div class="content">
      <div class="brand">
        <img class="icon" src="file://${ICON}" alt="" />
        <span class="brand-name">WallRaven</span>
      </div>
      <span class="badge"><span class="dot"></span>Windows desktop app</span>
      <h1>A new wallpaper whenever you want one.</h1>
      <p class="tagline">
        Pick the style you like, let it change on its own, save the ones you love, and keep the
        same setup on every PC.
      </p>
    </div>
  </div>
</body></html>`;

// Written to a real file and loaded with goto(), not page.setContent(): a
// page handed its HTML directly has the origin about:blank, and Chromium
// refuses "Not allowed to load local resource" for every file:// image on
// it -- both the character art and the icon silently failed to load that
// way, leaving a blank card. Giving the page a file:// origin of its own
// (same as scripts/shoot-settings.mjs loading settings.html) is what makes
// the browser trust its own file:// neighbours.
const tmpHtml = path.join(ROOT, ".og-image.tmp.html");
fs.writeFileSync(tmpHtml, html);

const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {},
);
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(`file://${tmpHtml}`, { waitUntil: "networkidle" });
fs.mkdirSync(path.dirname(OUT), { recursive: true });
await page.screenshot({ path: OUT });
await browser.close();
fs.rmSync(tmpHtml, { force: true });

console.log(`Wrote ${path.relative(ROOT, OUT)}`);
