// Tests for the Microsoft Store package manifest.
//
// Nothing here needs Windows: the expensive mistakes in MSIX packaging are
// made before makeappx runs. A wrong identity is only discovered at upload, a
// wrong version is accepted and then refused by the Store, and a logo that is
// one pixel off fails certification with a message that does not name the
// file. All three are checkable here.
//
// Run with: node electron/test/msix.test.mjs

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PLACEHOLDER_IDENTITY,
  checkAssets,
  identityFromEnv,
  isPlaceholderIdentity,
  msixVersion,
  renderManifest,
  validateIdentity,
} from "../../scripts/msix.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");

let passed = 0;
let failed = 0;

function check(label, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    console.error(`FAIL  ${label}`);
    console.error(`      ${err.message}`);
  }
}

console.log("msix version");

check("a three-part version gains the revision the Store reserves", () => {
  assert.strictEqual(msixVersion("1.1.0"), "1.1.0.0");
  assert.strictEqual(msixVersion("0.8.13"), "0.8.13.0");
});

check("a prerelease version is refused rather than truncated", () => {
  // 1.2.0-beta.1 and 1.2.0 would both become 1.2.0.0, and the Store would
  // reject the second upload as a version it already has.
  assert.throws(() => msixVersion("1.2.0-beta.1"), /MSIX version/);
  assert.throws(() => msixVersion("1.2"), /MSIX version/);
  assert.throws(() => msixVersion(""), /MSIX version/);
});

check("a version part above the field limit is refused", () => {
  assert.throws(() => msixVersion("1.70000.0"), /65535/);
});

console.log("identity");

check("no environment at all means placeholders, not a broken manifest", () => {
  const id = identityFromEnv({});
  assert.deepStrictEqual(id, PLACEHOLDER_IDENTITY);
  assert.ok(isPlaceholderIdentity(id));
});

check("real values are taken verbatim", () => {
  const id = identityFromEnv({
    MSIX_IDENTITY_NAME: "12345Steve.WallRaven",
    MSIX_PUBLISHER: "CN=AB12CD34-0000-0000-0000-000000000000",
    MSIX_PUBLISHER_DISPLAY_NAME: "Steve Shaw",
  });
  assert.strictEqual(id.identityName, "12345Steve.WallRaven");
  assert.strictEqual(id.publisher, "CN=AB12CD34-0000-0000-0000-000000000000");
  assert.ok(!isPlaceholderIdentity(id));
  assert.deepStrictEqual(validateIdentity(id), []);
});

check("surrounding whitespace is trimmed", () => {
  // Pasting these out of Partner Center brings a trailing space more often
  // than not, and the Store compares them exactly.
  const id = identityFromEnv({
    MSIX_IDENTITY_NAME: "  12345Steve.WallRaven \n",
    MSIX_PUBLISHER: " CN=Steve ",
    MSIX_PUBLISHER_DISPLAY_NAME: " Steve ",
  });
  assert.strictEqual(id.identityName, "12345Steve.WallRaven");
  assert.strictEqual(id.publisher, "CN=Steve");
  assert.strictEqual(id.publisherDisplayName, "Steve");
});

check("a publisher that is not an X.500 name is caught", () => {
  const problems = validateIdentity({
    identityName: "WallRaven",
    publisher: "Steve Shaw",
    publisherDisplayName: "Steve",
  });
  assert.strictEqual(problems.length, 1);
  assert.ok(/CN=/.test(problems[0]));
});

check("an identity name with a space is caught", () => {
  const problems = validateIdentity({
    identityName: "Wall Raven",
    publisher: "CN=Steve",
    publisherDisplayName: "Steve",
  });
  assert.ok(problems.some((p) => /package name/.test(p)));
});

console.log("manifest");

const template = fs.readFileSync(path.join(ROOT, "electron", "msix", "AppxManifest.template.xml"), "utf8");

check("every placeholder in the template is one the build can fill", () => {
  const xml = renderManifest(template, {
    identity: {
      identityName: "12345Steve.WallRaven",
      publisher: "CN=AB12CD34-0000-0000-0000-000000000000",
      publisherDisplayName: "Steve Shaw",
    },
    version: "1.1.0",
  });
  assert.ok(!/\{\{/.test(xml), "placeholders left in the rendered manifest");
  assert.ok(xml.includes('Name="12345Steve.WallRaven"'));
  assert.ok(xml.includes('Version="1.1.0.0"'));
});

check("a publisher display name with an ampersand does not break the XML", () => {
  const xml = renderManifest(template, {
    identity: {
      identityName: "WallRaven",
      publisher: "CN=Steve",
      publisherDisplayName: "Shaw & Sons",
    },
    version: "1.1.0",
  });
  assert.ok(xml.includes("Shaw &amp; Sons"));
  assert.ok(!/Shaw & Sons/.test(xml));
});

check("the manifest points at the executable the packager actually produces", () => {
  // build-desktop.mjs names it Wallraven.exe and the installer agrees. A
  // mismatch here produces a package that installs and then does nothing.
  assert.ok(template.includes('Executable="app\\Wallraven.exe"'));
  const build = fs.readFileSync(path.join(ROOT, "scripts", "build-desktop.mjs"), "utf8");
  assert.ok(/const EXECUTABLE_NAME = "Wallraven";/.test(build));
});

check("start-up is declared as a task Windows controls, off by default", () => {
  assert.ok(/windows\.startupTask/.test(template));
  assert.ok(/Enabled="false"/.test(template), "installing would add itself to start-up unasked");
});

check("full trust is declared", () => {
  assert.ok(/rescap:Capability Name="runFullTrust"/.test(template));
});

console.log("assets");

check("every logo the manifest names exists at the right size", () => {
  const problems = checkAssets(path.join(ROOT, "electron", "msix", "assets"));
  assert.deepStrictEqual(problems, []);
});

check("a missing asset is reported by name", () => {
  const problems = checkAssets(path.join(ROOT, "electron"));
  assert.ok(problems.length >= 5);
  assert.ok(problems.every((p) => /is missing/.test(p)));
});

check("the manifest only names logos that exist", () => {
  const named = [...template.matchAll(/assets\\([A-Za-z0-9.-]+\.png)/g)].map((m) => m[1]);
  assert.ok(named.length >= 4);
  for (const name of new Set(named)) {
    assert.ok(
      fs.existsSync(path.join(ROOT, "electron", "msix", "assets", name)),
      `${name} is named in the manifest but not present`,
    );
  }
});

console.log("");
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
