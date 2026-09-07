import { useState } from "react";
import { Fingerprint, CreditCard, Car } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { AadhaarVerificationCard } from "@/components/AadhaarVerificationCard";
import { PanVerificationCard } from "@/components/PanVerificationCard";
import { DrivingLicenceVerificationCard } from "@/components/DrivingLicenceVerificationCard";

type Method = "aadhaar" | "pan" | "dl";

const METHODS: { key: Method; label: string; hint: string; icon: LucideIcon }[] = [
  { key: "aadhaar", label: "Aadhaar", hint: "OTP", icon: Fingerprint },
  { key: "pan", label: "PAN", hint: "Instant", icon: CreditCard },
  { key: "dl", label: "Licence", hint: "DigiLocker", icon: Car },
];

/**
 * Compact identity-method picker: three tap targets (Aadhaar / PAN / Licence)
 * that all fit without scrolling. Tapping one reveals just that method's
 * verification card — you only need any one.
 */
export function IdentityVerificationPicker() {
  const [selected, setSelected] = useState<Method | null>(null);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {METHODS.map((m) => {
          const active = selected === m.key;
          const Icon = m.icon;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setSelected(m.key)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-2xl border-2 p-3 text-center shadow-sm transition active:scale-95",
                active
                  ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                  : "border-gray-200 bg-gray-50 hover:border-primary/40 hover:bg-white",
              )}
            >
              <span
                className={cn(
                  "grid h-9 w-9 place-items-center rounded-xl transition-colors",
                  active ? "bg-gradient-primary text-white" : "bg-primary/10 text-primary",
                )}
              >
                <Icon size={18} />
              </span>
              <span className="text-xs font-bold text-gray-900">{m.label}</span>
              <span className="text-[10px] font-medium text-muted-foreground">{m.hint}</span>
            </button>
          );
        })}
      </div>

      {selected === "aadhaar" && <AadhaarVerificationCard />}
      {selected === "pan" && <PanVerificationCard />}
      {selected === "dl" && <DrivingLicenceVerificationCard />}

      {!selected && (
        <p className="pt-1 text-center text-sm text-muted-foreground">
          Pick one above to verify — you only need <b>one</b>.
        </p>
      )}
    </div>
  );
}
