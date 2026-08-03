import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  ArrowRight,
  MapPin,
  Users,
  Sparkles,
  ShieldCheck,
  Zap,
  Heart,
  Clock3,
  Route as RouteIcon,
  Wallet,
  CheckCircle2,
  Lock,
  Star,
  Info,
  Car,
  Plane,
  Bus,
  TrendingUp,
  Map,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { TripSearchProvider, TripSearchForm, TripSearchResults } from "@/components/TripSearch";
import { DynamicTrendingRoutes } from "@/components/DynamicTrendingRoutes";
import { HeroCarousel } from "@/components/HeroCarousel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Carpooling in Bangalore | Ride Sharing, Shared Cabs & Intercity Carpool Booking | Coolpool" },
      {
        name: "description",
        content:
          "Coolpool connects travelers with trusted carpool and ride-sharing options across India for daily commutes, airport transfers, and intercity travel.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      <SiteHeader />

      <HeroCarousel />

      {/* SEARCH BAR - OVERLAPPING */}
      <section className="relative z-20 -mt-16 sm:-mt-28 md:-mt-32 px-4 sm:px-5 container mx-auto max-w-6xl">
        <TripSearchProvider>
          <TripSearchForm variant="landing" id="find-a-ride" />
          <div className="mt-6">
            <TripSearchResults variant="landing" />
          </div>
        </TripSearchProvider>
      </section>

      {/* TRENDING ROUTES (DYNAMIC) */}
      <DynamicTrendingRoutes />

      {/* TRUST STRIP */}
      <section className="bg-primary/5 border-y border-primary/10">
        <div className="container mx-auto px-4 sm:px-5 py-8 max-w-7xl">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center divide-y sm:divide-y-0 sm:divide-x divide-primary/10">
            {[
              { icon: <ShieldCheck className="h-6 w-6" />, label: "100% Verified Profiles" },
              { icon: <Map className="h-6 w-6" />, label: "Dynamic Segment Pricing" },
              { icon: <Wallet className="h-6 w-6" />, label: "Secure Digital Payments" },
            ].map((item, i) => (
              <div
                key={i}
                className="flex flex-col items-center justify-center pt-6 sm:pt-0 first:pt-0"
              >
                <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
                  {item.icon}
                </div>
                <h4 className="font-bold text-base tracking-wide">{item.label}</h4>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="container mx-auto px-4 sm:px-5 py-16 sm:py-24 max-w-7xl">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight font-heading">
            A smarter way to <span className="text-gradient-primary">Travel Together</span>
          </h2>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              icon: <MapPin className="h-8 w-8" />,
              title: "Search your route",
              text: "Choose pickup, drop, date, and seats. We show rides passing close to both points on route.",
            },
            {
              icon: <Users className="h-8 w-8" />,
              title: "Book just the seats you need",
              text: "Pick your segment and seats. Price is calculated from route distance and host's current rate.",
            },
            {
              icon: <Heart className="h-8 w-8" />,
              title: "Ride and rate",
              text: "Track upcoming trips, meet at pickup points, and rate hosts to keep the network reliable.",
            },
          ].map((step, i) => (
            <Card
              key={i}
              className="p-8 rounded-3xl border-border/60 shadow-soft hover:shadow-card hover:border-primary/30 transition-all group bg-card"
            >
              <div className="h-16 w-16 mb-6 rounded-3xl bg-gradient-primary text-primary-foreground flex items-center justify-center shadow-glow group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
                {step.icon}
              </div>
              <h3 className="text-xl font-bold mb-3">{step.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{step.text}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* VALUE FOR BOTH ROLES */}
      <section className="container mx-auto px-4 sm:px-5 pb-16 sm:pb-24 max-w-7xl">
        <div className="grid gap-6 md:grid-cols-2">
          <RoleCard
            icon={<Clock3 className="h-10 w-10 text-primary" />}
            title="For Travelers"
            text="Reach intercity destinations with route-matched rides, transparent segment pricing, and easy repeat booking."
            bullets={[
              "Book by segment, not full route",
              "Save passenger details for quick checkout",
              "View upcoming rides in one place",
            ]}
            ctaHref="/#find-a-ride"
            ctaLabel="Find a ride"
            emphasis="soft"
          />
          <RoleCard
            icon={<Zap className="h-10 w-10 text-primary" />}
            title="For Ride Hosts"
            text="Post your trip once, add intermediate stops, and fill spare seats without manual pricing calculations."
            bullets={[
              "Set total trip price, system derives per km rate",
              "Manage bookings and pickups from dashboard",
              "Update future pricing while preserving old bookings",
            ]}
            ctaTo="/host"
            ctaLabel="Host a ride"
            emphasis="default"
          />
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="bg-gradient-hero py-16 sm:py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-mesh opacity-40 pointer-events-none" />
        <div className="container mx-auto px-4 sm:px-5 max-w-7xl relative z-10">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold font-heading">
              Trusted by <span className="text-gradient-primary">thousands</span>
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                name: "Rahul S.",
                role: "Regular Traveler",
                text: "The segment booking is a lifesaver. I saved 50% on my commute from Bengaluru to Tumakuru compared to a cab.",
                rating: 5,
              },
              {
                name: "Ananya M.",
                role: "Host",
                text: "Hosting on Coolpool has helped me cover my fuel costs and I've met some amazing people on my weekend trips home.",
                rating: 5,
              },
              {
                name: "Vikram K.",
                role: "Tech Professional",
                text: "Clean, reliable, and way more comfortable than the bus. The app is super intuitive to use.",
                rating: 4,
              },
            ].map((t, i) => (
              <Card
                key={i}
                className="p-8 border-border/40 rounded-3xl bg-card/80 backdrop-blur-md shadow-card hover:-translate-y-1 transition-transform"
              >
                <div className="flex gap-1 mb-6">
                  {[...Array(t.rating)].map((_, j) => (
                    <Star key={j} className="h-4 w-4 fill-primary text-primary" />
                  ))}
                </div>
                <p className="text-lg mb-8 leading-relaxed text-foreground/90">"{t.text}"</p>
                <div className="mt-auto border-t border-border/60 pt-4">
                  <p className="font-bold">{t.name}</p>
                  <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">
                    {t.role}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ SECTION */}
      <section className="container mx-auto px-4 sm:px-5 py-16 sm:py-24 max-w-3xl">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold font-heading">
            Frequently Asked <span className="text-primary">Questions</span>
          </h2>
        </div>
        <Accordion type="single" collapsible className="w-full">
          {[
            {
              q: "How is the price calculated?",
              a: "Prices are calculated based on the distance of your specific segment (pickup to drop) and the host's per-kilometer rate.",
            },
            {
              q: "Is it safe to travel with strangers?",
              a: "Yes, we verify all users via official IDs. Our rating system ensures high community standards, and you can share your live trip status.",
            },
            {
              q: "Can I cancel my booking?",
              a: "At this time, we do not offer cancellations or refunds for confirmed bookings. Please review your trip details carefully before booking, as all reservations are currently final.",
            },
            {
              q: "What if the host cancels?",
              a: "If a host cancels, you receive a 100% refund immediately, and we notify you of alternative rides on the same route.",
            },
          ].map((faq, i) => (
            <AccordionItem key={i} value={`item-${i}`} className="border-border/60">
              <AccordionTrigger className="text-left font-bold text-lg hover:text-primary transition-colors py-5">
                {faq.q}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground text-base leading-relaxed pb-5">
                {faq.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* FINAL CTA */}
      <section className="container mx-auto px-4 sm:px-5 pb-16 sm:pb-24 max-w-7xl">
        <Card className="rounded-3xl border-0 p-8 sm:p-12 md:p-20 bg-gradient-hero relative overflow-hidden text-center shadow-glow">
          <div className="absolute inset-0 bg-gradient-mesh opacity-20 pointer-events-none" />
          <div className="relative max-w-3xl mx-auto space-y-8">
            <h3 className="text-3xl sm:text-4xl md:text-6xl font-bold tracking-tight text-balance leading-tight font-heading">
              Ready to <span className="text-gradient-primary">start your journey?</span>
            </h3>
            <p className="text-lg sm:text-xl text-muted-foreground leading-relaxed">
              Join thousands of people saving money and making new friends on the road.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                asChild
                variant="hero"
                size="xl"
                className="rounded-3xl px-12 h-14 text-lg shadow-glow"
              >
                <a href="#find-a-ride">
                  Find a Ride <ArrowRight />
                </a>
              </Button>
              <Button
                asChild
                variant="outline"
                size="xl"
                className="rounded-3xl px-12 h-14 text-lg bg-card/50 backdrop-blur-sm hover:bg-card"
              >
                <Link to="/host">Host a Ride</Link>
              </Button>
            </div>
          </div>
        </Card>
      </section>

      <SiteFooter />
    </div>
  );
}

function RoleCard({
  icon,
  title,
  text,
  bullets,
  ctaTo,
  ctaHref,
  ctaLabel,
  emphasis,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  bullets: string[];
  ctaTo?: "/host";
  ctaHref?: string;
  ctaLabel: string;
  emphasis: "soft" | "default";
}) {
  return (
    <Card
      className={`p-8 md:p-10 rounded-3xl border-border/60 overflow-hidden relative min-w-0 ${
        emphasis === "soft" ? "bg-gradient-soft shadow-soft" : "bg-card shadow-sm"
      }`}
    >
      <div className="absolute -right-12 -top-12 h-40 w-40 rounded-3xl bg-primary-glow/20 blur-3xl pointer-events-none" />
      <div className="relative">
        <div className="mb-6">{icon}</div>
        <h3 className="text-2xl md:text-3xl font-bold font-heading">{title}</h3>
        <p className="mt-3 text-muted-foreground leading-relaxed">{text}</p>
        <ul className="mt-6 space-y-3">
          {bullets.map((bullet) => (
            <li
              key={bullet}
              className="flex items-start gap-3 text-sm text-foreground/90 font-medium"
            >
              <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
        <Button
          asChild
          variant={emphasis === "soft" ? "hero" : "outline"}
          size="lg"
          className="mt-8 w-full sm:w-auto justify-center rounded-3xl shadow-sm"
        >
          {ctaHref ? (
            <a href={ctaHref}>
              {ctaLabel} <ArrowRight className="h-4 w-4 ml-2" />
            </a>
          ) : (
            <Link to={ctaTo!}>
              {ctaLabel} <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          )}
        </Button>
      </div>
    </Card>
  );
}
