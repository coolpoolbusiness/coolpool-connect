// Export EVERYTHING from Appwrite (read-only) into ./dump for Postgres import.
// - users incl. password hashes (argon2) → zero re-registration migration
// - every collection as JSONL
// - every storage file (bytes) + manifest
// Run: node --env-file=.env scripts/pg-migration/export-appwrite.mjs
import { Client, Databases, Users, Storage, Query } from "node-appwrite";
import { mkdirSync, writeFileSync, appendFileSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const DUMP = join(here, "dump");

const env = (n, fb = "") => (process.env[n] ?? fb).trim();
const endpoint = env("VITE_APPWRITE_ENDPOINT") || env("APPWRITE_ENDPOINT");
const project = env("VITE_APPWRITE_PROJECT_ID") || env("APPWRITE_PROJECT_ID");
const apiKey = env("APPWRITE_API_KEY");
const db = env("VITE_APPWRITE_DATABASE_ID") || env("APPWRITE_DATABASE_ID");
if (!endpoint || !project || !apiKey || !db) {
  console.error("Missing Appwrite env"); process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(project).setKey(apiKey);
const databases = new Databases(client);
const users = new Users(client);
const storage = new Storage(client);

// table name → Appwrite collection id
const COLLECTIONS = {
  trips: env("VITE_APPWRITE_COLLECTION_TRIPS"),
  trip_stops: env("VITE_APPWRITE_COLLECTION_TRIP_STOPS"),
  trip_seat_reservations: env("VITE_APPWRITE_COLLECTION_TRIP_SEAT_RESERVATIONS"),
  bookings: env("VITE_APPWRITE_COLLECTION_BOOKINGS"),
  user_roles: env("VITE_APPWRITE_COLLECTION_USER_ROLES"),
  pricing_rules: env("VITE_APPWRITE_COLLECTION_PRICING_RULES"),
  profiles: env("VITE_APPWRITE_COLLECTION_PROFILES"),
  drivers: env("VITE_APPWRITE_COLLECTION_DRIVERS"),
  vehicles: env("VITE_APPWRITE_COLLECTION_VEHICLES"),
  hero_banners: env("VITE_APPWRITE_COLLECTION_HERO_BANNERS"),
  bank_accounts: env("VITE_APPWRITE_COLLECTION_BANK_ACCOUNTS", "coolpool_bank_accounts"),
  payout_requests: env("VITE_APPWRITE_COLLECTION_PAYOUT_REQUESTS", "coolpool_payout_requests"),
  reviews: env("VITE_APPWRITE_COLLECTION_REVIEWS"),
  trip_shares: env("VITE_APPWRITE_COLLECTION_TRIP_SHARES", "coolpool_trip_shares"),
  deleted_accounts: env("VITE_APPWRITE_COLLECTION_DELETED_ACCOUNTS", "coolpool_deleted_accounts"),
  otp_codes: env("VITE_APPWRITE_COLLECTION_OTP_CODES", "coolpool_otp_codes"),
  counters: env("VITE_APPWRITE_COLLECTION_COUNTERS", "coolpool_counters"),
};

const BUCKETS = {
  driver_docs: env("VITE_APPWRITE_DRIVER_DOCS_BUCKET_ID", "69f312e500186db2d785"),
  banners: env("VITE_APPWRITE_BANNERS_BUCKET_ID", "coolpool_banners_bucket"),
};

if (existsSync(DUMP)) rmSync(DUMP, { recursive: true });
mkdirSync(join(DUMP, "files"), { recursive: true });
const manifest = { exportedAt: new Date().toISOString(), endpoint, counts: {}, files: {}, hashCheck: null };

// ── Users (with password hashes) ────────────────────────────────────────────
{
  const out = join(DUMP, "users.jsonl");
  writeFileSync(out, "");
  let offset = 0, total = 0, withHash = 0, sample = null;
  for (;;) {
    const page = await users.list([Query.limit(100), Query.offset(offset)]);
    for (const u of page.users) {
      appendFileSync(out, JSON.stringify(u) + "\n");
      if (u.password) { withHash++; if (!sample) sample = { hash: u.hash, len: u.password.length }; }
    }
    total += page.users.length;
    if (page.users.length < 100) break;
    offset += 100;
  }
  manifest.counts.users = total;
  manifest.hashCheck = { usersWithHash: withHash, totalUsers: total, algo: sample?.hash ?? null };
  console.log(`users: ${total} exported, ${withHash} with password hash (algo: ${sample?.hash ?? "NONE"})`);
}

// ── Collections ─────────────────────────────────────────────────────────────
for (const [table, colId] of Object.entries(COLLECTIONS)) {
  if (!colId) { console.log(`${table}: SKIPPED (no collection id)`); continue; }
  const out = join(DUMP, `${table}.jsonl`);
  writeFileSync(out, "");
  let offset = 0, total = 0;
  try {
    for (;;) {
      const page = await databases.listDocuments(db, colId, [Query.limit(100), Query.offset(offset)]);
      for (const d of page.documents) appendFileSync(out, JSON.stringify(d) + "\n");
      total += page.documents.length;
      if (page.documents.length < 100) break;
      offset += 100;
    }
    manifest.counts[table] = total;
    console.log(`${table}: ${total}`);
  } catch (e) {
    manifest.counts[table] = `ERROR: ${e.message}`;
    console.log(`${table}: ERROR ${e.message}`);
  }
}

// ── Files ───────────────────────────────────────────────────────────────────
for (const [prefix, bucketId] of Object.entries(BUCKETS)) {
  const dir = join(DUMP, "files", prefix);
  mkdirSync(dir, { recursive: true });
  const metaOut = join(DUMP, `files_${prefix}.jsonl`);
  writeFileSync(metaOut, "");
  let total = 0, bytes = 0;
  try {
    let cursor = null;
    for (;;) {
      const queries = [Query.limit(100)];
      if (cursor) queries.push(Query.cursorAfter(cursor));
      const page = await storage.listFiles(bucketId, queries);
      for (const f of page.files) {
        appendFileSync(metaOut, JSON.stringify({ ...f, bucket: prefix }) + "\n");
        const buf = await storage.getFileDownload(bucketId, f.$id);
        writeFileSync(join(dir, f.$id), Buffer.from(buf));
        total++; bytes += f.sizeOriginal ?? 0;
      }
      if (page.files.length < 100) break;
      cursor = page.files[page.files.length - 1].$id;
    }
    manifest.files[prefix] = { count: total, bytes };
    console.log(`files/${prefix}: ${total} files, ${(bytes / 1024 / 1024).toFixed(1)} MB`);
  } catch (e) {
    manifest.files[prefix] = `ERROR: ${e.message}`;
    console.log(`files/${prefix}: ERROR ${e.message}`);
  }
}

writeFileSync(join(DUMP, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log("EXPORT COMPLETE →", DUMP);
