// PAN verification via Sandbox.co.in, exposed to the client via createServerFn.
// Instant and automatic — no OTP, no manual approval. The server-only sandbox
// module is imported INSIDE the handler so it never enters the client bundle
// (same rule as bank-verify.ts / aadhaar-verify.ts).
//
// Docs: POST /kyc/pan/verify
//   body: { pan, name_as_per_pan, date_of_birth?, consent:"Y", reason }
//   -> data: { status:"valid"|..., name_as_per_pan_match:boolean, category, ... }
import { createServerFn } from "@tanstack/react-start";

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export const verifyPanServer = createServerFn({ method: "POST" })
  .inputValidator((input: { pan: string; name: string; dob?: string }) => {
    const pan = String(input?.pan || "").toUpperCase().replace(/\s/g, "");
    const name = String(input?.name || "").trim().slice(0, 100);
    const dob = input?.dob ? String(input.dob).trim() : undefined;
    if (!PAN_RE.test(pan)) throw new Error("Enter a valid 10-character PAN (e.g. ABCDE1234F).");
    if (!name) throw new Error("Enter the name exactly as printed on the PAN card.");
    return { pan, name, dob };
  })
  .handler(
    async ({
      data,
    }): Promise<
      | { configured: false }
      | { configured: true; valid: boolean; nameMatch: boolean | null; category: string | null }
    > => {
      const { kycConfigured, sandboxAuth, sandboxBaseUrl, sandboxKey, SANDBOX_API_VERSION } =
        await import("./sandbox-core.server");
      if (!kycConfigured()) return { configured: false };

      const token = await sandboxAuth();
      const body: Record<string, unknown> = {
        "@entity": "in.co.sandbox.kyc.pan_verification.request",
        pan: data.pan,
        name_as_per_pan: data.name,
        consent: "Y",
        reason: "Driver onboarding identity verification for Coolpool",
      };
      if (data.dob) body.date_of_birth = data.dob;

      const res = await fetch(`${sandboxBaseUrl()}/kyc/pan/verify`, {
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
      if (!res.ok) {
        throw new Error(
          json?.message || json?.data?.message || `PAN verification failed (${res.status}).`,
        );
      }
      const d = json?.data ?? json;
      const valid = String(d?.status || "").toLowerCase() === "valid";
      const nameMatch =
        typeof d?.name_as_per_pan_match === "boolean" ? d.name_as_per_pan_match : null;
      return { configured: true, valid, nameMatch, category: d?.category ?? null };
    },
  );
