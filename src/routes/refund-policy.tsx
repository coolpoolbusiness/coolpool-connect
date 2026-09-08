import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/refund-policy")({
  component: RefundPolicyPage,
});

function RefundPolicyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50/50">
      <SiteHeader />
      <main className="container mx-auto px-4 pt-28 sm:pt-32 pb-24 sm:pb-20 max-w-4xl flex-1">
        <div className="bg-white rounded-3xl p-8 sm:p-12 shadow-soft border border-border/50">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
            Refund & Cancellation Policy
          </h1>
          <p className="text-sm text-muted-foreground mb-8">
            Last updated: 8 September 2026
          </p>

          <div className="space-y-8 text-slate-600 leading-relaxed">
            <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-800">
              <h2 className="text-lg font-bold mb-1">
                Important Rule: No Refunds After Confirmation
              </h2>
              <p className="text-sm">
                Once a seat booking is confirmed and payment is completed,{" "}
                <strong>we do not offer any refunds</strong>. Please review your travel details,
                pickup location, and driver information carefully before completing your
                reservation.
              </p>
            </div>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">1. Cancellation Edge Cases</h2>
              <p>
                While our general policy is strictly no refunds after confirmation, exceptions are
                made only under the following specific edge cases:
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>The ride host (driver) cancels the trip entirely.</li>
                <li>
                  The ride host fails to show up at the designated pickup location at the
                  agreed-upon time.
                </li>
                <li>
                  Significant safety concerns are reported and verified prior to the start of the
                  journey.
                </li>
              </ul>
              <p className="mt-2">
                In such valid edge cases, users must report the issue to our support team within 12
                hours of the scheduled departure time to be eligible for a refund review.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">
                2. Failed Transaction Handling
              </h2>
              <p>
                If your payment attempt fails but the amount is debited from your bank account, the
                transaction is considered incomplete by our Razorpay gateway. In such instances, the
                debited amount will automatically bounce back to your original payment method. You
                will need to initiate a new booking on the Coolpool platform.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">
                3. Duplicate Payment Handling
              </h2>
              <p>
                In the rare event of a duplicate payment processing error for a single seat
                reservation, our system will identify the anomaly. We will process a full refund for
                the duplicate charge upon user notification and internal verification.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">
                4. Refund Timelines (Platform Issues)
              </h2>
              <p>
                If a refund is approved due to a platform issue or a valid cancellation edge case,
                it will be processed through our payment gateway, Razorpay. The credited amount will
                reflect in your original payment method within 5-7 business days, depending on your
                bank's processing timelines.
              </p>
            </section>

            <section className="pt-6 border-t border-border/60">
              <h2 className="text-xl font-bold text-slate-900 mb-3">Contact Support</h2>
              <p>
                For payment disputes or cancellation issues, please reach out immediately:
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
