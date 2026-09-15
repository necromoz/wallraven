import { Link } from "@tanstack/react-router";
import { History, Home, Image as ImageIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import iconUrl from "@/assets/wallraven-icon.png";
import { supabase } from "@/integrations/supabase/client";

const SIDE_NAV = [
  { to: "/", label: "Home", icon: Home },
  { to: "/presets", label: "Presets", icon: ImageIcon },
  { to: "/changelog", label: "What's new", icon: History },
] as const;

export function SiteShell({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active) setSignedIn(Boolean(data.user));
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setSignedIn(Boolean(session?.user));
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return (
    <div className="aurora grid-veil relative min-h-screen overflow-x-clip bg-background text-foreground">
      <div
        aria-hidden
        className="drift pointer-events-none absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-primary/12 blur-[120px]"
      />
      <div className="relative z-10 mx-auto flex w-full max-w-[92rem] gap-6 px-4 sm:px-6">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col py-6 lg:flex">
          <Link to="/" className="flex items-center gap-2.5 px-3">
            <img src={iconUrl} alt="" width={36} height={36} className="h-9 w-9 rounded-[10px]" />
            <span className="font-display text-lg font-semibold tracking-tight">WallRaven</span>
          </Link>
          <nav className="mt-8 flex flex-col gap-1" aria-label="Main navigation">
            {SIDE_NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === "/" }}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[status=active]:bg-accent data-[status=active]:text-foreground"
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
          <span className="mt-auto px-3 text-xs text-muted-foreground/70">v0.8.13</span>
        </aside>

        <div className="min-w-0 flex-1 pb-20">
          <header className="py-5">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <Link to="/" className="flex min-w-0 items-center gap-2.5 lg:hidden">
                <img src={iconUrl} alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded-[9px]" />
                <span className="truncate font-display text-base font-semibold tracking-tight">WallRaven</span>
              </Link>
              <Link
                to={signedIn ? "/account" : "/auth"}
                className="prism-btn glow-ring col-start-2 inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition-transform hover:-translate-y-0.5"
              >
                {signedIn ? "Account" : "Sign in"}
              </Link>
            </div>
            <nav className="mt-3 grid grid-cols-3 gap-1 rounded-xl border border-border bg-card/45 p-1 text-center text-xs lg:hidden" aria-label="Mobile navigation">
              {SIDE_NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: item.to === "/" }}
                  className="min-w-0 truncate rounded-lg px-2 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[status=active]:bg-accent data-[status=active]:text-foreground"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </header>
          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </div>
  );
}