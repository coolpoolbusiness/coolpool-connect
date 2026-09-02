import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { message } from "antd";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  User,
  IdCard,
  Camera,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getMyMemberVerification } from "@/data/appwrite-repository";
import { SelfieVerificationCard } from "@/components/SelfieVerificationCard";
import { AadhaarVerificationCard } from "@/components/AadhaarVerificationCard";
import { PanVerificationCard } from "@/components/PanVerificationCard";
import { DrivingLicenceVerificationCard } from "@/components/DrivingLicenceVerificationCard";

const STEPS: { key: string; title: string; subtitle: string; icon: LucideIcon }[] = [
  { key: "details", title: "Your details", subtitle: "How travellers reach you", icon: User },
  { key: "licence", title: "Driving licence", subtitle: "Your licence number", icon: IdCard },
  { key: "selfie", title: "Add a selfie", subtitle: "Get the verified badge", icon: Camera },
  { key: "identity", title: "Verify your identity", subtitle: "Any one — instant, no uploads", icon: ShieldCheck },
  { key: "finish", title: "You're all set", subtitle: "Finish to start hosting", icon: Sparkles },
];

const inputCls =
  "w-full rounded-2xl border border-gray-200 bg-white px-5 h-14 text-lg text-gray-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-base font-semibold text-gray-900">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      {children}
      {hint && <p className="mt-2 text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SummaryRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      {ok ? (
        <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white">
          <Check size={13} />
        </span>
      ) : (
        <span className="h-5 w-5 rounded-full border-2 border-emerald-300" />
      )}
      <span className={ok ? "font-medium text-emerald-900" : "text-emerald-700/70"}>{label}</span>
    </div>
  );
}

/**
 * Guided, responsive host-onboarding wizard. Collects the profile fields
 * (phone/city/licence) and walks the host through the new auto-verification
 * (selfie + Aadhaar/PAN/DigiLocker), one focused step at a time. On finish it
 * calls onSubmit with the profile fields (the dashboard creates the driver
 * profile + assigns the host role).
 */
export function HostOnboardingWizard({
  initialPhone = "",
  submitting = false,
  onSubmit,
}: {
  initialPhone?: string;
  submitting?: boolean;
  onSubmit: (data: { phone: string; city: string; licenseNumber: string }) => Promise<void> | void;
}) {
  const { user } = useAuth();
  const prefs = (user?.prefs ?? {}) as Record<string, any>;
  const [step, setStep] = useState(0);
  const [phone, setPhone] = useState(initialPhone);
  const [city, setCity] = useState("");
  const [licence, setLicence] = useState("");

  const { data: selfie } = useQuery({
    queryKey: ["my-verification", user?.$id],
    queryFn: () => (user ? getMyMemberVerification(user.$id) : Promise.resolve(null)),
    enabled: !!user,
  });
  const selfieDone = selfie?.status === "approved";
  const identityDone =
    prefs.aadhaarVerified === true || prefs.panVerified === true || prefs.dlVerified === true;

  const detailsOk = phone.trim().replace(/\D/g, "").length >= 8 && city.trim().length > 0;
  const licenceOk = licence.trim().length >= 4;

  const canNext = () => {
    if (step === 0) return detailsOk;
    if (step === 1) return licenceOk;
    return true; // selfie & identity steps: encouraged, not blocking (need real IDs)
  };

  const next = () => {
    if (!canNext()) {
      message.error("Please fill the required fields to continue.");
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const finish = async () => {
    if (!detailsOk || !licenceOk) {
      message.error("Please complete your details and licence number.");
      return;
    }
    await onSubmit({ phone: phone.trim(), city: city.trim(), licenseNumber: licence.trim() });
  };

  const cur = STEPS[step];
  const StepIcon = cur.icon;
  const pct = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="mx-auto w-full max-w-lg px-1">
      {/* Progress header */}
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-gradient-primary text-white shadow-glow">
          <StepIcon size={30} />
        </div>
        <p className="text-xs font-bold uppercase tracking-widest text-primary">
          Step {step + 1} of {STEPS.length}
        </p>
        <h2 className="mt-1 text-2xl font-bold text-gray-900">{cur.title}</h2>
        <p className="text-sm text-muted-foreground">{cur.subtitle}</p>
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-primary transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Step content */}
      <div key={step} className="min-h-[220px] animate-in fade-in slide-in-from-right-4 duration-300">
        {step === 0 && (
          <div className="space-y-5">
            <Field label="Phone number" required>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                placeholder="+91 98765 43210"
                className={inputCls}
              />
            </Field>
            <Field label="City" required>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Chennai"
                className={inputCls}
              />
            </Field>
          </div>
        )}

        {step === 1 && (
          <Field
            label="Driving licence number"
            required
            hint="Enter it exactly as printed on your licence."
          >
            <input
              value={licence}
              onChange={(e) => setLicence(e.target.value.toUpperCase())}
              placeholder="TN01 20150012345"
              className={`${inputCls} tracking-wide`}
            />
          </Field>
        )}

        {step === 2 && <SelfieVerificationCard />}

        {step === 3 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Choose <b>any one</b> — it's instant, no uploads.
            </p>
            <AadhaarVerificationCard />
            <PanVerificationCard />
            <DrivingLicenceVerificationCard />
          </div>
        )}

        {step === 4 && (
          <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-6 text-center">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-emerald-500 text-white">
              <CheckCircle2 size={28} />
            </div>
            <p className="text-lg font-bold text-emerald-900">Almost there!</p>
            <p className="text-sm text-emerald-700">
              Finish to save your profile, then add your car to start hosting.
            </p>
            <div className="mx-auto mt-5 w-fit space-y-2 text-left">
              <SummaryRow ok={detailsOk} label="Your details" />
              <SummaryRow ok={licenceOk} label="Driving licence" />
              <SummaryRow ok={!!selfieDone} label="Selfie" />
              <SummaryRow ok={identityDone} label="Identity verified" />
            </div>
            {(!selfieDone || !identityDone) && (
              <p className="mt-4 text-xs text-emerald-700/80">
                You can finish now and complete any remaining verification anytime from your
                dashboard.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="mt-7 flex items-center gap-3">
        {step > 0 && (
          <button
            type="button"
            onClick={back}
            className="flex h-14 items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 font-semibold text-gray-700 transition active:scale-95"
          >
            <ArrowLeft size={18} /> Back
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={next}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-primary font-bold text-white shadow-glow transition active:scale-[0.98]"
          >
            Continue <ArrowRight size={18} />
          </button>
        ) : (
          <button
            type="button"
            onClick={finish}
            disabled={submitting}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-primary font-bold text-white shadow-glow transition active:scale-[0.98] disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" /> Saving…
              </>
            ) : (
              "Finish & add my car"
            )}
          </button>
        )}
      </div>
    </div>
  );
}
