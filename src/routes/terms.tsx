import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50/50">
      <SiteHeader />
      <main className="container mx-auto px-4 pt-28 sm:pt-32 pb-24 sm:pb-20 max-w-4xl flex-1">
        <div className="bg-white rounded-3xl p-8 sm:p-12 shadow-soft border border-border/50">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">Terms & Conditions</h1>
          <p className="text-sm text-muted-foreground mb-8">
            Last updated: 8 September 2026
          </p>

          <div className="space-y-8 text-slate-600 leading-relaxed">
            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">1. Platform Disclaimer</h2>
              <p>
                Coolpool does not provide transportation services, employ drivers, or operate as a taxi or cab service. All ride arrangements and interactions are solely between the driver and passenger, who are fully responsible for their own actions, safety, and compliance with applicable laws. Coolpool shall not be held liable for any disputes, accidents, losses, damages, injuries, or incidents arising from the use of the platform. In the event of any dispute, emergency, or unlawful activity, users should immediately contact the nearest police station or relevant authorities. Coolpool's responsibility is limited solely to the operation of the platform and the collection of applicable platform fees.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">2. User Responsibilities</h2>
              <p>
                All users must provide accurate and verifiable information during registration. You
                are responsible for maintaining the confidentiality of your account credentials and
                for all activities that occur under your account.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">
                3. Driver & Passenger Conduct
              </h2>
              <p>
                Users are expected to treat each other with respect. Drivers must hold a valid
                driver's license, necessary vehicle insurance, and maintain their vehicle in a safe,
                roadworthy condition. Passengers must be punctual and follow any reasonable
                guidelines set by the driver for the shared journey.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">4. Prohibited Activities</h2>
              <p>The following activities are strictly prohibited on Coolpool:</p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>Using the platform to operate a commercial taxi service.</li>
                <li>Transporting illegal goods, substances, or engaging in unlawful behavior.</li>
                <li>Creating fake accounts or engaging in fraudulent bookings.</li>
                <li>Harassment, discrimination, or abusive behavior toward any user.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">
                5. Booking Rules & Ride Availability
              </h2>
              <p>
                Seat reservations must be made through the Coolpool platform. We do not guarantee
                ride availability for any specific route or time. Rides are subject to driver
                schedules and vehicle capacity.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">6. Pricing & Payment Terms</h2>
              <p>
                Pricing is determined dynamically or set by the driver to cover the cost of the
                commute. We may charge a convenience or platform fee for facilitating the booking.
                All payments must be completed securely through our integrated Razorpay payment
                gateway. Off-platform payments are not protected by Coolpool.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">
                7. Account Suspension Rights
              </h2>
              <p>
                Coolpool reserves the right to suspend or permanently ban any account that violates
                these Terms & Conditions, receives consistent negative ratings, or poses a risk to
                the safety and trust of our community.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">8. Liability Limitations</h2>
              <p>
                As a commute coordination platform, Coolpool is not liable for any direct, indirect,
                incidental, or consequential damages arising from your use of the service. We do not
                guarantee the condition of the vehicles, the behavior of the users, or the timely
                completion of any journey.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">9. Dispute Handling</h2>
              <p>
                Any disputes arising between users should be reported to our support team. We will
                attempt to mediate the issue fairly. Legal disputes with Coolpool shall be governed
                by the applicable laws of India.
              </p>
            </section>

            <section className="pt-6 border-t border-border/60">
              <h2 className="text-xl font-bold text-slate-900 mb-3">Contact Us</h2>
              <p>
                If you have questions regarding these terms, please contact us:
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
