import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { CreditCard, ShieldCheck, Banknote, IndianRupee } from "lucide-react";

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
});

function PricingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50/50">
      <SiteHeader />
      <main className="container mx-auto px-4 pt-28 sm:pt-32 pb-24 sm:pb-20 max-w-4xl flex-1">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">Pricing & Payments</h1>
          <p className="text-lg text-muted-foreground">
            Transparent pricing for your intercity commutes. Fair for drivers, affordable for
            passengers.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-16">
          <div className="bg-white rounded-3xl p-8 shadow-soft border border-border/50">
            <div className="h-12 w-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-6">
              <Banknote size={24} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3">Driver-Set Ride Pricing</h3>
            <p className="text-slate-600 leading-relaxed">
              As a ride coordination platform, the base cost of a seat reservation is determined by
              the ride host (driver). Prices are set to fairly share the cost of the commute, fuel,
              and tolls.
            </p>
          </div>

          <div className="bg-white rounded-3xl p-8 shadow-soft border border-border/50">
            <div className="h-12 w-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center mb-6">
              <ShieldCheck size={24} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3">Secure Razorpay Payments</h3>
            <p className="text-slate-600 leading-relaxed">
              All seat reservation payments are processed securely through Razorpay. We support UPI,
              credit/debit cards, and net banking to ensure a smooth, trust-verified transaction.
            </p>
          </div>

          <div className="bg-white rounded-3xl p-8 shadow-soft border border-border/50">
            <div className="h-12 w-12 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center mb-6">
              <IndianRupee size={24} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3">Platform & Convenience Fees</h3>
            <p className="text-slate-600 leading-relaxed">
              To maintain our platform, provide 24/7 support, and ensure secure infrastructure,
              Coolpool applies a flat <span className="font-bold text-slate-900">5% platform fee</span>,
              paid by the host out of each booking. Passengers pay only the fare the host sets — the
              fee is deducted from the host's earnings, never added on top.
            </p>
          </div>

          <div className="bg-white rounded-3xl p-8 shadow-soft border border-border/50">
            <div className="h-12 w-12 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center mb-6">
              <CreditCard size={24} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3">Dynamic Pricing Possibility</h3>
            <p className="text-slate-600 leading-relaxed">
              During high-demand seasons or specific long-distance routes, prices may vary
              dynamically based on availability. The final price is always displayed clearly before
              you confirm your booking.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-8 sm:p-10 shadow-soft border border-border/50">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">Taxes & Fees Disclaimer</h2>
          <p className="text-slate-600 leading-relaxed">
            All prices listed during the booking process are inclusive of applicable taxes,
            including GST, unless explicitly stated otherwise. The total breakdown of your seat
            reservation payment, including the base fare, convenience fee, and any applicable taxes,
            will be visible at checkout before processing via Razorpay.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
