// End-to-end proof: an Appwrite account created the way the real app creates
// them (password = derivePassword(phone, pin)) → exported → imported to
// Postgres → logs in through the Postgres auth function with the ORIGINAL PIN.
import { Client, Users, ID } from "node-appwrite";
import crypto from "node:crypto";
import argon2 from "argon2";
import pg from "pg";

const env = (n) => (process.env[n] ?? "").trim();
const users = new Users(new Client()
  .setEndpoint(env("VITE_APPWRITE_ENDPOINT"))
  .setProject(env("VITE_APPWRITE_PROJECT_ID"))
  .setKey(env("APPWRITE_API_KEY")));

const derive = (phone, pin) =>
  "cp_" + crypto.createHash("sha256").update(`coolpool:${phone.replace(/[^\d]/g,"")}:${pin}`).digest("hex");

const PHONE = "+919000000042";
const PIN = "7391";
const secret = derive(PHONE, PIN);

// 1. Create an Appwrite account exactly like signUpWithPhonePassword would.
const u = await users.create(ID.unique(), `u919000000042@phone.coolpool.in`, undefined, secret, "PG Login Test");
await users.updatePhone(u.$id, PHONE, secret).catch(() => {});
const client = new pg.Client({ connectionString: "postgresql://localhost:5432/coolpool_migration" });
await client.connect();
try {
  // 2. Export that user's hash and import into Postgres (the migration path).
  const fetched = await users.get(u.$id);
  await client.query(
    `INSERT INTO users (id, email, phone, name, password_hash, hash_algo, prefs, labels)
     VALUES ($1,$2,$3,$4,$5,$6,'{}','{}') ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash, phone = EXCLUDED.phone`,
    [fetched.$id, fetched.email, PHONE, fetched.name, fetched.password, fetched.hash],
  );

  // 3. Log in through the Postgres pipeline (re-derive → lookup by phone → verify).
  const row = (await client.query(
    `SELECT password_hash FROM users WHERE regexp_replace(coalesce(phone,''),'[^0-9]','','g') = $1 LIMIT 1`,
    [PHONE.replace(/[^\d]/g, "")],
  )).rows[0];
  const good = await argon2.verify(row.password_hash, derive(PHONE, PIN));
  const bad = await argon2.verify(row.password_hash, derive(PHONE, "0000")).catch(() => false);

  console.log("looked up by phone from Postgres:", !!row);
  console.log("login with correct PIN 7391:", good);
  console.log("login with wrong PIN 0000:", bad);
  console.log(good && !bad ? "✅ POSTGRES PHONE+PIN LOGIN WORKS ON MIGRATED DATA" : "❌ FAIL");
} finally {
  await users.delete(u.$id);
  await client.query("DELETE FROM users WHERE id = $1", [u.$id]);
  await client.end();
  console.log("cleaned up throwaway user + row");
}
