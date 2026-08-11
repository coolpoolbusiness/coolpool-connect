import { account } from "@/integrations/appwrite/client";
import {
  adminCreatePayoutEntry,
  adminCreateUser,
  adminGetPrivateFile,
  adminGetUserCodes,
  adminListMemberVerifications,
  adminListNoShowReports,
  adminListPayoutRequests,
  adminResetPassword,
  adminSetMemberVerification,
  adminSetNoShowStatus,
  adminUpdatePayoutRequestStatus,
} from "@/integrations/appwrite/account-server";
import type { PayoutRequest, PayoutStatus } from "@/lib/domain";

// Client helpers: mint a short-lived JWT proving the caller is signed in, then
// call the admin-only server functions (which re-verify admin server-side).

function withTimeout<T>(promise: Promise<T>, message: string, ms = 15000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function resetUserPassword(userId: string, newPassword: string): Promise<void> {
  const { jwt } = await account.createJWT();
  await adminResetPassword({ data: { jwt, userId, newPassword } });
}

export async function createUserAsAdmin(input: {
  name: string;
  email: string;
  phone?: string;
  password: string;
  role: "host" | "guest";
  gender?: string;
  licenseNumber?: string;
}): Promise<{ userId: string }> {
  const { jwt } = await account.createJWT();
  const res = await adminCreateUser({ data: { jwt, ...input } });
  return { userId: res.userId };
}

export async function listPayoutRequestsAsAdmin(limit = 500): Promise<PayoutRequest[]> {
  const { jwt } = await account.createJWT();
  return adminListPayoutRequests({ data: { jwt, limit } });
}

/** Batch lookup of member codes/gender for a list of user ids (e.g. for the admin tables). */
export async function getUserCodesAsAdmin(
  userIds: string[],
): Promise<Array<{ userId: string; memberCode: string | null; gender: string | null }>> {
  if (userIds.length === 0) return [];
  const { jwt } = await account.createJWT();
  return adminGetUserCodes({ data: { jwt, userIds } });
}

export async function updatePayoutRequestAsAdmin(
  requestId: string,
  input: {
    status: PayoutStatus;
    paymentReference?: string | null;
    adminNote?: string | null;
    deduction?: number | null;
    paidAmount?: number | null;
  },
): Promise<PayoutRequest> {
  const { jwt } = await account.createJWT();
  return withTimeout(
    adminUpdatePayoutRequestStatus({
      data: {
        jwt,
        requestId,
        status: input.status,
        paymentReference: input.paymentReference,
        adminNote: input.adminNote,
        deduction: input.deduction,
        paidAmount: input.paidAmount,
      },
    }),
    "Payout update is taking too long. Please reload and try again.",
  );
}

/** Admin records a payment made to a host directly — the "+ Add payment" ledger row. */
export async function createPayoutEntryAsAdmin(input: {
  driverUserId: string;
  amount: number;
  tripId?: string | null;
  deduction?: number;
  status?: PayoutStatus;
  paymentReference?: string | null;
  adminNote?: string | null;
  paidAmount?: number | null;
}): Promise<PayoutRequest> {
  const { jwt } = await account.createJWT();
  return withTimeout(
    adminCreatePayoutEntry({ data: { jwt, ...input } }),
    "Recording the payment is taking too long. Please reload and try again.",
  );
}

// ── Phase 2 verification admin wrappers ──────────────────────────────────────
export async function adminGetPrivateFileUrl(fileId: string): Promise<string> {
  const { jwt } = await account.createJWT();
  const res = await adminGetPrivateFile({ data: { jwt, fileId } });
  return res.dataUrl;
}

export async function listMemberVerificationsAsAdmin(): Promise<any[]> {
  const { jwt } = await account.createJWT();
  return adminListMemberVerifications({ data: { jwt } });
}

export async function setMemberVerificationAsAdmin(
  userId: string,
  status: "approved" | "rejected" | "pending",
  note?: string | null,
): Promise<void> {
  const { jwt } = await account.createJWT();
  await adminSetMemberVerification({ data: { jwt, userId, status, note } });
}

export async function listNoShowReportsAsAdmin(): Promise<any[]> {
  const { jwt } = await account.createJWT();
  return adminListNoShowReports({ data: { jwt } });
}

export async function setNoShowStatusAsAdmin(
  reportId: string,
  status: "open" | "resolved" | "dismissed",
  note?: string | null,
): Promise<void> {
  const { jwt } = await account.createJWT();
  await adminSetNoShowStatus({ data: { jwt, reportId, status, note } });
}
