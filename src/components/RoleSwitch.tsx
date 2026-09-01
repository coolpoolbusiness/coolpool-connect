import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const LAST_MODE_KEY = "coolpool:lastMode";

type Mode = "host" | "passenger";

/** True when the given path belongs to the host (or admin) experience. */
function pathIsHost(pathname: string): boolean {
  return pathname.startsWith("/driver") || pathname.startsWith("/admin");
}

/**
 * Host / Passenger segmented toggle. Lets a host flip between their dashboard
 * and the rider experience in one tap. Only shown to users who actually have a
 * host side (driver/admin); plain passengers keep the "Host dashboard" CTA.
 *
 * The active side is derived from the current route — the URL is the source of
 * truth, so there's no separate state to keep in sync.
 */
export function RoleSwitch({ className }: { className?: string }) {
  const { isDriver, isAdmin } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (!isDriver && !isAdmin) return null;

  const current: Mode = pathIsHost(pathname) ? "host" : "passenger";

  const go = (mode: Mode) => {
    if (mode === current) return;
    try {
      localStorage.setItem(LAST_MODE_KEY, mode);
    } catch {
      // Storage can be unavailable (private mode) — switching still works.
    }
    void navigate({ to: mode === "host" ? "/driver/dashboard" : "/" });
  };

  return (
    <div
      role="tablist"
      aria-label="Switch role"
      className={cn(
        "inline-flex items-center rounded-full bg-muted/70 p-1 shadow-inner",
        className,
      )}
    >
      {(["host", "passenger"] as const).map((mode) => {
        const active = current === mode;
        return (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => go(mode)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-semibold transition-all duration-200",
              active
                ? "bg-background text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {mode === "host" ? "Host" : "Guest"}
          </button>
        );
      })}
    </div>
  );
}

/** The mode the user last used, for choosing where to land after login. */
export function getLastMode(): Mode | null {
  try {
    const v = localStorage.getItem(LAST_MODE_KEY);
    return v === "host" || v === "passenger" ? v : null;
  } catch {
    return null;
  }
}
