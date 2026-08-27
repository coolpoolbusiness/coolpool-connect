// Penny-less bank account verification via Sandbox.co.in. The verification runs
// server-side inside verifyBankAccountServer (createServerFn); the client only
// imports that RPC stub. The server-only sandbox-core.server import is therefore
// referenced ONLY inside the handler, so the createServerFn compiler strips it
// from the client bundle (the import-protection plugin forbids `**/*.server.*`
// in client-reachable code otherwise — mirrors how otp.ts uses its .server dep).
//
// "Penny-less" = the account holder's name is fetched from the bank over the
// NPCI/IMPS rails WITHOUT depositing a rupee, so we can confirm a host's payout
// account belongs to them before we ever send money. Credentials never reach
// the browser.
//
// Docs: GET /bank/{ifsc}/accounts/{account}/penniless-verify?name=&mobile=
//   -> data: { account_exists: boolean, name_at_bank: string, message? }
// The test environment is a mock that only echoes canned data for exact saved
// requests; real verification (and the small per-check fee) happens in live mode.
import { createServerFn } from "@tanstack/react-start";

// Standard IFSC: 4 letters, a literal 0, then 6 alphanumerics (e.g. KKBK0008066).
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

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

type VerifyResponse = { configured: false } | ({ configured: true } & BankVerifyResult);

/**
 * Verifies a bank account (penny-less) for the payout-account screen.
 * Input: { ifsc, accountNumber, name?, mobile? }.
 * Output: { configured:false } when the provider isn't set up on the server, else
 *         { configured:true, accountExists, nameAtBank, nameMatch, message }.
 */
export const verifyBankAccountServer = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { ifsc: string; accountNumber: string; name?: string; mobile?: string }) => {
      const ifsc = String(input?.ifsc || "").trim().toUpperCase();
      const accountNumber = String(input?.accountNumber || "").replace(/\s/g, "");
      const name = input?.name ? String(input.name).trim().slice(0, 100) : undefined;
      const mobile = input?.mobile ? String(input.mobile).replace(/\D/g, "").slice(-10) : undefined;
      if (!IFSC_RE.test(ifsc)) {
        throw new Error("Enter a valid IFSC code (e.g. HDFC0001234).");
      }
      if (!/^[0-9A-Za-z]{6,40}$/.test(accountNumber)) {
        throw new Error("Enter a valid account number.");
      }
      return { ifsc, accountNumber, name, mobile };
    },
  )
  .handler(async ({ data }): Promise<VerifyResponse> => {
    // Imported inside the handler so the server-only module never enters the
    // client bundle (see file header).
    const {
      SANDBOX_API_VERSION,
      kycConfigured,
      sandboxAuth,
      sandboxBaseUrl,
      sandboxKey,
    } = await import("./sandbox-core.server");

    if (!kycConfigured()) return { configured: false };

    const token = await sandboxAuth();
    const qs = new URLSearchParams();
    if (data.name) qs.set("name", data.name);
    if (data.mobile) qs.set("mobile", data.mobile);
    const query = qs.toString() ? `?${qs.toString()}` : "";
    const url =
      `${sandboxBaseUrl()}/bank/${encodeURIComponent(data.ifsc)}` +
      `/accounts/${encodeURIComponent(data.accountNumber)}/penniless-verify${query}`;

    const res = await fetch(url, {
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

    const d = json?.data ?? json;
    const accountExists = d?.account_exists === true;
    const nameAtBank =
      typeof d?.name_at_bank === "string" && d.name_at_bank.trim() ? d.name_at_bank.trim() : null;
    // Prefer a match flag from the provider if present; otherwise compare locally.
    const providerMatch =
      typeof d?.name_match === "boolean"
        ? d.name_match
        : typeof d?.name_match_result === "boolean"
          ? d.name_match_result
          : null;
    const nameMatch = data.name
      ? (providerMatch ?? (nameAtBank ? namesMatch(data.name, nameAtBank) : null))
      : null;

    return { configured: true, accountExists, nameAtBank, nameMatch, message: d?.message };
  });
