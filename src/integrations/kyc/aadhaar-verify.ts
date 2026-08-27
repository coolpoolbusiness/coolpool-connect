// Aadhaar OKYC (OTP eKYC) exposed to the client via createServerFn. The
// server-only sandbox modules are imported INSIDE each handler so they never
// enter the client bundle (same rule as bank-verify.ts: client-reachable files
// must not statically import a `*.server.*` module).
//
// Two steps: send an OTP to the Aadhaar-linked mobile, then verify it. Only the
// holder's name/gender come back — the full eKYC payload is never returned.
import { createServerFn } from "@tanstack/react-start";

const AADHAAR_RE = /^\d{12}$/;
const OTP_RE = /^\d{4,8}$/;

/** Step 1 — send OTP. Returns { configured:false } when the provider isn't set up. */
export const sendAadhaarOtpServer = createServerFn({ method: "POST" })
  .inputValidator((input: { aadhaar: string }) => {
    const aadhaar = String(input?.aadhaar || "").replace(/\D/g, "");
    if (!AADHAAR_RE.test(aadhaar)) throw new Error("Enter your 12-digit Aadhaar number.");
    return { aadhaar };
  })
  .handler(
    async ({
      data,
    }): Promise<
      { configured: false } | { configured: true; referenceId: string; message?: string }
    > => {
      const { kycConfigured, sendAadhaarOtp } = await import("./sandbox.server");
      if (!kycConfigured()) return { configured: false };
      const r = await sendAadhaarOtp(data.aadhaar);
      return { configured: true, referenceId: r.referenceId, message: r.message };
    },
  );

/** Step 2 — verify OTP. Returns { ok, name, gender }. */
export const verifyAadhaarOtpServer = createServerFn({ method: "POST" })
  .inputValidator((input: { referenceId: string; otp: string }) => {
    const referenceId = String(input?.referenceId || "").trim();
    const otp = String(input?.otp || "").replace(/\D/g, "");
    if (!referenceId) throw new Error("Request an OTP first.");
    if (!OTP_RE.test(otp)) throw new Error("Enter the OTP sent to your Aadhaar-linked mobile.");
    return { referenceId, otp };
  })
  .handler(
    async ({ data }): Promise<{ ok: boolean; name: string | null; gender: string | null }> => {
      const { verifyAadhaarOtp } = await import("./sandbox.server");
      return verifyAadhaarOtp(data.referenceId, data.otp);
    },
  );
