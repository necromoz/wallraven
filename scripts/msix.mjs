// Turning the packaged app into a Microsoft Store (MSIX) package.
//
// Why bother, when there is already an NSIS installer: the installer is
// unsigned, so every person who downloads it meets a SmartScreen warning
// telling them WallRaven is untrusted, and the only ways to remove that are a
// code-signing certificate (money, yearly) or the Store (free, and Microsoft
// signs the package itself). The Store also handles updates, which is why the
// app's own updater switches itself off in a Store build -- see
// electron/packaging.cjs.
//
// This module is the part that can be reasoned about without Windows: it
// renders and validates the manifest. The packing itself needs makeappx.exe
// from the Windows SDK and happens in build-desktop.mjs.

import fs from "node:fs";
import path from "node:path";

// Obvious placeholders. A package built with these installs and runs locally
// but can never be uploaded, which is the intended failure: an accidental
// submission with the wrong identity is worse than a build that stops.
export const PLACEHOLDER_IDENTITY = {
  identityName: "WallRaven.Unreserved",
  publisher: "CN=WallRaven Development",
  publisherDisplayName: "WallRaven (unreserved)",
};

export function isPlaceholderIdentity(identity) {
  return (
    identity.identityName === PLACEHOLDER_IDENTITY.identityName ||
    identity.publisher === PLACEHOLDER_IDENTITY.publisher
  );
}

// Partner Center hands out an Identity Name, a Publisher (an X.500 name) and a
// Publisher Display Name. All three have to match the reservation character
// for character, so the build reads them from the environment and refuses
// anything that is obviously not one of them rather than discovering it at
// upload time.
export function identityFromEnv(env) {
  const e = env || {};
  const identityName = String(e.MSIX_IDENTITY_NAME || "").trim();
  const publisher = String(e.MSIX_PUBLISHER || "").trim();
  const publisherDisplayName = String(e.MSIX_PUBLISHER_DISPLAY_NAME || "").trim();
  if (!identityName && !publisher && !publisherDisplayName) return { ...PLACEHOLDER_IDENTITY };
  return {
    identityName: identityName || PLACEHOLDER_IDENTITY.identityName,
    publisher: publisher || PLACEHOLDER_IDENTITY.publisher,
    publisherDisplayName: publisherDisplayName || PLACEHOLDER_IDENTITY.publisherDisplayName,
  };
}

// MSIX versions are four numbers. The Store additionally requires the last one
// to be 0 -- it reserves the revision field for itself -- so a three-part
// semantic version maps to major.minor.patch.0 and a prerelease suffix has
// nowhere to go and is rejected rather than quietly dropped.
export function msixVersion(version) {
  const v = String(version || "").trim();
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (!m) {
    throw new Error(
      `cannot express "${v}" as an MSIX version: it must be major.minor.patch with no suffix`,
    );
  }
  for (const part of [m[1], m[2], m[3]]) {
    if (Number(part) > 65535) throw new Error(`version part ${part} is above the 65535 MSIX limit`);
  }
  return `${m[1]}.${m[2]}.${m[3]}.0`;
}

export function validateIdentity(identity) {
  const problems = [];
  // Partner Center's own rule for the package identity name.
  if (!/^[A-Za-z0-9][A-Za-z0-9.-]{1,49}$/.test(identity.identityName)) {
    problems.push(`identity name "${identity.identityName}" is not a valid package name`);
  }
  // The publisher is an X.500 distinguished name; Partner Center always shows
  // it beginning with CN=.
  if (!/^CN=/.test(identity.publisher)) {
    problems.push(`publisher "${identity.publisher}" does not start with CN=`);
  }
  if (!identity.publisherDisplayName) problems.push("publisher display name is empty");
  return problems;
}

// XML escaping for the three values that come from outside. A publisher
// display name is free text and people do have ampersands in their names.
function xmlEscape(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
}

export function renderManifest(template, { identity, version }) {
  const problems = validateIdentity(identity);
  if (problems.length)
    throw new Error(`MSIX identity is not usable:\n  - ${problems.join("\n  - ")}`);

  const values = {
    IDENTITY_NAME: identity.identityName,
    PUBLISHER: identity.publisher,
    PUBLISHER_DISPLAY_NAME: identity.publisherDisplayName,
    VERSION: msixVersion(version),
  };

  const out = template.replace(/\{\{([A-Z_]+)\}\}/g, (whole, key) => {
    if (!(key in values))
      throw new Error(`the manifest template asks for ${key}, which the build does not have`);
    return xmlEscape(values[key]);
  });

  const left = out.match(/\{\{[A-Z_]+\}\}/g);
  if (left) throw new Error(`manifest still contains placeholders: ${left.join(", ")}`);
  return out;
}

// Every image the manifest names has to exist, at exactly the size its name
// claims, or the package fails Store certification with a message that does
// not say which file.
export const REQUIRED_ASSETS = [
  ["Square44x44Logo.png", 44, 44],
  ["Square150x150Logo.png", 150, 150],
  ["Square310x310Logo.png", 310, 310],
  ["Wide310x150Logo.png", 310, 150],
  ["StoreLogo.png", 50, 50],
];

// Reads just enough of a PNG header to get its dimensions. Avoids a dependency
// for a check this simple.
export function pngSize(file) {
  const fd = fs.openSync(file, "r");
  try {
    const head = Buffer.alloc(24);
    fs.readSync(fd, head, 0, 24, 0);
    if (head.toString("ascii", 1, 4) !== "PNG")
      throw new Error(`${path.basename(file)} is not a PNG`);
    return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
  } finally {
    fs.closeSync(fd);
  }
}

export function checkAssets(dir) {
  const problems = [];
  for (const [name, width, height] of REQUIRED_ASSETS) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) {
      problems.push(`${name} is missing`);
      continue;
    }
    let size;
    try {
      size = pngSize(file);
    } catch (e) {
      problems.push(e.message);
      continue;
    }
    if (size.width !== width || size.height !== height) {
      problems.push(`${name} is ${size.width}x${size.height}, expected ${width}x${height}`);
    }
  }
  return problems;
}
