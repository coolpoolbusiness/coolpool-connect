// SERVER-ONLY. KYC verification via Sandbox.co.in.
// Sandbox provides Aadhaar OKYC (OTP eKYC), PAN, bank, and DigiLocker — but
// NOT direct driving-licence / vehicle-RC number APIs (those need DigiLocker
// document pull or a different provider). This module covers Aadhaar.
//
// Credentials come from env (SANDBOX_API_KEY / SANDBOX_API_SECRET) and never
// reach the browser. SANDBOX_ENV=test routes to the free test sandbox
// (test-api.sandbox.co.in) which returns sample data without billing or
// touching real Aadhaar records; anything else uses production.

function readEnv(name: string): string {
  return (typeof process !== "undefined" ? (process.env?.[name] ?? "") : "").trim();
}

function baseUrl(): string {
  return readEnv("SANDBOX_ENV") === "test"
    ? "https://test-api.sandbox.co.in"
    : "https://api.sandbox.co.in";
}
const API_VERSION = "1.0.0";

export function kycConfigured(): boolean {
  return !!readEnv("SANDBOX_API_KEY") && !!readEnv("SANDBOX_API_SECRET");
}

let cachedToken: { token: string; fetchedAt: number } | null = null;

async function accessToken(): Promise<string> {
  const key = readEnv("SANDBOX_API_KEY");
  const secret = readEnv("SANDBOX_API_SECRET");
  if (!key || !secret) throw new Error("KYC provider is not configured on the server.");
  if (cachedToken && Date.now() - cachedToken.fetchedAt < 55 * 60_000) return cachedToken.token;
  const res = await fetch(`${baseUrl()}/authenticate`, {
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
  const token = await accessToken();
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: {
      Authorization: token,
      "x-api-key": readEnv("SANDBOX_API_KEY"),
      "x-api-version": API_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || `Verification request failed (${res.status}).`);
  return json;
}

/** Mask an identifier for storage/logs — keep only the last 4 chars. */
export function maskId(value: string): string {
  const v = String(value || "").replace(/\s/g, "");
  return v.length <= 4 ? v : `••••${v.slice(-4)}`;
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
