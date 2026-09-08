/**
 * Human-readable member ID: YYMM-CP{ROLE}{GENDER}-NNNN, e.g. "2606-CPGM-0001".
 *   YY/MM  — account creation year/month (immutable once assigned)
 *   CP     — fixed brand literal
 *   ROLE   — "H" (host) or "G" (guest); assigned once at signup, never
 *            re-derived if a guest later becomes a host too.
 *   GENDER — "M" / "F" / "X" (not provided)
 *   NNNN   — global monotonic sequence (platform-wide, not per-bucket),
 *            zero-padded to 4 digits; grows past 4 digits naturally if ever
 *            needed instead of colliding.
 *
 * Codes minted before this format change look like "2606cpgm0001" (no
 * dashes, lowercase) — those are left as-is in storage/display; only newly
 * minted codes use this format.
 */

export type MemberCodeRole = "guest" | "host";

/** Role letters an admin can stamp onto a member code (beyond signup H/G). */
export type MemberRoleChar = "A" | "H" | "G" | "D" | "E";

export const MEMBER_ROLE_OPTIONS: { char: MemberRoleChar; label: string }[] = [
  { char: "A", label: "Admin" },
  { char: "H", label: "Host" },
  { char: "G", label: "Guest" },
  { char: "D", label: "Driver" },
  { char: "E", label: "Employee" },
];

const ROLE_LABEL: Record<string, string> = {
  A: "Admin",
  H: "Host",
  G: "Guest",
  D: "Driver",
  E: "Employee",
};

/** Human label for a member code's role+gender letters, e.g. "2606-CPAM-0007" → "Admin · Male". */
export function describeMemberCode(code: string | null | undefined): string | null {
  const m = /^\d{4}-CP([A-Za-z])([A-Za-z])-\d{3,}$/.exec(String(code ?? "").trim());
  if (!m) return null;
  const role = ROLE_LABEL[m[1].toUpperCase()] ?? m[1].toUpperCase();
  const g = m[2].toUpperCase();
  const gender = g === "M" ? "Male" : g === "F" ? "Female" : "—";
  return `${role} · ${gender}`;
}

/**
 * Re-stamp the role+gender letters on an existing member code, keeping the
 * YYMM prefix and the sequence number. Returns null if `existing` isn't in the
 * current dashed format (older lowercase codes are left untouched by callers).
 */
export function reassignMemberCode(
  existing: string,
  roleChar: MemberRoleChar,
  gender: string | null | undefined,
): string | null {
  const m = /^(\d{4})-CP[A-Za-z]{2}-(\d{3,})$/.exec(String(existing ?? "").trim());
  if (!m) return null;
  return `${m[1]}-CP${roleChar}${normalizeGenderChar(gender)}-${m[2]}`;
}

export function normalizeGenderChar(gender: string | null | undefined): "M" | "F" | "X" {
  const g = String(gender ?? "")
    .trim()
    .toLowerCase();
  if (g === "male" || g === "m") return "M";
  if (g === "female" || g === "f") return "F";
  return "X";
}

export function formatMemberCode(input: {
  createdAt: Date;
  role: MemberCodeRole;
  gender: string | null | undefined;
  sequence: number;
}): string {
  const yy = String(input.createdAt.getUTCFullYear()).slice(-2);
  const mm = String(input.createdAt.getUTCMonth() + 1).padStart(2, "0");
  const roleChar = input.role === "host" ? "H" : "G";
  const genderChar = normalizeGenderChar(input.gender);
  const seq = String(Math.max(0, input.sequence));
  const seqPadded = seq.length >= 4 ? seq : seq.padStart(4, "0");
  return `${yy}${mm}-CP${roleChar}${genderChar}-${seqPadded}`;
}
