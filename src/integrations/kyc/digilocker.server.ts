// SERVER-ONLY. DigiLocker document verification via Sandbox.co.in.
// The host is redirected to DigiLocker, logs in, and consents to share
// government-issued documents (driving licence, Aadhaar, PAN). We then read
// the verified data back from the session. Cheaper than per-check APIs and
// covers driving licence — which Sandbox has no direct number API for.
//
// NOTE: DigiLocker via Sandbox supports doc_types aadhaar | pan |
// driving_license only. Vehicle RC is NOT available through Sandbox (direct
// or DigiLocker) and needs a different provider or manual review.
import { sandboxAuth, sandboxBaseUrl, SANDBOX_API_VERSION, sandboxKey } from "./sandbox-core.server";

export type DigiLockerDocType = "aadhaar" | "pan" | "driving_license";

export interface DigiLockerSession {
  sessionId: string;
  authorizationUrl: string;
}

/** Start a DigiLocker consent session; returns the URL to redirect the host to. */
export async function initiateDigiLocker(input: {
  redirectUrl: string;
  docTypes: DigiLockerDocType[];
}): Promise<DigiLockerSession> {
  const token = await sandboxAuth();
  const res = await fetch(`${sandboxBaseUrl()}/kyc/digilocker/sessions/init`, {
    method: "POST",
    headers: {
      Authorization: token,
      "x-api-key": sandboxKey(),
      "x-api-version": SANDBOX_API_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      "@entity": "in.co.sandbox.kyc.digilocker.session.request",
      flow: "signin",
      redirect_url: input.redirectUrl,
      doc_types: input.docTypes,
      // 24h consent window.
      consent_expiry: Date.now() + 24 * 60 * 60 * 1000,
    }),
  });
  const json: any = await res.json().catch(() => ({}));
  const url = json?.data?.authorization_url;
  const sessionId = json?.data?.session_id;
  if (!res.ok || !url || !sessionId) {
    throw new Error(json?.message || "Could not start DigiLocker verification.");
  }
  return { sessionId: String(sessionId), authorizationUrl: String(url) };
}

export interface DigiLockerStatus {
  status: string; // e.g. "pending" | "completed" | "expired"
  name: string | null;
  dlNumber: string | null;
  documents: string[];
}

/** Poll the session after the host returns from DigiLocker; returns the
 *  verified summary (name + which docs were shared). */
export async function digiLockerStatus(sessionId: string): Promise<DigiLockerStatus> {
  const token = await sandboxAuth();
  const res = await fetch(`${sandboxBaseUrl()}/kyc/digilocker/sessions/status`, {
    method: "POST",
    headers: {
      Authorization: token,
      "x-api-key": sandboxKey(),
      "x-api-version": SANDBOX_API_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      "@entity": "in.co.sandbox.kyc.digilocker.session.status.request",
      session_id: sessionId,
    }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || "Could not read DigiLocker status.");
  const data = json?.data ?? {};
  const docs: string[] = Array.isArray(data?.documents)
    ? data.documents.map((d: any) => String(d?.doc_type || d?.type || "")).filter(Boolean)
    : [];
  const dl = Array.isArray(data?.documents)
    ? data.documents.find((d: any) => String(d?.doc_type || "").includes("driving"))
    : null;
  return {
    status: String(data?.status || "pending"),
    name: data?.name ?? dl?.name ?? null,
    dlNumber: dl?.document_number ?? dl?.number ?? null,
    documents: docs,
  };
}
