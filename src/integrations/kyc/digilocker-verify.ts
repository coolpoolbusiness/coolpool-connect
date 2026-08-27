// DigiLocker driving-licence verification exposed to the client via
// createServerFn. Server-only modules are imported INSIDE the handlers so they
// never enter the client bundle (same rule as bank-verify.ts / aadhaar-verify.ts).
//
// Flow: initiate -> redirect the host to DigiLocker -> host consents and returns
// -> poll status for the verified name + licence number.
import { createServerFn } from "@tanstack/react-start";

/** Step 1 — start a DigiLocker session for the driving licence; returns the URL
 *  to redirect the host to. { configured:false } when the provider isn't set up. */
export const initiateDigiLockerServer = createServerFn({ method: "POST" })
  .inputValidator((input: { redirectUrl: string }) => {
    const redirectUrl = String(input?.redirectUrl || "").trim();
    if (!/^https?:\/\/.+/.test(redirectUrl)) throw new Error("Invalid redirect URL.");
    return { redirectUrl };
  })
  .handler(
    async ({
      data,
    }): Promise<
      { configured: false } | { configured: true; sessionId: string; authorizationUrl: string }
    > => {
      const { kycConfigured } = await import("./sandbox-core.server");
      if (!kycConfigured()) return { configured: false };
      const { initiateDigiLocker } = await import("./digilocker.server");
      const s = await initiateDigiLocker({
        redirectUrl: data.redirectUrl,
        docTypes: ["driving_license"],
      });
      return { configured: true, sessionId: s.sessionId, authorizationUrl: s.authorizationUrl };
    },
  );

/** Step 2 — after the host returns from DigiLocker, read the verified summary. */
export const digiLockerStatusServer = createServerFn({ method: "POST" })
  .inputValidator((input: { sessionId: string }) => {
    const sessionId = String(input?.sessionId || "").trim();
    if (!sessionId) throw new Error("Missing DigiLocker session.");
    return { sessionId };
  })
  .handler(
    async ({
      data,
    }): Promise<{
      status: string;
      name: string | null;
      dlNumber: string | null;
      documents: string[];
    }> => {
      const { digiLockerStatus } = await import("./digilocker.server");
      return digiLockerStatus(data.sessionId);
    },
  );
