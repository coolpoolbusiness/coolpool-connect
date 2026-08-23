// SERVER-ONLY. Shared Sandbox.co.in auth + config, used by the Aadhaar and
// DigiLocker modules. Credentials come from env and never reach the browser.
// SANDBOX_ENV=test → free test sandbox; anything else → production.

function readEnv(name: string): string {
  return (typeof process !== "undefined" ? (process.env?.[name] ?? "") : "").trim();
}

export const SANDBOX_API_VERSION = "1.0.0";

export function sandboxKey(): string {
  return readEnv("SANDBOX_API_KEY");
}

export function sandboxBaseUrl(): string {
  return readEnv("SANDBOX_ENV") === "test"
    ? "https://test-api.sandbox.co.in"
    : "https://api.sandbox.co.in";
}

export function kycConfigured(): boolean {
  return !!readEnv("SANDBOX_API_KEY") && !!readEnv("SANDBOX_API_SECRET");
}

let cachedToken: { token: string; fetchedAt: number } | null = null;

/** Authenticate and return a cached access token (valid ~24h; refreshed hourly). */
export async function sandboxAuth(): Promise<string> {
  const key = sandboxKey();
  const secret = readEnv("SANDBOX_API_SECRET");
  if (!key || !secret) throw new Error("KYC provider is not configured on the server.");
  if (cachedToken && Date.now() - cachedToken.fetchedAt < 55 * 60_000) return cachedToken.token;
  const res = await fetch(`${sandboxBaseUrl()}/authenticate`, {
    method: "POST",
    headers: { "x-api-key": key, "x-api-secret": secret, "x-api-version": SANDBOX_API_VERSION },
  });
  const json: any = await res.json().catch(() => ({}));
  const token = json?.access_token || json?.data?.access_token;
  if (!res.ok || !token) {
    throw new Error(json?.message || "Could not authenticate with the verification provider.");
  }
  cachedToken = { token, fetchedAt: Date.now() };
  return token;
}

/** Mask an identifier for storage/logs — keep only the last 4 chars. */
export function maskId(value: string): string {
  const v = String(value || "").replace(/\s/g, "");
  return v.length <= 4 ? v : `••••${v.slice(-4)}`;
}
