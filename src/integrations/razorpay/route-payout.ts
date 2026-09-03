// SERVER-ONLY. Razorpay Route payouts to hosts.
//
// Route pays a host by (1) onboarding them once as a "linked account" under the
// company account, (2) configuring that linked account's settlement bank, then
// (3) creating a direct Transfer to it. Razorpay then settles the money to the
// host's own bank on their settlement schedule.
//
// IMPORTANT: Route is only available on the *company* Razorpay account
// (Illuminate Infinity) — NOT the individual account whose keys power the
// payment gateway (RAZORPAY_KEY_ID). So Route uses its own dedicated keys:
//   RAZORPAY_ROUTE_KEY_ID / RAZORPAY_ROUTE_KEY_SECRET
// (test keys to validate, live keys to go live). The KEY_SECRET never leaves
// the server. This file has no client-reachable exports.

const RZP_BASE = "https://api.razorpay.com";

// Razorpay onboarding enums for an individual carpool host. These are the only
// values likely to need tuning once we validate against the company account's
// test key (Razorpay category/subcategory codes are account-specific).
const HOST_BUSINESS_TYPE = "individual";
const HOST_CATEGORY = "tours_and_travel";
const HOST_SUBCATEGORY = "cab";

function routeCreds(): { id: string; secret: string } {
  const id = (process.env.RAZORPAY_ROUTE_KEY_ID ?? "").trim();
  const secret = (process.env.RAZORPAY_ROUTE_KEY_SECRET ?? "").trim();
  if (!id || !secret) {
    throw new Error(
      "Razorpay Route keys missing. Add the company account's RAZORPAY_ROUTE_KEY_ID / " +
        "RAZORPAY_ROUTE_KEY_SECRET (test keys to validate, live to go live).",
    );
  }
  return { id, secret };
}

async function rzp<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const { id, secret } = routeCreds();
  const auth = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch(`${RZP_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      json?.error?.description || json?.error?.reason || json?.message || res.statusText;
    throw new Error(`Razorpay Route ${method} ${path} failed: ${msg}`);
  }
  return json as T;
}

export interface RouteHostProfile {
  name: string; // host's legal / account-holder name
  email: string;
  phone: string; // digits only, 8–15 chars
  pan?: string | null;
}

export interface RouteBankAccount {
  beneficiaryName: string;
  accountNumber: string;
  ifsc: string;
}

/** (1) Create a Route linked account for the host. Returns the acc_… id. */
export async function createRouteLinkedAccount(host: RouteHostProfile): Promise<string> {
  const phone = String(host.phone || "").replace(/\D/g, "").slice(0, 15);
  if (phone.length < 8) throw new Error("Host phone number is invalid for Route onboarding.");
  const body: Record<string, unknown> = {
    email: host.email,
    phone,
    type: "route",
    legal_business_name: host.name,
    customer_facing_business_name: host.name,
    business_type: HOST_BUSINESS_TYPE,
    contact_name: host.name,
    profile: {
      category: HOST_CATEGORY,
      subcategory: HOST_SUBCATEGORY,
    },
  };
  if (host.pan && host.pan.trim()) {
    body.legal_info = { pan: host.pan.trim().toUpperCase() };
  }
  const acc = await rzp<{ id: string }>("POST", "/v2/accounts", body);
  if (!acc?.id) throw new Error("Razorpay did not return a linked account id.");
  return acc.id;
}

/** (2) Request the Route product configuration on the linked account. Returns acc_prd_… id. */
export async function requestRouteProduct(accountId: string): Promise<string> {
  const prd = await rzp<{ id: string }>("POST", `/v2/accounts/${accountId}/products`, {
    product_name: "route",
    tnc_accepted: true,
  });
  if (!prd?.id) throw new Error("Razorpay did not return a product configuration id.");
  return prd.id;
}

/** (3) Set the linked account's settlement bank (where Route money lands). */
export async function setRouteSettlementBank(
  accountId: string,
  productId: string,
  bank: RouteBankAccount,
): Promise<void> {
  await rzp("PATCH", `/v2/accounts/${accountId}/products/${productId}`, {
    settlements: {
      account_number: bank.accountNumber,
      ifsc_code: bank.ifsc.toUpperCase(),
      beneficiary_name: bank.beneficiaryName,
    },
  });
}

/**
 * One-time host onboarding for Route: create the linked account, request the
 * route product, and point its settlements at the host's bank. Returns the
 * linked account id — the caller MUST cache it so this only runs once per host.
 */
export async function onboardHostForRoute(
  host: RouteHostProfile,
  bank: RouteBankAccount,
): Promise<string> {
  const accountId = await createRouteLinkedAccount(host);
  const productId = await requestRouteProduct(accountId);
  await setRouteSettlementBank(accountId, productId, bank);
  return accountId;
}

export interface RouteTransferResult {
  id: string; // trf_…
  status: string; // e.g. "processed" | "pending"
  amount: number; // paise
}

/** (4) Transfer money from the platform balance to the host's linked account. */
export async function createRouteTransfer(input: {
  accountId: string;
  amountPaise: number;
  notes?: Record<string, string>;
}): Promise<RouteTransferResult> {
  const amount = Math.round(input.amountPaise);
  if (!Number.isFinite(amount) || amount < 100) {
    throw new Error("Route transfer amount must be at least ₹1 (100 paise).");
  }
  const trf = await rzp<RouteTransferResult>("POST", "/v1/transfers", {
    account: input.accountId,
    amount,
    currency: "INR",
    ...(input.notes ? { notes: input.notes } : {}),
  });
  return { id: trf.id, status: trf.status, amount: Number(trf.amount ?? amount) };
}
