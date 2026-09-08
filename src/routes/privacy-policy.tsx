import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/privacy-policy")({
  component: PrivacyPolicyPage,
});

function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50/50">
      <SiteHeader />
      <main className="container mx-auto px-4 pt-28 sm:pt-32 pb-24 sm:pb-20 max-w-4xl flex-1">
        <div className="bg-white rounded-3xl p-8 sm:p-12 shadow-soft border border-border/50">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground mb-8">
            Last updated: 8 September 2026
          </p>

          <div className="space-y-8 text-slate-600 leading-relaxed">
            <p>
              Welcome to Coolpool, a South India ride-sharing platform helping travelers and
              commuters share rides affordably. We respect your privacy and are committed to
              protecting your personal data. This Privacy Policy explains how we collect, use, and
              safeguard your information when you use our commute platform.
            </p>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">1. Data Collection</h2>
              <p>
                When you create an account, we collect user account data including your name, email
                address, phone number, and profile details to facilitate ride coordination.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">2. Location & GPS Usage</h2>
              <p>
                We require access to your location data to optimize our ride-sharing platform. This
                includes real-time GPS usage for accurate pickups, drop-offs, and route tracking. We
                integrate with Google Maps to provide seamless navigation and distance estimation.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">3. Payment Processing</h2>
              <p>
                All financial transactions on Coolpool are handled securely through Razorpay. We do
                not store your full credit card or banking details on our servers. Razorpay
                processes your payment information in compliance with industry-standard security
                protocols.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">4. Cookies & Session Usage</h2>
              <p>
                We use cookies and similar tracking technologies to maintain session usage, remember
                your preferences, and analyze platform traffic. You can control cookie preferences
                through your browser settings.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">
                5. Communication Permissions
              </h2>
              <p>
                By using Coolpool, you consent to receive communications regarding your bookings,
                platform updates, and promotional offers. You may opt out of marketing
                communications at any time.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">
                6. Fraud Prevention & Data Protection
              </h2>
              <p>
                We employ advanced security measures and fraud prevention systems to protect your
                data. This includes verifying driver and passenger identities to ensure a safe
                community for all users across South India and Goa.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">7. Third-Party Integrations</h2>
              <p>
                Our service may include third-party integrations (such as mapping services, payment
                gateways, and communication tools) that help us deliver our ride coordination
                features. We ensure these partners comply with strict data protection standards.
              </p>
            </section>

            <section className="pt-6 border-t border-border/60">
              <h2 className="text-xl font-bold text-slate-900 mb-3">Contact Us</h2>
              <p>
                If you have questions about this Privacy Policy, please contact us at:
                <br />
                Email:{" "}
                <a href="mailto:info@coolpool.in" className="text-primary hover:underline">
                  info@coolpool.in
                </a>
                <br />
                Phone:{" "}
                <a href="tel:+917795909909" className="text-primary hover:underline">
                  +91 77959 09909
                </a>
              </p>
            </section>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
