// SERVER-ONLY. Aadhaar OKYC (OTP eKYC) via Sandbox.co.in.
// Shared auth/config lives in sandbox-core.server. Credentials never reach the
// browser. Aadhaar is the only Sandbox "direct" KYC we use; driving licence
// goes through DigiLocker (see digilocker.server), and Sandbox has no vehicle
// RC API at all.
import {
  SANDBOX_API_VERSION,
  sandboxAuth,
  sandboxBaseUrl,
  sandboxKey,
} from "./sandbox-core.server";

export { kycConfigured, maskId } from "./sandbox-core.server";

async function kycPost(path: string, body: Record<string, unknown>): Promise<any> {
  const token = await sandboxAuth();
  const res = await fetch(`${sandboxBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      Authorization: token,
      "x-api-key": sandboxKey(),
      "x-api-version": SANDBOX_API_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || `Verification request failed (${res.status}).`);
  return json;
}

export interface AadhaarOtpResult {
  referenceId: string;
  message?: string;
}

/** Aadhaar eKYC — step 1: send OTP to the Aadhaar-linked mobile. */
export async function sendAadhaarOtp(aadhaar: string): Promise<AadhaarOtpResult> {
  const json = await kycPost("/kyc/aadhaar/okyc/otp", {
    "@entity": "in.co.sandbox.kyc.aadhaar.okyc.otp.request",
    aadhaar_number: aadhaar.replace(/\D/g, ""),
    consent: "Y",
    reason: "Host identity verification for Coolpool",
  });
  const referenceId = json?.data?.reference_id;
  if (referenceId == null) {
    throw new Error("Could not send Aadhaar OTP. Check the number and try again.");
  }
  return { referenceId: String(referenceId), message: json?.data?.message };
}

export interface AadhaarVerifyResult {
  ok: boolean;
  name: string | null;
  gender: string | null;
}

/** Aadhaar eKYC — step 2: verify the OTP. Returns only name/gender — the full
 *  eKYC payload (address, photo, hashes) is deliberately NOT returned/stored. */
export async function verifyAadhaarOtp(
  referenceId: string,
  otp: string,
): Promise<AadhaarVerifyResult> {
  const json = await kycPost("/kyc/aadhaar/okyc/otp/verify", {
    "@entity": "in.co.sandbox.kyc.aadhaar.okyc.request",
    reference_id: referenceId,
    otp: otp.trim(),
  });
  const data = json?.data ?? json;
  const valid = String(data?.status || "").toUpperCase() === "VALID" || !!data?.name;
  return { ok: valid, name: data?.name ?? null, gender: data?.gender ?? null };
}
