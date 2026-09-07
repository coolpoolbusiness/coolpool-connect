import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Check,
  IdCard,
  Car,
  Landmark,
  Camera,
  Sparkles,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  getMyMemberVerification,
  getBankAccount,
  getVehicleByDriverUserId,
} from "@/data/appwrite-repository";
import { SelfieVerificationCard } from "@/components/SelfieVerificationCard";
import { IdentityVerificationPicker } from "@/components/IdentityVerificationPicker";

function DoneRow({ title, detail }: { title: string; detail?: string | null }) {
  return (
    <div className="flex items-center gap-3 rounded-3xl border border-emerald-100 bg-emerald-50 p-4">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-emerald-500 text-white">
        <Check size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-emerald-900">{title}</p>
        {detail && <p className="truncate text-sm text-emerald-700">{detail}</p>}
      </div>
      <span className="shrink-0 rounded-full bg-emerald-500 px-3 py-1 text-xs font-bold text-white">
        Verified
      </span>
    </div>
  );
}

function SetupRow({
  icon,
  title,
  detail,
  cta,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  cta: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-3xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-gray-900">{title}</p>
        <p className="truncate text-sm text-muted-foreground">{detail}</p>
      </div>
      <Link
        to="/driver/dashboard"
        className="shrink-0 rounded-2xl bg-gradient-primary px-4 py-2 text-sm font-bold text-white shadow-glow"
      >
        {cta}
      </Link>
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
 * Guided "Get Verified" wizard — walks through the verification journey one
 * focused step at a time (selfie → identity → car → payout → done), mirroring
 * the host-onboarding wizard. Each step shows its own card, or a green "done"
 * row once complete; a summary closes it out.
 */
export function GetVerifiedChecklist({ className = "" }: { className?: string }) {
  const { user } = useAuth();
  const prefs = (user?.prefs ?? {}) as Record<string, any>;
  const [step, setStep] = useState(0);

  const { data: selfie } = useQuery({
    queryKey: ["my-verification", user?.$id],
    queryFn: () => (user ? getMyMemberVerification(user.$id) : Promise.resolve(null)),
    enabled: !!user,
  });
  const { data: bank } = useQuery({
    queryKey: ["bank-account", user?.$id],
    queryFn: () => (user ? getBankAccount(user.$id) : Promise.resolve(null)),
    enabled: !!user,
  });
  const { data: vehicle } = useQuery({
    queryKey: ["my-vehicle", user?.$id],
    queryFn: () => (user ? getVehicleByDriverUserId(user.$id) : Promise.resolve(null)),
    enabled: !!user,
  });

  if (!user) return null;

  const selfieDone = selfie?.status === "approved";
  const idMethod = prefs.aadhaarVerified
    ? "Aadhaar"
    : prefs.panVerified
      ? "PAN"
      : prefs.dlVerified
        ? "Driving licence"
        : null;
  const identityDone = !!idMethod;
  const idName = prefs.aadhaarName || prefs.panName || prefs.dlName || null;
  const carDone = !!vehicle;
  const bankDone = prefs.bankVerified === true || !!bank;
  const doneCount = [selfieDone, identityDone, carDone, bankDone].filter(Boolean).length;
  const allDone = doneCount === 4;

  const STEPS: { key: string; title: string; subtitle: string; icon: LucideIcon }[] = [
    { key: "selfie", title: "Add a selfie", subtitle: "Get your verified badge", icon: Camera },
    { key: "identity", title: "Verify your identity", subtitle: "Any one — instant, no uploads", icon: IdCard },
    { key: "car", title: "Add your car", subtitle: "Only needed to offer rides", icon: Car },
    { key: "payout", title: "Payout account", subtitle: "Only needed to offer rides", icon: Landmark },
    { key: "done", title: "All set", subtitle: "Your verification summary", icon: Sparkles },
  ];

  const cur = STEPS[step];
  const StepIcon = cur.icon;
  const pct = ((step + 1) / STEPS.length) * 100;
  const back = () => setStep((s) => Math.max(0, s - 1));
  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));

  return (
    <div className={`mx-auto w-full max-w-lg ${className}`}>
      {/* Progress header */}
      <div className="mb-4 text-center">
        <div className="mx-auto mb-2.5 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-primary text-white shadow-glow">
          <StepIcon size={24} />
        </div>
        <p className="text-xs font-bold uppercase tracking-widest text-primary">
          Step {step + 1} of {STEPS.length}
        </p>
        <h2 className="mt-0.5 text-xl font-bold text-gray-900">{cur.title}</h2>
        <p className="text-sm text-muted-foreground">{cur.subtitle}</p>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-primary transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs font-semibold text-muted-foreground">{doneCount} of 4 done</p>
      </div>

      {/* Step content */}
      <div key={step} className="min-h-0 animate-in fade-in slide-in-from-right-4 duration-300">
        {step === 0 &&
          (selfieDone ? <DoneRow title="Selfie" detail="Your photo is verified" /> : <SelfieVerificationCard />)}

        {step === 1 &&
          (identityDone ? (
            <DoneRow title="Identity verified" detail={`${idMethod}${idName ? ` · ${idName}` : ""}`} />
          ) : (
            <IdentityVerificationPicker />
          ))}

        {step === 2 &&
          (carDone ? (
            <DoneRow
              title="Your car"
              detail={[vehicle?.modelName, vehicle?.plateNumber].filter(Boolean).join(" · ")}
            />
          ) : (
            <SetupRow icon={<Car size={18} />} title="Add your car" detail="Plate, model & seats" cta="Add car" />
          ))}

        {step === 3 &&
          (bankDone ? (
            <DoneRow
              title="Bank / UPI"
              detail={
                prefs.bankName || (bank ? `••••${bank.accountNumber.slice(-4)}` : "Payout account added")
              }
            />
          ) : (
            <SetupRow
              icon={<Landmark size={18} />}
              title="Add bank / UPI"
              detail="Where your earnings are sent"
              cta="Add bank"
            />
          ))}

        {step === 4 && (
          <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-6 text-center">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-emerald-500 text-white">
              <CheckCircle2 size={28} />
            </div>
            <p className="text-lg font-bold text-emerald-900">
              {allDone ? "You're fully verified! 🎉" : "Almost there!"}
            </p>
            <p className="text-sm text-emerald-700">
              {allDone
                ? "Everything's done — you're ready to travel and host."
                : "Finish the remaining steps anytime to unlock hosting."}
            </p>
            <div className="mx-auto mt-5 w-fit space-y-2 text-left">
              <SummaryRow ok={!!selfieDone} label="Selfie" />
              <SummaryRow ok={identityDone} label="Identity verified" />
              <SummaryRow ok={carDone} label="Car added" />
              <SummaryRow ok={bankDone} label="Payout account" />
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="mt-5 flex items-center gap-3">
        {step > 0 && (
          <button
            type="button"
            onClick={back}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 font-semibold text-gray-700 transition active:scale-95"
          >
            <ArrowLeft size={18} /> Back
          </button>
        )}
        {step < STEPS.length - 1 && (
          <button
            type="button"
            onClick={next}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-primary font-bold text-white shadow-glow transition active:scale-[0.98]"
          >
            Continue <ArrowRight size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
