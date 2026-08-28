import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, ShieldCheck, IdCard, Car, Landmark } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  getMyMemberVerification,
  getBankAccount,
  getVehicleByDriverUserId,
} from "@/data/appwrite-repository";
import { SelfieVerificationCard } from "@/components/SelfieVerificationCard";
import { AadhaarVerificationCard } from "@/components/AadhaarVerificationCard";
import { PanVerificationCard } from "@/components/PanVerificationCard";
import { DrivingLicenceVerificationCard } from "@/components/DrivingLicenceVerificationCard";

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

/**
 * Guided "Get Verified" checklist — ties the individual verifications into one
 * journey: selfie, identity (any ONE of Aadhaar / PAN / licence), car, bank.
 * Completed items collapse to a green row; incomplete ones show their card.
 */
export function GetVerifiedChecklist({ className = "" }: { className?: string }) {
  const { user } = useAuth();
  const prefs = (user?.prefs ?? {}) as Record<string, any>;

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

  const flags = [selfieDone, identityDone, carDone, bankDone];
  const done = flags.filter(Boolean).length;
  const total = flags.length;
  const allDone = done === total;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Progress header */}
      <div className="rounded-3xl bg-gradient-primary p-5 text-white shadow-glow">
        <div className="flex items-center gap-2">
          <ShieldCheck size={20} />
          <p className="text-lg font-bold">Get verified</p>
        </div>
        <p className="mt-1 text-sm text-white/90">
          {allDone
            ? "You're fully verified — you can offer rides. 🎉"
            : "Only verified hosts can offer rides. Quick steps — mostly numbers + OTP."}
        </p>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/25">
          <div
            className="h-2 rounded-full bg-white transition-all"
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs font-semibold text-white/90">
          {done} of {total} done
        </p>
      </div>

      {/* 1 — Selfie */}
      {selfieDone ? <DoneRow title="Selfie" detail="Your photo is verified" /> : <SelfieVerificationCard />}

      {/* 2 — Identity (verify any ONE) */}
      {identityDone ? (
        <DoneRow
          title="Identity verified"
          detail={`${idMethod}${idName ? ` · ${idName}` : ""}`}
        />
      ) : (
        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
              <IdCard size={18} />
            </div>
            <div>
              <p className="font-bold text-gray-900">Verify your identity</p>
              <p className="text-sm text-muted-foreground">
                Choose any <b>one</b> — you only need one.
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            <AadhaarVerificationCard />
            <PanVerificationCard />
            <DrivingLicenceVerificationCard />
          </div>
        </div>
      )}

      {/* 3 — Car */}
      {carDone ? (
        <DoneRow
          title="Your car"
          detail={[vehicle?.modelName, vehicle?.plateNumber].filter(Boolean).join(" · ")}
        />
      ) : (
        <SetupRow icon={<Car size={18} />} title="Add your car" detail="Plate, model & seats" cta="Add car" />
      )}

      {/* 4 — Bank / UPI */}
      {bankDone ? (
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
      )}
    </div>
  );
}
