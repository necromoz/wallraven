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
import {
  checkAssets,
  identityFromEnv,
  isPlaceholderIdentity,
  msixVersion,
  renderManifest,
} from "./msix.mjs";
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

// Windows version resources want four numbers. 1.3.1 becomes 1.3.1.0 and
// 1.3.1-beta.2 becomes 1.3.1.2; anything unparseable becomes 0.0.0.0 rather
// than failing the build.
export function numericVersion(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-[a-z]+\.?(\d+))?/i.exec(String(version || ""));
  return m ? `${m[1]}.${m[2]}.${m[3]}.${m[4] || 0}` : "0.0.0.0";
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
    // Product and company in the exe's properties. An executable with none is
    // one of the things Defender's reputation model holds against a new file.
    win32metadata: {
      CompanyName: "WallRaven",
      ProductName: "WallRaven",
      FileDescription: "WallRaven",
      InternalName: "WallRaven",
      OriginalFilename: `${EXECUTABLE_NAME}.exe`,
    },
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

const MSIX_DIR = path.join(ELECTRON_DIR, "msix");

function findMakeappx() {
  // makeappx.exe ships with the Windows SDK, which GitHub's windows runners
  // already have. Take the highest SDK version present rather than pinning
  // one, because the runner image changes without notice.
  const probe = spawnSync("makeappx", ["/?"], { encoding: "utf8" });
  if (!probe.error) return "makeappx";

  const roots = [
    "C:\\Program Files (x86)\\Windows Kits\\10\\bin",
    "C:\\Program Files\\Windows Kits\\10\\bin",
  ];
  const found = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root)) {
      const exe = path.join(root, entry, "x64", "makeappx.exe");
      if (fs.existsSync(exe)) found.push({ version: entry, exe });
    }
  }
  found.sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }));
  return found.length ? found[found.length - 1].exe : null;
}

// Build the Store package. Unsigned on purpose: the Store signs submissions
// with its own certificate, and a self-signed package would only be
// installable on machines that had been told to trust it.
function buildMsix(version) {
  // The Store reserves the fourth field of the version, so a prerelease has
  // nowhere to put its suffix and msixVersion refuses it. That is right for a
  // release and wrong as a reason to fail a beta build: the installer is the
  // point of a beta, and there is no Store channel to publish one to anyway.
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    log(
      `skipping the Store package: ${version} is a prerelease and the Store has nowhere to put the suffix`,
    );
    return null;
  }

  const identity = identityFromEnv(process.env);
  if (isPlaceholderIdentity(identity)) {
    log(
      "MSIX identity not set, using placeholders: this package can be installed locally but not submitted",
    );
  }

  const assetProblems = checkAssets(path.join(MSIX_DIR, "assets"));
  if (assetProblems.length) {
    throw new Error(`MSIX assets are wrong:\n  - ${assetProblems.join("\n  - ")}`);
  }

  const template = fs.readFileSync(path.join(MSIX_DIR, "AppxManifest.template.xml"), "utf8");
  const manifest = renderManifest(template, { identity, version });

  const stage = path.join(PKG_DIR, "msix");
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  fs.cpSync(APP_DIR, path.join(stage, "app"), { recursive: true });
  fs.cpSync(path.join(MSIX_DIR, "assets"), path.join(stage, "assets"), { recursive: true });
  fs.writeFileSync(path.join(stage, "AppxManifest.xml"), manifest);

  const makeappx = findMakeappx();
  if (!makeappx) {
    log("makeappx not found, skipping the MSIX step");
    log(
      `the staged package is at ${path.relative(ROOT, stage)}; install the Windows SDK to pack it`,
    );
    return null;
  }

  fs.mkdirSync(DIST_DIR, { recursive: true });
  const outFile = path.join(DIST_DIR, `WallRaven-${version}-x64.msix`);
  const res = spawnSync(makeappx, ["pack", "/d", stage, "/p", outFile, "/o"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (res.status !== 0) {
    console.error(res.stdout || "");
    console.error(res.stderr || "");
    throw new Error(`makeappx exited ${res.status}`);
  }

  const mb = fs.statSync(outFile).size / (1024 * 1024);
  if (mb < 20) throw new Error(`the MSIX is only ${mb.toFixed(1)} MB, so it is missing the app`);
  log(
    `msix: ${path.relative(ROOT, outFile)} (${mb.toFixed(1)} MB, version ${msixVersion(version)})`,
  );
  return outFile;
}

// NSIS takes /DNAME=value on Windows and -DNAME=value everywhere else, and it
// cross-compiles: a Windows installer can be built from Linux, which is how the
// beta was produced without a Windows machine in the loop.
const NSIS_FLAG = process.platform === "win32" ? "/" : "-";

function findMakensis() {
  for (const candidate of [
    "makensis",
    "C:\\Program Files (x86)\\NSIS\\makensis.exe",
    "C:\\Program Files\\NSIS\\makensis.exe",
  ]) {
    const probe = spawnSync(candidate, [`${NSIS_FLAG}VERSION`], { encoding: "utf8" });
    if (!probe.error && probe.status === 0) return candidate;
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
    [
      `${NSIS_FLAG}DOUTFILE=${outFile}`,
      `${NSIS_FLAG}DAPP_VERSION=${version}`,
      `${NSIS_FLAG}DAPP_VERSION_NUM=${numericVersion(version)}`,
      "installer.nsi",
    ],
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
    // Opt-in: the Store package is a second artifact from the same build, and
    // asking for it on every local build would mean needing the Windows SDK to
    // produce an installer.
    if (process.argv.includes("--msix")) buildMsix(version);
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
