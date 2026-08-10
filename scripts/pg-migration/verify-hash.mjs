// Prove exported Appwrite argon2 hashes verify locally → zero re-login migration.
// Creates a throwaway user with a known password, exports its hash, verifies, deletes.
import { Client, Users, ID } from "node-appwrite";
import argon2 from "argon2";

const env = (n) => (process.env[n] ?? "").trim();
const users = new Users(new Client()
  .setEndpoint(env("VITE_APPWRITE_ENDPOINT"))
  .setProject(env("VITE_APPWRITE_PROJECT_ID"))
  .setKey(env("APPWRITE_API_KEY")));

const KNOWN = "rehearsal-password-1234";
const u = await users.create(ID.unique(), "hash-test@migration.local", undefined, KNOWN, "Hash Test");
try {
  const fetched = await users.get(u.$id);
  console.log("algo:", fetched.hash, "| hash prefix:", (fetched.password || "").slice(0, 30));
  const ok = await argon2.verify(fetched.password, KNOWN);
  const bad = await argon2.verify(fetched.password, "wrong-password").catch(() => false);
  console.log("verify(correct password):", ok);
  console.log("verify(wrong password):", bad);
  console.log(ok && !bad ? "✅ ZERO-RELOGIN MIGRATION PROVEN" : "❌ HASH MISMATCH");
} finally {
  await users.delete(u.$id);
  console.log("throwaway user deleted");
}
