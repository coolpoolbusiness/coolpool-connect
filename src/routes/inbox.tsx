import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { listMyThreads } from "@/data/appwrite-repository";
import { MessageThreadDrawer, type ThreadParams } from "@/components/MessageThreadDrawer";

export const Route = createFileRoute("/inbox")({
  component: InboxPage,
});

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!then) return "";
  const s = Math.floor((Date.now() - then) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function InboxPage() {
  const { user, authLoading } = useAuth();
  const [active, setActive] = useState<ThreadParams | null>(null);

  const { data: threads = [], isLoading } = useQuery({
    queryKey: ["my-threads", user?.$id],
    queryFn: () => (user ? listMyThreads(user.$id) : Promise.resolve([])),
    enabled: !!user,
    refetchInterval: 10000,
  });

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/50">
      <SiteHeader />
      <main className="container mx-auto px-4 pt-28 pb-10 max-w-2xl flex-1 sm:pt-32">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-primary text-white shadow-glow">
            <MessageCircle size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">Messages</h1>
            <p className="text-sm text-muted-foreground">Chat with your host or guests.</p>
          </div>
        </div>

        {!user && !authLoading ? (
          <div className="rounded-3xl border border-border/60 bg-white/80 p-10 text-center shadow-card">
            <p className="mb-4 text-base text-muted-foreground">Sign in to see your messages.</p>
            <Button asChild variant="hero" className="rounded-3xl">
              <Link to="/members">Sign in</Link>
            </Button>
          </div>
        ) : isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-3xl bg-gray-100" />
            ))}
          </div>
        ) : threads.length === 0 ? (
          <div className="rounded-3xl border border-border/60 bg-white/80 p-10 text-center shadow-card">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
              <MessageCircle size={26} />
            </div>
            <p className="text-lg font-bold text-gray-900">No messages yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Once you book a ride, you can message your host here to coordinate pickup.
            </p>
            <Button asChild variant="hero" className="mt-5 rounded-3xl">
              <Link to="/">Find a ride</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {threads.map((t) => (
              <button
                key={t.threadId}
                type="button"
                onClick={() =>
                  setActive({
                    tripId: t.tripId,
                    hostUserId: t.hostUserId,
                    guestUserId: t.guestUserId,
                    otherName: t.otherName,
                    tripRoute: t.tripRoute,
                  })
                }
                className="flex w-full items-center gap-3 rounded-3xl border border-gray-100 bg-white p-4 text-left shadow-sm transition hover:border-primary/30 active:scale-[0.99]"
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-primary text-sm font-bold text-white">
                  {(t.otherName || "?").charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-bold text-gray-900">{t.otherName}</p>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {timeAgo(t.lastAt)}
                    </span>
                  </div>
                  {t.tripRoute && (
                    <p className="truncate text-xs font-medium text-primary/80">{t.tripRoute}</p>
                  )}
                  <p className="truncate text-sm text-muted-foreground">{t.lastBody}</p>
                </div>
                {t.unread > 0 && (
                  <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-white">
                    {t.unread}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </main>
      <SiteFooter />

      <MessageThreadDrawer open={!!active} onClose={() => setActive(null)} thread={active} />
    </div>
  );
}
