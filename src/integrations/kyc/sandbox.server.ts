// SERVER-ONLY. KYC verification via Sandbox.co.in (api.sandbox.co.in).
// Verifies driving licence, vehicle RC, and Aadhaar (OTP eKYC) against
// government registries. Credentials come from env (SANDBOX_API_KEY /
// SANDBOX_API_SECRET) and NEVER reach the browser. Every call here is a
// billable, real-registry request — callers must gate on user consent.
//
// Auth model: POST /authenticate with the key+secret returns a short-lived
// access_token; that token authorizes the KYC endpoints. We cache it in-process.

function readEnv(name: string): string {
  return (typeof process !== "undefined" ? (process.env?.[name] ?? "") : "").trim();
}

const BASE = "https://api.sandbox.co.in";
const API_VERSION = "2.0";

export function kycConfigured(): boolean {
  return !!readEnv("SANDBOX_API_KEY") && !!readEnv("SANDBOX_API_SECRET");
}

let cachedToken: { token: string; fetchedAt: number } | null = null;

async function accessToken(): Promise<string> {
  const key = readEnv("SANDBOX_API_KEY");
  const secret = readEnv("SANDBOX_API_SECRET");
  if (!key || !secret) throw new Error("KYC provider is not configured on the server.");
  // Tokens are valid ~24h; refresh hourly to be safe.
  if (cachedToken && Date.now() - cachedToken.fetchedAt < 55 * 60_000) {
    return cachedToken.token;
  }
  const res = await fetch(`${BASE}/authenticate`, {
    method: "POST",
    headers: { "x-api-key": key, "x-api-secret": secret, "x-api-version": API_VERSION },
  });
  const json: any = await res.json().catch(() => ({}));
  const token = json?.access_token || json?.data?.access_token;
  if (!res.ok || !token) {
    throw new Error(json?.message || "Could not authenticate with the verification provider.");
  }
  cachedToken = { token, fetchedAt: Date.now() };
  return token;
}

async function kycPost(path: string, body: Record<string, unknown>): Promise<any> {
  const key = readEnv("SANDBOX_API_KEY");
  const token = await accessToken();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: token,
      "x-api-key": key,
      "x-api-version": API_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.message || `Verification request failed (${res.status}).`);
  }
  return json;
}

/** Mask an identifier for storage/logs — keep only the last 4 chars. */
export function maskId(value: string): string {
  const v = String(value || "").replace(/\s/g, "");
  return v.length <= 4 ? v : `••••${v.slice(-4)}`;
}

export interface VerifyResult {
  ok: boolean;
  name?: string | null;
  raw?: unknown;
  message?: string;
}

/** Driving licence verification. Needs the DL number + holder's date of birth. */
export async function verifyDrivingLicence(dlNumber: string, dob: string): Promise<VerifyResult> {
  const json = await kycPost("/kyc/driving-license/search", {
    "@entity": "in.co.sandbox.kyc.driving_license.search.request",
    driving_license_number: dlNumber.trim().toUpperCase(),
    date_of_birth: dob, // DD/MM/YYYY
    consent: "y",
    reason: "Host onboarding verification for Coolpool",
  });
  const data = json?.data ?? json;
  const name = data?.name ?? data?.holder_name ?? null;
  return { ok: !!name || data?.status === "valid", name, raw: data };
}

/** Vehicle registration certificate (RC) verification by plate number. */
export async function verifyVehicleRC(rcNumber: string): Promise<VerifyResult> {
  const json = await kycPost("/kyc/rc/search", {
    "@entity": "in.co.sandbox.kyc.rc.search.request",
    rc_number: rcNumber.trim().toUpperCase(),
    consent: "y",
    reason: "Host vehicle verification for Coolpool",
  });
  const data = json?.data ?? json;
  const owner = data?.owner_name ?? data?.owner ?? null;
  return { ok: !!owner, name: owner, raw: data };
}

/** Aadhaar eKYC — step 1: send OTP to the Aadhaar-linked mobile. */
export async function sendAadhaarOtp(aadhaar: string): Promise<{ refId: string }> {
  const json = await kycPost("/kyc/aadhaar/okyc/otp", {
    "@entity": "in.co.sandbox.kyc.aadhaar.okyc.otp.request",
    aadhaar_number: aadhaar.replace(/\s/g, ""),
    consent: "y",
    reason: "Host identity verification for Coolpool",
  });
  const refId = json?.data?.ref_id ?? json?.ref_id;
  if (!refId) throw new Error("Could not send Aadhaar OTP. Check the number and try again.");
  return { refId: String(refId) };
}

/** Aadhaar eKYC — step 2: verify the OTP; returns the registry name on success. */
export async function verifyAadhaarOtp(refId: string, otp: string): Promise<VerifyResult> {
  const json = await kycPost("/kyc/aadhaar/okyc/otp/verify", {
    "@entity": "in.co.sandbox.kyc.aadhaar.okyc.request",
    ref_id: refId,
    otp: otp.trim(),
  });
  const data = json?.data ?? json;
  const name = data?.name ?? null;
  return { ok: !!name, name, raw: { name: data?.name, gender: data?.gender } }; // never store full Aadhaar payload
}
