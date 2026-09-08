import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { Users, ShieldCheck, Map, Plane } from "lucide-react";

export const Route = createFileRoute("/about")({
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50/50">
      <SiteHeader />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="bg-gradient-hero pt-32 pb-20 px-4">
          <div className="container mx-auto max-w-4xl text-center">
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
              Redefining Intercity <span className="text-gradient-primary">Commute.</span>
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto">
              Coolpool is a South India ride-sharing platform helping travelers and commuters share
              rides affordably. We are on a mission to connect empty seats with people who need
              them.
            </p>
          </div>
        </section>

        {/* Content Section */}
        <section className="py-20 px-4">
          <div className="container mx-auto max-w-5xl">
            <div className="grid md:grid-cols-2 gap-12 md:gap-20 items-center">
              <div className="space-y-6">
                <h2 className="text-3xl font-bold text-slate-900">
                  Our Vision for Affordable Travel
                </h2>
                <p className="text-lg text-slate-600 leading-relaxed">
                  We believe that traveling between cities shouldn't break the bank. By coordinating
                  shared rides, we help commuters split costs effectively, reducing the financial
                  burden of intercity travel while also minimizing our carbon footprint.
                </p>
                <p className="text-lg text-slate-600 leading-relaxed">
                  Coolpool is not a taxi service. We are a community-driven commute platform
                  designed to make every journey collaborative and cost-effective.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-3xl shadow-soft border border-border/50">
                  <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                    <Map size={24} />
                  </div>
                  <h3 className="font-bold text-slate-900 mb-2">South India Focus</h3>
                  <p className="text-sm text-slate-600">
                    Building a robust network across major routes in South India and Goa.
                  </p>
                </div>
                <div className="bg-white p-6 rounded-3xl shadow-soft border border-border/50">
                  <div className="h-12 w-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center mb-4">
                    <Plane size={24} />
                  </div>
                  <h3 className="font-bold text-slate-900 mb-2">Airport Commutes</h3>
                  <p className="text-sm text-slate-600">
                    Optimizing long-distance airport transfers with shared rides to cut costs.
                  </p>
                </div>
                <div className="bg-white p-6 rounded-3xl shadow-soft border border-border/50">
                  <div className="h-12 w-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
                    <ShieldCheck size={24} />
                  </div>
                  <h3 className="font-bold text-slate-900 mb-2">Safety & Trust</h3>
                  <p className="text-sm text-slate-600">
                    Verified profiles and secure payment handling via Razorpay ensure peace of mind.
                  </p>
                </div>
                <div className="bg-white p-6 rounded-3xl shadow-soft border border-border/50">
                  <div className="h-12 w-12 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center mb-4">
                    <Users size={24} />
                  </div>
                  <h3 className="font-bold text-slate-900 mb-2">Community First</h3>
                  <p className="text-sm text-slate-600">
                    Connecting verified travelers for a friendly, respectful journey experience.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-16">
          <div className="rounded-3xl bg-gradient-primary px-6 py-12 text-center text-white shadow-glow">
            <h2 className="text-2xl sm:text-3xl font-bold">Ready to ride together?</h2>
            <p className="mx-auto mt-2 max-w-xl text-white/90">
              Find an intercity ride or offer your own — fair prices, verified people.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="rounded-2xl bg-white px-8 text-primary hover:bg-white/90">
                <Link to="/">Find a ride</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-2xl border-white/70 bg-transparent px-8 text-white hover:bg-white/10">
                <Link to="/host">Host a ride</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
