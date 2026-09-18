import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { approvePairing, getPairingInfo } from "@/lib/pairing.functions";
import { USER_CODE_LENGTH, normaliseUserCode } from "@/lib/pairing-codes";

// The page that links a desktop app to an account.
//
// This page used to read a pairing code out of the URL and offer a single
// button that handed over the visitor's access and refresh tokens. Anyone who
// could get a signed-in person to open a link could take their account, because
// nothing on the page distinguished a real request from a forged one.
//
// Now the person types the code shown on the device that is asking. The code
// is deliberately NOT accepted from the query string, even as a convenience:
// prefilling it would restore the original attack in full, since the victim
// would once again be approving something chosen by whoever sent the link.
//
// An older app version may still arrive here with ?pair= in the URL. That is
// treated as a prompt to update, not as a code.

export const Route = createFileRoute("/link")({
  ssr: false,
  validateSearch: z.object({ pair: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Link the app — WallRaven" },
      {
        name: "description",
        content: "Connect the Wallraven desktop app to your WallRaven account.",
      },
      { property: "og:title", content: "Link the app — WallRaven" },
      {
        property: "og:description",
        content: "Connect the Wallraven desktop app to your WallRaven account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LinkPage,
});

type State = "checking" | "entry" | "confirm" | "linking" | "done";

export function LinkPage() {
  const { pair } = Route.useSearch();
  const navigate = useNavigate();
  const [state, setState] = useState<State>("checking");
  const [code, setCode] = useState("");
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [legacy, setLegacy] = useState(false);
  const checkedAuth = useRef(false);

  useEffect(() => {
    if (checkedAuth.current) return;
    checkedAuth.current = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        // link=1 so that signing in comes back here rather than to the account page.
        navigate({ to: "/auth", search: { link: "1" } as never });
        return;
      }
      // A code in the URL means an app old enough to use the flow that is being
      // replaced. Say so plainly rather than silently doing nothing.
      if (pair) setLegacy(true);
      setState("entry");
    })();
  }, [pair, navigate]);

  async function onCheckCode(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const normalised = normaliseUserCode(code);
    if (!normalised) {
      setError(`Enter the ${USER_CODE_LENGTH}-character code shown in the app.`);
      return;
    }

    setState("checking");
    try {
      const info = await getPairingInfo({ data: { code: normalised } });
      if (info.status === "pending") {
        setDeviceName(info.deviceName ?? null);
        setState("confirm");
      } else if (info.status === "expired") {
        setError("That code has expired. Start again from the app to get a new one.");
        setState("entry");
      } else if (info.status === "already_approved") {
        setError("That code has already been used.");
        setState("entry");
      } else if (info.status === "rate_limited") {
        setError("Too many attempts. Wait a few minutes and try again.");
        setState("entry");
      } else {
        setError("That code is not valid. Check it and try again.");
        setState("entry");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check that code.");
      setState("entry");
    }
  }

  async function onApprove() {
    setState("linking");
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) throw new Error("Your session expired. Please sign in again.");
      await approvePairing({
        data: {
          code: normaliseUserCode(code),
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at ?? undefined,
        },
      });
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not link the app.");
      setState("entry");
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center py-8 text-foreground">
      <main className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Link the Wallraven app</h1>

        {legacy && state !== "done" && (
          <p className="mt-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Your copy of WallRaven is out of date and cannot link this way any more. Update it, then
            start again. The app will show you a code to type in below.
          </p>
        )}

        {state === "checking" && <p className="mt-4 text-sm text-muted-foreground">Checking…</p>}

        {state === "entry" && (
          <form onSubmit={onCheckCode} className="mt-6">
            <label htmlFor="pair-code" className="block text-sm text-muted-foreground">
              Type the code shown in the Wallraven app on your PC.
            </label>
            <input
              id="pair-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              placeholder="XXXX-XXXX"
              aria-describedby={error ? "pair-error" : undefined}
              className="mt-3 w-full rounded-md border border-input bg-background px-4 py-3 text-center font-mono text-xl tracking-[0.3em] uppercase outline-none focus:ring-2 focus:ring-ring"
            />
            {error && (
              <p id="pair-error" className="mt-3 text-sm text-destructive">
                {error}
              </p>
            )}
            <button
              type="submit"
              className="mt-4 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Continue
            </button>
            <p className="mt-4 text-xs text-muted-foreground">
              Only type a code you are reading off your own screen. If you did not just start this
              from the app, close this page.
            </p>
          </form>
        )}

        {state === "confirm" && (
          <>
            <p className="mt-4 text-sm text-muted-foreground">
              This will sign {deviceName ? `"${deviceName}"` : "the Wallraven desktop app"} in to
              your account and let it sync your settings, presets and playlists.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              The device name is what the app calls itself and is not verified.
            </p>
            <button
              onClick={onApprove}
              className="mt-6 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Link this device
            </button>
            <button
              onClick={() => {
                setState("entry");
                setCode("");
              }}
              className="mt-3 w-full text-xs underline text-muted-foreground"
            >
              Cancel
            </button>
          </>
        )}

        {state === "linking" && <p className="mt-4 text-sm text-muted-foreground">Linking…</p>}

        {state === "done" && (
          <p className="mt-4 text-sm text-muted-foreground">
            Wallraven is now linked. You can close this tab and go back to the app.
          </p>
        )}
      </main>
    </div>
  );
}
