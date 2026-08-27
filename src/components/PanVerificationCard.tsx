import { useState } from "react";
import { Input, message } from "antd";
import { BadgeCheck, ShieldQuestion, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { account } from "@/integrations/appwrite/client";
import { verifyPanServer } from "@/integrations/kyc/pan-verify";

/**
 * PAN verification (Sandbox). Instant and automatic — the driver enters their
 * PAN and the name as printed on the card; Sandbox confirms validity and that
 * the name matches. On success we store only a verified flag, the name, and the
 * last 4 of the PAN in the user's own prefs — never the full PAN.
 */
export function PanVerificationCard({ className = "" }: { className?: string }) {
  const { user, refreshRoles } = useAuth();
  const prefs = (user?.prefs ?? {}) as Record<string, any>;

  const [pan, setPan] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [justVerified, setJustVerified] = useState(false);

  if (!user) return null;

  const verified = prefs.panVerified === true || justVerified;
  const verifiedName = typeof prefs.panName === "string" ? prefs.panName : null;

  const verify = async () => {
    const cleanPan = pan.toUpperCase().replace(/\s/g, "");
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(cleanPan)) {
      message.error("Enter a valid 10-character PAN (e.g. ABCDE1234F).");
      return;
    }
    if (!name.trim()) {
      message.error("Enter the name exactly as printed on the PAN card.");
      return;
    }
    setBusy(true);
    try {
      const r = await verifyPanServer({ data: { pan: cleanPan, name: name.trim() } });
      if (!r.configured) {
        message.info("PAN verification isn't switched on yet.");
        return;
      }
      if (!r.valid) {
        message.error("This PAN could not be verified. Please check the number.");
        return;
      }
      if (r.nameMatch === false) {
        message.error("The PAN is valid, but the name doesn't match. Enter it exactly as on the card.");
        return;
      }
      await account.updatePrefs({
        ...(user.prefs || {}),
        panVerified: true,
        panName: name.trim(),
        panLast4: cleanPan.slice(-4),
        panVerifiedAt: new Date().toISOString(),
      });
      await refreshRoles();
      setJustVerified(true);
      setPan("");
      message.success("PAN verified.");
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
          <p className="font-bold text-gray-900">PAN verification</p>
          <p className="text-sm text-muted-foreground">
            {verified
              ? verifiedName
                ? `Verified as ${verifiedName}.`
                : "Your PAN is verified."
              : "Verify your PAN instantly. We never store the full number."}
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
          <Input
            size="large"
            maxLength={10}
            className="rounded-2xl h-14 text-lg tracking-widest uppercase"
            placeholder="PAN (e.g. ABCDE1234F)"
            value={pan}
            onChange={(e) => setPan(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            disabled={busy}
          />
          <Input
            size="large"
            className="rounded-2xl h-14 text-lg"
            placeholder="Full name as on PAN card"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
          <button
            type="button"
            onClick={verify}
            disabled={busy}
            className="w-full rounded-2xl bg-gradient-primary py-3.5 text-sm font-bold text-white shadow-glow disabled:opacity-50"
          >
            {busy ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Verifying…
              </span>
            ) : (
              "Verify PAN"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
