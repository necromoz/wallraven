// How this copy of WallRaven was installed.
//
// The NSIS installer and the Microsoft Store need opposite behaviour from the
// updater. An MSIX package is installed into C:\Program Files\WindowsApps,
// which is owned by the system and not writable by the app; the Store, not the
// app, decides when a new version lands. Running our own NSIS installer from
// inside a Store install would either fail outright or leave the machine with
// two WallRavens, one of which the Store keeps trying to service.
//
// So a Store build must never download, install or even advertise an update of
// its own. This module answers the single question the updater needs, in one
// place, so that answer can be tested without an Electron process.

// Electron sets process.windowsStore to true when the app is running from an
// AppX/MSIX package. That is the authoritative signal.
//
// The path check behind it is deliberate belt-and-braces: if a future Electron
// changes or drops that property, an app running out of WindowsApps is still
// unmistakably a Store install, and the safe failure here is to suppress the
// self-updater, not to run it.
//
// WALLRAVEN_STORE_BUILD exists so the Store behaviour can be exercised from a
// normal build before a package exists. It can only ever turn the updater off,
// which is why honouring an environment variable is safe here.
function isStoreBuild(proc) {
  const p = proc || process;
  if (p.windowsStore === true) return true;
  const env = p.env || {};
  const flag = String(env.WALLRAVEN_STORE_BUILD || "")
    .trim()
    .toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes") return true;
  const exe = String(p.execPath || "");
  if (/[\\/]WindowsApps[\\/]/i.test(exe)) return true;
  return false;
}

// What the Updates card says instead of the update controls. Kept here so the
// main process and the renderer cannot drift into saying different things.
const STORE_UPDATE_MESSAGE =
  "This copy came from the Microsoft Store, so the Store keeps it up to date. " +
  "WallRaven will not download or install updates itself.";

module.exports = { isStoreBuild, STORE_UPDATE_MESSAGE };
