// SERVER-ONLY. Phone+PIN auth against Postgres — replaces Appwrite account
// login. Verifies the argon2 hashes migrated verbatim from Appwrite, so every
// existing user keeps their PIN (no re-registration).
import crypto from "node:crypto";
import argon2 from "argon2";
import { queryOne } from "./db.server";

export interface DbUser {
  id: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  password_hash: string | null;
  prefs: Record<string, unknown>;
  labels: string[];
}

/** Exactly the derivation the app has always used (was crypto.subtle in the
 *  browser; node:crypto here gives byte-identical SHA-256). */
export function derivePassword(phoneE164: string, rawPin: string): string {
  const digits = phoneE164.replace(/[^\d]/g, "");
  const hex = crypto.createHash("sha256").update(`coolpool:${digits}:${rawPin}`).digest("hex");
  return `cp_${hex}`;
}

/** Synthetic email fallback for accounts that log in purely by phone. */
export function phoneToEmail(phoneE164: string): string {
  return `u${phoneE164.replace(/[^\d]/g, "")}@phone.coolpool.in`;
}

/** Resolve a user by phone number, then by synthetic phone-email fallback. */
export async function findUserByPhone(phoneE164: string): Promise<DbUser | null> {
  const digits = phoneE164.replace(/[^\d]/g, "");
  const byPhone = await queryOne<DbUser>(
    `SELECT id, email, phone, name, password_hash, prefs, labels
       FROM users WHERE regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') = $1 LIMIT 1`,
    [digits],
  );
  if (byPhone) return byPhone;
  return queryOne<DbUser>(
    `SELECT id, email, phone, name, password_hash, prefs, labels
       FROM users WHERE email = $1 LIMIT 1`,
    [phoneToEmail(phoneE164)],
  );
}

export interface LoginResult {
  ok: boolean;
  user?: DbUser;
  reason?: "not_found" | "no_password" | "bad_credentials";
}

/** The Postgres equivalent of signInWithPhonePassword. */
export async function loginWithPhonePin(phoneE164: string, pin: string): Promise<LoginResult> {
  const user = await findUserByPhone(phoneE164);
  if (!user) return { ok: false, reason: "not_found" };
  if (!user.password_hash) return { ok: false, reason: "no_password" }; // e.g. Google-only account
  const secret = derivePassword(phoneE164, pin);
  const valid = await argon2.verify(user.password_hash, secret).catch(() => false);
  return valid ? { ok: true, user } : { ok: false, reason: "bad_credentials" };
}
