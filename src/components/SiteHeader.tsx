import { Link, useRouterState } from "@tanstack/react-router";
import logo from "@/assets/logo.png";
import { useQuery } from "@tanstack/react-query";
import {
  type LucideIcon,
  LogOut,
  User as UserIcon,
  LayoutDashboard,
  Shield,
  Ticket,
  Home,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { countUnreadMessages } from "@/data/appwrite-repository";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { memberPortalLinkSearch } from "@/lib/travelerResumeRedirect";
import { getUserDisplayName, getUserInitial } from "@/lib/user-display";
import { RoleSwitch } from "@/components/RoleSwitch";

function BottomTab({
  to,
  icon: Icon,
  label,
  active,
  search,
  badge = 0,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
  search?: Record<string, unknown>;
  badge?: number;
}) {
  return (
    <Link
      to={to as never}
      search={search as never}
      className={`relative flex flex-1 flex-col items-center justify-center gap-1 transition-transform active:scale-95 ${
        active ? "text-primary" : "text-muted-foreground"
      }`}
    >
      <span className="relative">
        <Icon className="h-5 w-5" />
        {badge > 0 && (
          <span className="absolute -right-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-bold leading-none text-white">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      <span className="text-[10px] font-semibold">{label}</span>
    </Link>
  );
}

export function SiteHeader() {
  const { user, isDriver, isAdmin, signOut } = useAuth();
  const memberSearch = useRouterState({
    select: (r) => {
      const search = memberPortalLinkSearch(r.location.href);
      return { redirect: search.redirect, google_auth: undefined as undefined };
    },
  });
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const dashboardPath = isAdmin ? "/admin/dashboard" : isDriver ? "/driver/dashboard" : null;

  // Unread message count for the Inbox tab badge (cheap, refreshed periodically).
  const { data: unread = 0 } = useQuery({
    queryKey: ["unread-messages", user?.$id],
    queryFn: () => (user ? countUnreadMessages(user.$id) : Promise.resolve(0)),
    enabled: !!user,
    refetchInterval: 20000,
  });

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-50 px-4 pt-4 pointer-events-none">
        <header className="container mx-auto max-w-7xl h-20 rounded-full border border-white/20 bg-background/60 backdrop-blur-2xl shadow-glow-sm pointer-events-auto flex items-center justify-between gap-2 px-4 sm:px-8 transition-all duration-500 hover:shadow-glow-md">
          <Link
            to="/"
            className="flex items-center gap-3 group shrink-0 transition-transform duration-300 hover:scale-[1.02]"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full group-hover:bg-primary/40 transition-colors" />
              <img
                src={logo}
                alt="Coolpool"
                className="h-12 md:h-16 w-auto object-contain relative z-10"
              />
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-2">
            {/* Host / Passenger switch — only renders for hosts */}
            <RoleSwitch className="mr-1" />

            {/* My trips — always shown; routes to traveler login when signed out */}
            <Button asChild variant="ghost" className="rounded-3xl">
              {user ? (
                <Link to="/trips">
                  <Ticket className="h-4 w-4 mr-2" />
                  My trips
                </Link>
              ) : (
                <Link to="/members" search={memberSearch}>
                  <Ticket className="h-4 w-4 mr-2" />
                  My trips
                </Link>
              )}
            </Button>

            {/* Inbox — parity with the mobile bottom-nav tab (with unread badge) */}
            {user && (
              <Button asChild variant="ghost" className="rounded-3xl relative">
                <Link to="/inbox">
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Inbox
                  {unread > 0 && (
                    <span className="ml-1 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </Link>
              </Button>
            )}

            {/* Dashboard — hidden for members; routes to host login when signed out */}
            {!user ? (
              <Button asChild variant="hero" className="rounded-3xl">
                <Link to="/auth">
                  <LayoutDashboard className="h-4 w-4 mr-2" />
                  Host dashboard
                </Link>
              </Button>
            ) : dashboardPath ? (
              <Button asChild variant="hero" className="rounded-3xl">
                <Link to={dashboardPath}>
                  <LayoutDashboard className="h-4 w-4 mr-2" />
                  {isAdmin ? "Admin" : "Host dashboard"}
                </Link>
              </Button>
            ) : null}

            {user ? (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="rounded-3xl h-10 px-4 gap-2">
                      <div className="h-7 w-7 rounded-3xl bg-gradient-primary flex items-center justify-center text-xs font-bold text-primary-foreground">
                        {getUserInitial(user)}
                      </div>
                      <span className="text-sm max-w-[120px] truncate">
                        {getUserDisplayName(user)}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 rounded-3xl">
                    <DropdownMenuLabel className="font-normal space-y-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {getUserDisplayName(user)}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to="/profile" className="cursor-pointer">
                        <UserIcon className="h-4 w-4 mr-2" /> My profile
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/trips" className="cursor-pointer">
                        <UserIcon className="h-4 w-4 mr-2" /> My trips
                      </Link>
                    </DropdownMenuItem>
                    {isDriver && (
                      <DropdownMenuItem asChild>
                        <Link to="/driver/dashboard" className="cursor-pointer">
                          <LayoutDashboard className="h-4 w-4 mr-2" /> Ride Host dashboard
                        </Link>
                      </DropdownMenuItem>
                    )}
                    {isAdmin && (
                      <DropdownMenuItem asChild>
                        <Link to="/admin/dashboard" className="cursor-pointer">
                          <Shield className="h-4 w-4 mr-2" /> Admin
                        </Link>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={signOut} className="cursor-pointer text-destructive">
                      <LogOut className="h-4 w-4 mr-2" /> Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <Button asChild variant="ghost" className="rounded-3xl">
                <Link to="/auth">Login</Link>
              </Button>
            )}
          </div>

          {/* Mobile: Host/Guest toggle + account (nav lives in the bottom bar) */}
          <div className="flex items-center gap-2 md:hidden">
            {(isDriver || isAdmin) && <RoleSwitch />}
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label="Account"
                    className="h-10 w-10 rounded-full bg-gradient-primary flex items-center justify-center text-sm font-bold text-white shrink-0"
                  >
                    {getUserInitial(user)}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 rounded-3xl">
                  <DropdownMenuLabel className="font-normal space-y-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {getUserDisplayName(user)}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/profile" className="cursor-pointer">
                      <UserIcon className="h-4 w-4 mr-2" /> My profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut} className="cursor-pointer text-destructive">
                    <LogOut className="h-4 w-4 mr-2" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button asChild variant="ghost" className="rounded-3xl h-10 px-4">
                <Link to="/auth">Login</Link>
              </Button>
            )}
          </div>
        </header>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-[60] border-t border-border/40 bg-background/95 backdrop-blur-xl pb-safe">
        <div className="flex h-16 items-stretch justify-around">
          <BottomTab to="/" icon={Home} label="Home" active={pathname === "/"} />
          {user ? (
            <BottomTab
              to="/trips"
              icon={Ticket}
              label="My trips"
              active={pathname.startsWith("/trips")}
            />
          ) : (
            <BottomTab
              to="/members"
              search={memberSearch}
              icon={Ticket}
              label="My trips"
              active={pathname.startsWith("/members")}
            />
          )}
          {user ? (
            <BottomTab
              to="/inbox"
              icon={MessageCircle}
              label="Inbox"
              active={pathname.startsWith("/inbox")}
              badge={unread}
            />
          ) : (
            <BottomTab
              to="/members"
              search={memberSearch}
              icon={MessageCircle}
              label="Inbox"
              active={pathname.startsWith("/inbox")}
            />
          )}
          {user ? (
            <BottomTab
              to="/profile"
              icon={UserIcon}
              label="Profile"
              active={pathname.startsWith("/profile")}
            />
          ) : (
            <BottomTab to="/auth" icon={UserIcon} label="Login" active={false} />
          )}
        </div>
      </nav>
    </>
  );
}
