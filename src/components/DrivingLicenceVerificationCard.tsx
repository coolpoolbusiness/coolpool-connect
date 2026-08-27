import { useEffect, useRef, useState } from "react";
import { message } from "antd";
import { BadgeCheck, ShieldQuestion, Loader2, ExternalLink } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { account } from "@/integrations/appwrite/client";
import {
  initiateDigiLockerServer,
  digiLockerStatusServer,
} from "@/integrations/kyc/digilocker-verify";

// Survives the round-trip to DigiLocker and back (a full page reload).
const PENDING_KEY = "coolpool_dl_session";

function isFinished(status: string): boolean {
  const s = status.toLowerCase();
  return ["completed", "complete", "success", "verified", "approved"].some((x) => s.includes(x));
}
function isFailed(status: string): boolean {
  const s = status.toLowerCase();
  return ["expired", "failed", "revoked", "declined", "rejected"].some((x) => s.includes(x));
}

/**
 * Driving-licence verification via DigiLocker (Sandbox). The host is redirected
 * to DigiLocker, consents to share their licence, and returns; we then read the
 * verified name + licence number back. We persist only a verified flag, the
 * name, and the last 4 digits of the licence — never the full number.
 */
export function DrivingLicenceVerificationCard({ className = "" }: { className?: string }) {
  const { user, refreshRoles } = useAuth();
  const prefs = (user?.prefs ?? {}) as Record<string, any>;

  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [pending, setPending] = useState(false);
  const [justVerified, setJustVerified] = useState<{ name: string | null } | null>(null);
  const checkedOnce = useRef(false);

  const verified = prefs.dlVerified === true || !!justVerified;
  const verifiedName =
    justVerified?.name ?? (typeof prefs.dlName === "string" ? prefs.dlName : null);

  const checkStatus = async (sessionId: string, quiet = false) => {
    setChecking(true);
    try {
      const res = await digiLockerStatusServer({ data: { sessionId } });
      if (isFinished(res.status) || res.dlNumber || (res.name && res.documents.length > 0)) {
        const last4 = res.dlNumber ? res.dlNumber.replace(/\s/g, "").slice(-4) : null;
        await account.updatePrefs({
          ...(user!.prefs || {}),
          dlVerified: true,
          dlName: res.name || null,
          dlNumberLast4: last4,
          dlVerifiedAt: new Date().toISOString(),
        });
        await refreshRoles();
        sessionStorage.removeItem(PENDING_KEY);
        setPending(false);
        setJustVerified({ name: res.name });
        message.success("Driving licence verified.");
      } else if (isFailed(res.status)) {
        sessionStorage.removeItem(PENDING_KEY);
        setPending(false);
        message.error("Licence verification didn't complete. Please try again.");
      } else {
        // still processing
        setPending(true);
        if (!quiet) message.info("Still confirming with DigiLocker — check again in a moment.");
      }
    } catch (e: any) {
      if (!quiet) message.error(e?.message || "Couldn't read the verification status.");
    } finally {
      setChecking(false);
    }
  };

  // On return from DigiLocker (fresh page load), auto-check a pending session once.
  useEffect(() => {
    if (checkedOnce.current || !user) return;
    checkedOnce.current = true;
    const sessionId = sessionStorage.getItem(PENDING_KEY);
    if (sessionId && prefs.dlVerified !== true) {
      setPending(true);
      void checkStatus(sessionId, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!user) return null;

  const startVerify = async () => {
    setBusy(true);
    try {
      const redirectUrl = `${window.location.origin}${window.location.pathname}?dl=return`;
      const res = await initiateDigiLockerServer({ data: { redirectUrl } });
      if (!res.configured) {
        message.info("Licence verification isn't switched on yet.");
        return;
      }
      sessionStorage.setItem(PENDING_KEY, res.sessionId);
      window.location.assign(res.authorizationUrl);
    } catch (e: any) {
      message.error(e?.message || "Couldn't start DigiLocker. Please try again.");
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
          <p className="font-bold text-gray-900">Driving licence</p>
          <p className="text-sm text-muted-foreground">
            {verified
              ? verifiedName
                ? `Verified as ${verifiedName}.`
                : "Your driving licence is verified."
              : pending
                ? "Waiting for DigiLocker to confirm your licence."
                : "Verify your licence securely through DigiLocker. We never store the full number."}
          </p>
        </div>
        {verified && (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
            Verified
          </span>
        )}
      </div>

      {!verified && (
        <div className="mt-5 flex flex-col gap-2">
          {pending ? (
            <>
              <button
                type="button"
                onClick={() => {
                  const id = sessionStorage.getItem(PENDING_KEY);
                  if (id) void checkStatus(id);
                }}
                disabled={checking}
                className="w-full rounded-2xl bg-gradient-primary py-3.5 text-sm font-bold text-white shadow-glow disabled:opacity-50"
              >
                {checking ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Checking…
                  </span>
                ) : (
                  "Check verification status"
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  sessionStorage.removeItem(PENDING_KEY);
                  setPending(false);
                }}
                className="text-xs font-semibold text-muted-foreground hover:text-primary"
              >
                Start over
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={startVerify}
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-primary py-3.5 text-sm font-bold text-white shadow-glow disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Opening DigiLocker…
                </>
              ) : (
                <>
                  <ExternalLink size={16} /> Verify with DigiLocker
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
