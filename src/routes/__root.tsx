import { useEffect } from "react";
import { Outlet, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AuthProvider } from "@/hooks/useAuth";
import { Toaster } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { registerServiceWorker } from "@/lib/notifications";
import { getSiteLockStatus } from "@/integrations/site-lock/site-lock-server";
import { SiteLockScreen } from "@/components/SiteLockScreen";

import appCss from "../styles.css?url";

const GOOGLE_FONTS_CSS =
  "https://fonts.googleapis.com/css2?family=Marcellus&family=Montaga&family=Lexend:wght@400;500;600;700&display=swap";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,  // 5 min — don't re-fetch until data is this old
      gcTime: 1000 * 60 * 30,    // 30 min — keep in memory so back-nav is instant
      retry: 1,
      refetchOnWindowFocus: false, // avoid re-fetch noise when user switches tabs
    },
  },
});

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-hero px-4">
      <div className="max-w-md text-center">
        <div className="text-8xl font-bold text-gradient-primary">404</div>
        <h2 className="mt-4 text-2xl font-semibold">Off the route</h2>
        <p className="mt-2 text-muted-foreground">
          This page doesn't exist on our map. Let's get you back on track.
        </p>
        <a
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-3xl bg-gradient-primary px-6 h-12 text-sm font-medium text-primary-foreground shadow-glow hover:opacity-95 transition-base"
        >
          Back to home
        </a>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  // Runs server-side on every fresh request (new tab, reload, crawler) so the
  // lockout is enforced before any page content is ever produced — not just
  // hidden client-side after the fact.
  loader: () => getSiteLockStatus(),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Coolpool — Smart intercity ride-sharing" },
      {
        name: "description",
        content:
          "Share rides between cities. Hosts post trips, travelers book the seats they need. Fair, dynamic, per-kilometer pricing.",
      },
      { name: "author", content: "Coolpool" },
      { property: "og:title", content: "Coolpool — Smart intercity ride-sharing" },
      {
        property: "og:description",
        content: "Share rides between cities with fair per-kilometer pricing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#7c3aed" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "Coolpool" },
      { name: "google-site-verification", content: "RsHmrg4BB-jzvMcOtzJKm28m-vZp1Mkj42WHPu5oV40" },
    ],
    links: [
      { rel: "manifest", href: "/manifest.json" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "preconnect", href: "https://maps.googleapis.com" },
      { rel: "dns-prefetch", href: "https://checkout.razorpay.com" },
      { rel: "stylesheet", href: GOOGLE_FONTS_CSS },
      { rel: "stylesheet", href: appCss },
    ],
        scripts: [
      {
        src: "https://www.googletagmanager.com/gtag/js?id=G-3ZY0L2DCSZ",
        async: true,
      },
      {
        children: `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-3ZY0L2DCSZ');
        `,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootGate() {
  const initialLock = Route.useLoaderData();
  // Polls so an already-open tab gets locked out within ~30s of the switch
  // being flipped, without needing the SSR loader (which only runs once per
  // fresh navigation) or a full page reload.
  const { data: lock } = useQuery({
    queryKey: ["site-lock-status"],
    queryFn: () => getSiteLockStatus(),
    initialData: initialLock,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  if (lock?.locked) {
    return <SiteLockScreen message={lock.message} />;
  }

  return (
    <AuthProvider>
      <Outlet />
      <Toaster />
    </AuthProvider>
  );
}

function RootComponent() {
  useEffect(() => {
    void registerServiceWorker();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <RootGate />
    </QueryClientProvider>
  );
}
