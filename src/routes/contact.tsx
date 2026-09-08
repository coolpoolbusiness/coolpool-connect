import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Mail, Phone, MapPin, Clock, Send, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/contact")({
  component: ContactPage,
});

const SUPPORT_EMAIL = "info@coolpool.in";

function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // No backend yet — compose an email in the user's mail app (honest + works
    // everywhere). Server-side handling can replace this later.
    const subject = encodeURIComponent(`[Coolpool] ${form.subject || "Support"} — ${form.name}`);
    const body = encodeURIComponent(
      `Name: ${form.name}\nEmail: ${form.email}\nTopic: ${form.subject}\n\n${form.message}`,
    );
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
    setSent(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/50">
      <SiteHeader />
      <main className="container mx-auto px-4 pt-28 sm:pt-32 pb-24 sm:pb-20 max-w-6xl flex-1">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">Get in Touch</h1>
          <p className="text-lg text-muted-foreground">
            Whether you have a question about a ride, payment, or our platform, our support team is
            here to help you across South India.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-10">
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-3xl p-6 shadow-soft border border-border/50 flex items-start gap-4">
              <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Phone size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 mb-1">Phone Support</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  Call us for urgent booking issues.
                </p>
                <a href="tel:+917795909909" className="text-primary font-medium hover:underline">
                  +91 77959 09909
                </a>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-soft border border-border/50 flex items-start gap-4">
              <div className="h-10 w-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                <Mail size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 mb-1">Email Support</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  For general inquiries and feedback.
                </p>
                <a
                  href="mailto:info@coolpool.in"
                  className="text-blue-600 font-medium hover:underline"
                >
                  info@coolpool.in
                </a>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-soft border border-border/50 flex items-start gap-4">
              <div className="h-10 w-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                <MapPin size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 mb-1">Service Regions</h3>
                <p className="text-sm text-muted-foreground">
                  Operating across major cities in{" "}
                  <strong className="text-slate-800">South India</strong> and{" "}
                  <strong className="text-slate-800">Goa</strong>.
                </p>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-soft border border-border/50 flex items-start gap-4">
              <div className="h-10 w-10 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                <Clock size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 mb-1">Support Availability</h3>
                <p className="text-sm text-muted-foreground">
                  Our customer support team is available Monday to Saturday, 10:00 AM to 7:00 PM IST.
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="bg-white rounded-3xl p-8 sm:p-10 shadow-soft border border-border/50 h-full">
              <h2 className="text-2xl font-bold mb-6">Send us a message</h2>
              {sent && (
                <div className="mb-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <p className="text-sm text-emerald-800">
                    Your email app should have opened with the message ready to send. If it didn't,
                    write to us directly at{" "}
                    <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold underline">
                      {SUPPORT_EMAIL}
                    </a>
                    .
                  </p>
                </div>
              )}
              <form className="space-y-6" onSubmit={handleSubmit}>
                <div className="grid sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label htmlFor="name" className="text-sm font-medium text-slate-700">
                      Full Name
                    </label>
                    <input
                      type="text"
                      id="name"
                      required
                      value={form.name}
                      onChange={set("name")}
                      className="w-full flex h-12 rounded-xl border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder="John Doe"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-medium text-slate-700">
                      Email Address
                    </label>
                    <input
                      type="email"
                      id="email"
                      required
                      value={form.email}
                      onChange={set("email")}
                      className="w-full flex h-12 rounded-xl border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder="john@example.com"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="subject" className="text-sm font-medium text-slate-700">
                    Subject
                  </label>
                  <select
                    id="subject"
                    required
                    value={form.subject}
                    onChange={set("subject")}
                    className="w-full flex h-12 rounded-xl border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">Select a topic</option>
                    <option value="booking">Ride Booking Issue</option>
                    <option value="payment">Payment & Refund</option>
                    <option value="host">Become a Ride Host</option>
                    <option value="other">Other Inquiry</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="message" className="text-sm font-medium text-slate-700">
                    Message
                  </label>
                  <textarea
                    id="message"
                    rows={5}
                    required
                    value={form.message}
                    onChange={set("message")}
                    className="w-full flex min-h-[120px] rounded-xl border border-input bg-transparent px-3 py-3 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                    placeholder="How can we help you?"
                  ></textarea>
                </div>

                <Button type="submit" className="w-full sm:w-auto px-8" size="lg">
                  Send Message
                  <Send className="ml-2 h-4 w-4" />
                </Button>
              </form>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
