import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { approvePairing, getPairingInfo } from "@/lib/pairing.functions";

export const Route = createFileRoute("/link")({
  ssr: false,
  validateSearch: z.object({ pair: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Link the app — WallRaven" },
      { name: "description", content: "Connect the Wallraven desktop app to your WallRaven account." },
      { property: "og:title", content: "Link the app — WallRaven" },
      { property: "og:description", content: "Connect the Wallraven desktop app to your WallRaven account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LinkPage,
});

type State = "checking" | "ready" | "linking" | "done" | "error";

function LinkPage() {
  const { pair } = Route.useSearch();
  const navigate = useNavigate();
  const [state, setState] = useState<State>("checking");
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      if (!pair) {
        setError("No pairing code was supplied. Start again from the Wallraven app.");
        setState("error");
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate({ to: "/auth", search: { pair } as never });
        return;
      }
      try {
        const info = await getPairingInfo({ data: { code: pair } });
        if (info.status === "pending") {
          setDeviceName(info.deviceName ?? null);
          setState("ready");
        } else if (info.status === "expired") {
          setError("That pairing request expired. Start again from the Wallraven app.");
          setState("error");
        } else if (info.status === "already_approved") {
          setError("That pairing request was already used.");
          setState("error");
        } else {
          setError("That pairing request could not be found.");
          setState("error");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not check the pairing request.");
        setState("error");
      }
    })();
  }, [pair, navigate]);

  async function onApprove() {
    if (!pair) return;
    setState("linking");
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) throw new Error("Your session expired. Please sign in again.");
      await approvePairing({
        data: {
          code: pair,
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at ?? undefined,
        },
      });
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not link the app.");
      setState("error");
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center py-8 text-foreground">
      <main className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Link the Wallraven app</h1>

        {state === "checking" && (
          <p className="mt-4 text-sm text-muted-foreground">Checking the pairing request…</p>
        )}

        {state === "ready" && (
          <>
            <p className="mt-4 text-sm text-muted-foreground">
              {deviceName ? `"${deviceName}" wants` : "The Wallraven desktop app wants"} to sign in to your account and sync
              your settings, presets and playlists.
            </p>
            <button
              onClick={onApprove}
              className="mt-6 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Link this device
            </button>
          </>
        )}

        {state === "linking" && <p className="mt-4 text-sm text-muted-foreground">Linking…</p>}

        {state === "done" && (
          <p className="mt-4 text-sm text-muted-foreground">
            Wallraven is now linked. You can close this tab and go back to the app.
          </p>
        )}

        {state === "error" && (
          <>
            <p className="mt-4 text-sm text-destructive">{error}</p>
            <a href="/account" className="mt-6 inline-block text-xs underline text-muted-foreground">
              Go to your account
            </a>
          </>
        )}
      </main>
    </div>
  );
}
