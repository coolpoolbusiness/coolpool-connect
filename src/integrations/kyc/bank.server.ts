// SERVER-ONLY. Penny-less bank account verification via Sandbox.co.in.
// "Penny-less" = the account holder's name is fetched from the bank over the
// NPCI/IMPS rails WITHOUT depositing a rupee, so we can confirm a host's payout
// account belongs to them before we ever send money. Shared auth/config lives
// in sandbox-core.server; credentials never reach the browser.
//
// Docs: GET /bank/{ifsc}/accounts/{account_number}/penniless-verify?name=&mobile=
//       -> data: { account_exists: boolean, name_at_bank: string, message? }
// The test environment is a mock that only echoes canned data for exact saved
// requests — real verification (and the small per-check fee) happens in live
// mode. The contract below matches the live API.
import { createServerFn } from "@tanstack/react-start";
import {
  SANDBOX_API_VERSION,
  kycConfigured,
  sandboxAuth,
  sandboxBaseUrl,
  sandboxKey,
} from "./sandbox-core.server";

export { kycConfigured } from "./sandbox-core.server";

// Standard IFSC: 4 letters, a literal 0, then 6 alphanumerics (e.g. KKBK0008066).
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

async function kycGet(path: string): Promise<any> {
  const token = await sandboxAuth();
  const res = await fetch(`${sandboxBaseUrl()}${path}`, {
    method: "GET",
    headers: {
      Authorization: token,
      "x-api-key": sandboxKey(),
      "x-api-version": SANDBOX_API_VERSION,
    },
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      json?.message || json?.data?.message || `Bank verification failed (${res.status}).`,
    );
  }
  return json;
}

// Normalise a name for comparison: uppercase, drop honorifics/punctuation,
// collapse whitespace. "Mr. Shaik Mohammed" -> "SHAIK MOHAMMED".
function normalizeName(value: string): string {
  return String(value || "")
    .toUpperCase()
    .replace(/\b(MR|MRS|MS|DR|SHRI|SMT|KUM|M\/S)\b/g, " ")
    .replace(/[^A-Z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Token-set match: every word of the shorter name must appear in the longer.
// Handles reordering ("Basha Khader" vs "Khader Basha") and one side omitting a
// middle name, while still rejecting a genuinely different holder.
function namesMatch(entered: string, atBank: string): boolean {
  const a = normalizeName(entered);
  const b = normalizeName(atBank);
  if (!a || !b) return false;
  if (a === b) return true;
  const at = a.split(" ");
  const bt = b.split(" ");
  const [small, big] = at.length <= bt.length ? [at, new Set(bt)] : [bt, new Set(at)];
  return small.every((token) => big.has(token));
}

export interface BankVerifyResult {
  /** The account number exists and is active at the bank. */
  accountExists: boolean;
  /** Holder name as recorded at the bank (null if the bank did not return one). */
  nameAtBank: string | null;
  /** Whether nameAtBank matches the name we sent. Null when no name was compared. */
  nameMatch: boolean | null;
  message?: string;
}

/** Core penny-less verify. Server-only; call via verifyBankAccountServer from the UI. */
export async function verifyBankAccount(input: {
  ifsc: string;
  accountNumber: string;
  name?: string;
  mobile?: string;
}): Promise<BankVerifyResult> {
  const ifsc = input.ifsc.trim().toUpperCase();
  const account = input.accountNumber.replace(/\s/g, "");
  const qs = new URLSearchParams();
  if (input.name) qs.set("name", input.name.trim().slice(0, 100));
  if (input.mobile) qs.set("mobile", input.mobile.replace(/\D/g, "").slice(-10));
  const query = qs.toString() ? `?${qs.toString()}` : "";

  const json = await kycGet(
    `/bank/${encodeURIComponent(ifsc)}/accounts/${encodeURIComponent(account)}/penniless-verify${query}`,
  );
  const data = json?.data ?? json;
  const accountExists = data?.account_exists === true;
  const nameAtBank =
    typeof data?.name_at_bank === "string" && data.name_at_bank.trim()
      ? data.name_at_bank.trim()
      : null;
  // Prefer a match flag from the provider if present; otherwise compare locally.
  const providerMatch =
    typeof data?.name_match === "boolean"
      ? data.name_match
      : typeof data?.name_match_result === "boolean"
        ? data.name_match_result
        : null;
  const nameMatch = input.name
    ? (providerMatch ?? (nameAtBank ? namesMatch(input.name, nameAtBank) : null))
    : null;

  return { accountExists, nameAtBank, nameMatch, message: data?.message };
}

/**
 * Verifies a bank account (penny-less) for the payout-account screen.
 * Input: { ifsc, accountNumber, name?, mobile? }.
 * Output: { configured, accountExists, nameAtBank, nameMatch, message }.
 * When the provider is not configured on the server, returns { configured:false }
 * so the UI can quietly skip verification rather than error.
 */
export const verifyBankAccountServer = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { ifsc: string; accountNumber: string; name?: string; mobile?: string }) => {
      const ifsc = String(input?.ifsc || "").trim().toUpperCase();
      const accountNumber = String(input?.accountNumber || "").replace(/\s/g, "");
      const name = input?.name ? String(input.name).trim() : undefined;
      const mobile = input?.mobile ? String(input.mobile).replace(/\D/g, "") : undefined;
      if (!IFSC_RE.test(ifsc)) {
        throw new Error("Enter a valid IFSC code (e.g. HDFC0001234).");
      }
      if (!/^[0-9A-Za-z]{6,40}$/.test(accountNumber)) {
        throw new Error("Enter a valid account number.");
      }
      return { ifsc, accountNumber, name, mobile };
    },
  )
  .handler(
    async ({
      data,
    }): Promise<
      | { configured: false }
      | ({ configured: true } & BankVerifyResult)
    > => {
      if (!kycConfigured()) return { configured: false };
      const result = await verifyBankAccount(data);
      return { configured: true, ...result };
    },
  );
