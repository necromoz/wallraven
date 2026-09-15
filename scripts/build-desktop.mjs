#!/usr/bin/env node
//
// Build the WallRaven desktop app and, on Windows, wrap it in the NSIS
// installer.
//
// This did not exist before: packaging was run ad hoc inside Lovable and the
// commands were never committed, so the repo could describe the app but not
// produce one. Everything the build needs is now here.
//
//   node scripts/build-desktop.mjs            build for the current platform
//   node scripts/build-desktop.mjs --platform win32
//
// Output:
//   electron/_pkg/src/                staged app source (throwaway)
//   electron/app/                     packaged app, which installer.nsi expects
//   dist/Wallraven-Setup-v<ver>.exe   the installer, Windows only
//
// The desktop app has no third-party runtime dependencies: main.cjs and
// cloud.cjs require only electron and Node built-ins. So the staged app ships
// no node_modules, which is why the packaged output is small and the build is
// quick.

import { packager } from "@electron/packager";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ELECTRON_DIR = path.join(ROOT, "electron");
const PKG_DIR = path.join(ELECTRON_DIR, "_pkg");
const STAGE_DIR = path.join(PKG_DIR, "src");
const OUT_DIR = path.join(PKG_DIR, "out");
const APP_DIR = path.join(ELECTRON_DIR, "app");
const DIST_DIR = path.join(ROOT, "dist");

const APP_NAME = "WallRaven";
// The installer refers to the executable as Wallraven.exe. Windows is
// case-insensitive so a mismatch would still work, but matching exactly keeps
// taskkill, shortcuts and the Run key unambiguous.
const EXECUTABLE_NAME = "Wallraven";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function log(msg) {
  console.log(`[build] ${msg}`);
}

// Files under electron/ that belong to the build or the repo, not the shipped
// app. Everything else is copied into the package.
const EXCLUDE = new Set(["_pkg", "app", "out", "test", "installer.nsi"]);
const EXCLUDE_RE = [
  /\.asset\.json$/i, // receipts from Lovable's CDN uploads
  /^installer-.*\.bmp$/i, // installer artwork, read by makensis from electron/
];

function shouldStage(name) {
  if (EXCLUDE.has(name)) return false;
  return !EXCLUDE_RE.some((re) => re.test(name));
}

function readVersion() {
  const v = fs.readFileSync(path.join(ELECTRON_DIR, "VERSION"), "utf8").trim();
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(v)) {
    throw new Error(`electron/VERSION does not look like a version: "${v}"`);
  }
  return v;
}

function stage(version) {
  fs.rmSync(PKG_DIR, { recursive: true, force: true });
  fs.mkdirSync(STAGE_DIR, { recursive: true });

  let copied = 0;
  for (const entry of fs.readdirSync(ELECTRON_DIR, { withFileTypes: true })) {
    if (!shouldStage(entry.name)) continue;
    fs.cpSync(path.join(ELECTRON_DIR, entry.name), path.join(STAGE_DIR, entry.name), {
      recursive: true,
    });
    copied++;
  }

  // A minimal manifest for the packaged app. Deliberately not the repo's
  // package.json: that one describes the website build and carries ~480
  // dependencies the desktop app never loads.
  fs.writeFileSync(
    path.join(STAGE_DIR, "package.json"),
    JSON.stringify(
      {
        name: "wallraven",
        productName: APP_NAME,
        version,
        description: "Wallhaven wallpaper manager",
        main: "main.cjs",
        author: "WallRaven",
        private: true,
      },
      null,
      2,
    ) + "\n",
  );

  log(`staged ${copied} entries into electron/_pkg/src`);
}

async function pack(version, platform, arch) {
  const paths = await packager({
    dir: STAGE_DIR,
    out: OUT_DIR,
    platform,
    arch,
    name: APP_NAME,
    executableName: EXECUTABLE_NAME,
    appVersion: version,
    appCopyright: `Copyright (c) ${new Date().getFullYear()} WallRaven`,
    // Without an explicit icon Windows pins the default Electron logo onto the
    // exe and every shortcut made from it.
    icon: path.join(ELECTRON_DIR, "icon"),
    // The installer's upgrade cleanup removes resources\app, i.e. the
    // unpacked layout. Keep it unpacked so that stays true.
    asar: false,
    prune: true,
    overwrite: true,
    quiet: true,
  });

  const built = paths[0];
  log(`packaged to ${path.relative(ROOT, built)}`);

  // installer.nsi does `File /r "app\*.*"` relative to electron/, so the
  // packaged output has to land there under that exact name.
  fs.rmSync(APP_DIR, { recursive: true, force: true });
  fs.cpSync(built, APP_DIR, { recursive: true });
  log(`copied to electron/app`);

  const exe = path.join(APP_DIR, `${EXECUTABLE_NAME}.exe`);
  if (platform === "win32" && !fs.existsSync(exe)) {
    throw new Error(`expected ${EXECUTABLE_NAME}.exe in electron/app but it is missing`);
  }
  return APP_DIR;
}

function findMakensis() {
  for (const candidate of [
    "makensis",
    "C:\\Program Files (x86)\\NSIS\\makensis.exe",
    "C:\\Program Files\\NSIS\\makensis.exe",
  ]) {
    const probe = spawnSync(candidate, ["/VERSION"], { encoding: "utf8" });
    if (!probe.error) return candidate;
  }
  return null;
}

function buildInstaller(version) {
  const makensis = findMakensis();
  if (!makensis) {
    log("makensis not found, skipping the installer step");
    log("electron/app is built; install NSIS to produce the .exe");
    return null;
  }

  fs.mkdirSync(DIST_DIR, { recursive: true });
  const outFile = path.join(DIST_DIR, `Wallraven-Setup-v${version}.exe`);

  // Run from electron/ because the script's File directives are relative to
  // the working directory: `app\*.*`, `icon.ico`.
  const res = spawnSync(
    makensis,
    [`/DOUTFILE=${outFile}`, `/DAPP_VERSION=${version}`, "installer.nsi"],
    { cwd: ELECTRON_DIR, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );

  if (res.status !== 0) {
    console.error(res.stdout || "");
    console.error(res.stderr || "");
    throw new Error(`makensis exited ${res.status}`);
  }
  if (!fs.existsSync(outFile)) {
    throw new Error("makensis reported success but produced no installer");
  }

  const mb = fs.statSync(outFile).size / (1024 * 1024);
  // A real NSIS installer for an Electron app is ~100 MB. Anything tiny means
  // the app directory was empty and we packaged nothing.
  if (mb < 20) {
    throw new Error(`installer is only ${mb.toFixed(1)} MB, which means it is missing the app`);
  }
  log(`installer: ${path.relative(ROOT, outFile)} (${mb.toFixed(1)} MB)`);
  return outFile;
}

async function main() {
  const version = readVersion();
  const platform = arg("platform", process.platform);
  const arch = arg("arch", "x64");
  log(`WallRaven ${version} for ${platform}/${arch}`);

  stage(version);

  // --stage-only stops before downloading Electron. Useful for checking what
  // would ship without needing the network.
  if (process.argv.includes("--stage-only")) {
    const files = fs.readdirSync(STAGE_DIR).sort();
    log(`stage-only: ${files.length} entries would be packaged`);
    for (const f of files) log(`  ${f}`);
    return;
  }

  await pack(version, platform, arch);

  if (platform === "win32") {
    buildInstaller(version);
  } else {
    log("not Windows, skipping the installer step");
  }

  // The staged copy is throwaway; electron/app is what the installer consumes.
  fs.rmSync(STAGE_DIR, { recursive: true, force: true });
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  log("done");
}

main().catch((err) => {
  console.error(`[build] failed: ${err.message}`);
  process.exit(1);
});
