import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Car, LogIn } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/host")({
  head: () => ({
    meta: [
      { title: "Host a ride — Coolpool" },
      {
        name: "description",
        content: "Post a trip, set your route and stops, and let Coolpool fill your empty seats.",
      },
    ],
  }),
  component: HostPage,
});

function HostPage() {
  const navigate = useNavigate();
  const { user, isDriver } = useAuth();

  useEffect(() => {
    if (user && isDriver) {
      navigate({ to: "/driver/dashboard" });
    }
  }, [user, isDriver, navigate]);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-hero">
      <SiteHeader />
      <main className="container mx-auto px-4 pt-28 sm:pt-32 pb-24 sm:pb-20 max-w-6xl flex-1">
        <div className="grid gap-12 lg:grid-cols-2 items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-3xl bg-primary/10 px-3 py-1 text-xs font-bold text-primary uppercase tracking-wider mb-6">
              <Car className="h-3.5 w-3.5" />
              For Professionals
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight">
              Turn your journey into <span className="text-gradient-primary">earnings.</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
              Join Coolpool's verified ride host network. Share your intercity route, help travelers
              reach their destination, and cover your trip costs with ease.
            </p>
            <div className="mt-10 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <Button asChild variant="hero" size="xl" className="px-8">
                <Link to="/auth">Get started as a host</Link>
              </Button>
              <span className="text-sm text-muted-foreground">
                Already a host?{" "}
                <Link to="/auth" className="font-semibold text-primary underline">
                  Log in
                </Link>
              </span>
            </div>
          </div>

          <div className="grid gap-6">
            <Card className="p-6 rounded-3xl border-none shadow-soft bg-white/80 backdrop-blur-md transition-base hover:shadow-card group">
              <div className="flex gap-4">
                <div className="h-12 w-12 rounded-3xl bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-white transition-all">
                  <Car size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Smart Onboarding</h3>
                  <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                    Set up your profile, verify your vehicle, and start hosting trips in under 5
                    minutes.
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-6 rounded-3xl border-none shadow-soft bg-white/80 backdrop-blur-md transition-base hover:shadow-card group">
              <div className="flex gap-4">
                <div className="h-12 w-12 rounded-3xl bg-purple-100 text-purple-600 flex items-center justify-center shrink-0 group-hover:bg-purple-600 group-hover:text-white transition-all">
                  <LogIn size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Ride Host Dashboard</h3>
                  <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                    One simple dashboard for your bookings, earnings, and pickups.
                  </p>
                </div>
              </div>
            </Card>

            <Button
              asChild
              variant="link"
              className="w-fit px-0 text-muted-foreground hover:text-primary"
            >
              <Link to="/" className="flex items-center gap-2">
                <ArrowLeft size={16} /> Back to home
              </Link>
            </Button>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
