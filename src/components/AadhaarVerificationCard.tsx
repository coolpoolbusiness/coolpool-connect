import { useState } from "react";
import { Input, message } from "antd";
import { BadgeCheck, ShieldQuestion, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { account } from "@/integrations/appwrite/client";
import {
  sendAadhaarOtpServer,
  verifyAadhaarOtpServer,
} from "@/integrations/kyc/aadhaar-verify";

/**
 * Aadhaar identity verification (OKYC OTP). The host enters their Aadhaar
 * number, receives an OTP on the Aadhaar-linked mobile, and confirms it. On
 * success we store only a verified flag + the name on record in the user's own
 * prefs — the Aadhaar number and full eKYC payload are never persisted.
 */
export function AadhaarVerificationCard({ className = "" }: { className?: string }) {
  const { user, refreshRoles } = useAuth();
  const prefs = (user?.prefs ?? {}) as Record<string, any>;

  const [step, setStep] = useState<"idle" | "otp">("idle");
  const [aadhaar, setAadhaar] = useState("");
  const [otp, setOtp] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [justVerified, setJustVerified] = useState<{ name: string | null } | null>(null);

  if (!user) return null;

  const verified = prefs.aadhaarVerified === true || !!justVerified;
  const verifiedName =
    justVerified?.name ?? (typeof prefs.aadhaarName === "string" ? prefs.aadhaarName : null);

  const sendOtp = async () => {
    const digits = aadhaar.replace(/\D/g, "");
    if (digits.length !== 12) {
      message.error("Enter your 12-digit Aadhaar number.");
      return;
    }
    setBusy(true);
    try {
      const r = await sendAadhaarOtpServer({ data: { aadhaar: digits } });
      if (!r.configured) {
        message.info("Aadhaar verification isn't switched on yet.");
        return;
      }
      setReferenceId(r.referenceId);
      setStep("otp");
      message.success("OTP sent to your Aadhaar-linked mobile.");
    } catch (e: any) {
      message.error(e?.message || "Couldn't send the OTP. Check the number and try again.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    const code = otp.replace(/\D/g, "");
    if (code.length < 4) {
      message.error("Enter the OTP from the SMS.");
      return;
    }
    setBusy(true);
    try {
      const r = await verifyAadhaarOtpServer({ data: { referenceId, otp: code } });
      if (!r.ok) {
        message.error("That OTP didn't verify. Please try again.");
        return;
      }
      // Persist to the signed-in user's OWN prefs (never the Aadhaar number).
      await account.updatePrefs({
        ...(user.prefs || {}),
        aadhaarVerified: true,
        aadhaarName: r.name || null,
        aadhaarVerifiedAt: new Date().toISOString(),
      });
      await refreshRoles();
      setJustVerified({ name: r.name });
      setStep("idle");
      setAadhaar("");
      setOtp("");
      message.success("Aadhaar verified.");
    } catch (e: any) {
      message.error(e?.message || "Verification failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`rounded-3xl border border-gray-100 bg-white p-5 shadow-sm ${className}`}>
      <div className="flex items-start gap-3">
        <div
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${
            verified ? "bg-emerald-50 text-emerald-600" : "bg-primary/10 text-primary"
          }`}
        >
          {verified ? <BadgeCheck size={20} /> : <ShieldQuestion size={20} />}
        </div>
        <div className="flex-1">
          <p className="font-bold text-gray-900">Aadhaar verification</p>
          <p className="text-sm text-muted-foreground">
            {verified
              ? verifiedName
                ? `Verified as ${verifiedName}.`
                : "Your Aadhaar is verified."
              : "Verify your Aadhaar with a one-time OTP. We never store your Aadhaar number."}
          </p>
        </div>
        {verified && (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
            Verified
          </span>
        )}
      </div>

      {!verified && (
        <div className="mt-5 flex flex-col gap-3">
          {step === "idle" ? (
            <>
              <Input
                size="large"
                inputMode="numeric"
                maxLength={14}
                className="rounded-2xl h-14 text-lg tracking-widest"
                placeholder="Aadhaar number (12 digits)"
                value={aadhaar}
                onChange={(e) => setAadhaar(e.target.value.replace(/[^\d\s]/g, ""))}
                disabled={busy}
              />
              <button
                type="button"
                onClick={sendOtp}
                disabled={busy}
                className="w-full rounded-2xl bg-gradient-primary py-3.5 text-sm font-bold text-white shadow-glow disabled:opacity-50"
              >
                {busy ? "Sending…" : "Send OTP"}
              </button>
            </>
          ) : (
            <>
              <Input
                size="large"
                inputMode="numeric"
                maxLength={8}
                autoFocus
                className="rounded-2xl h-14 text-lg tracking-[0.4em] text-center"
                placeholder="Enter OTP"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                disabled={busy}
              />
              <button
                type="button"
                onClick={verify}
                disabled={busy}
                className="w-full rounded-2xl bg-gradient-primary py-3.5 text-sm font-bold text-white shadow-glow disabled:opacity-50"
              >
                {busy ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Verifying…
                  </span>
                ) : (
                  "Verify"
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep("idle");
                  setOtp("");
                }}
                disabled={busy}
                className="text-xs font-semibold text-muted-foreground hover:text-primary disabled:opacity-50"
              >
                ← Change Aadhaar number
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
