#!/usr/bin/env node
// Creates two Appwrite collections for Phase 2 trust features:
//   coolpool_member_verifications — private selfie verification (one per user)
//   coolpool_no_show_reports      — guest-no-show GPS photo proof
// Idempotent. Run: node --env-file=.env scripts/create-verification-collections.mjs
const endpoint = process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.VITE_APPWRITE_DATABASE_ID;
for (const [k, v] of Object.entries({ VITE_APPWRITE_ENDPOINT: endpoint, VITE_APPWRITE_PROJECT_ID: projectId, APPWRITE_API_KEY: apiKey, VITE_APPWRITE_DATABASE_ID: databaseId })) {
  if (!v) { console.error(`Missing ${k}`); process.exit(1); }
}
const base = endpoint.replace(/\/$/, "");
const headers = { "Content-Type": "application/json", "X-Appwrite-Project": projectId, "X-Appwrite-Key": apiKey };
const api = async (method, path, body) => {
  const res = await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { ok: res.ok, status: res.status, json };
};
const okOrExists = (r, label) => {
  if (r.ok) { console.log(`  ✓ ${label}`); return true; }
  if (r.status === 409) { console.log(`  • ${label} exists — skip`); return true; }
  console.error(`  ✗ ${label} (${r.status}):`, r.json?.message || r.json); return false;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function collection(collectionId, name, attrs) {
  console.log(`\n${name} (${collectionId})`);
  // documentSecurity: users read/write their OWN rows; admin uses API key.
  const col = await api("POST", `/databases/${databaseId}/collections`, {
    collectionId, name,
    permissions: ['create("users")'], // any logged-in user can create their row
    documentSecurity: true,
  });
  okOrExists(col, "collection");
  for (const [type, body] of attrs) {
    const r = await api("POST", `/databases/${databaseId}/collections/${collectionId}/attributes/${type}`, body);
    okOrExists(r, `attr ${body.key} (${type})`);
    await sleep(400);
  }
}

await collection("coolpool_member_verifications", "Coolpool Member Verifications", [
  ["string", { key: "user_id", size: 64, required: true }],
  ["string", { key: "selfie_file_id", size: 64, required: false }],
  ["string", { key: "status", size: 16, required: false, default: "pending" }], // pending|approved|rejected
  ["string", { key: "display_name", size: 128, required: false }],
  ["string", { key: "phone", size: 32, required: false }],
  ["datetime", { key: "submitted_at", required: false }],
  ["datetime", { key: "reviewed_at", required: false }],
  ["string", { key: "admin_note", size: 512, required: false }],
]);

await collection("coolpool_no_show_reports", "Coolpool No-Show Reports", [
  ["string", { key: "booking_id", size: 64, required: true }],
  ["string", { key: "trip_id", size: 64, required: true }],
  ["string", { key: "host_id", size: 64, required: true }],
  ["string", { key: "traveler_id", size: 64, required: false }],
  ["string", { key: "photo_file_id", size: 64, required: true }],
  ["float", { key: "lat", required: false }],
  ["float", { key: "lng", required: false }],
  ["datetime", { key: "captured_at", required: false }],
  ["string", { key: "status", size: 16, required: false, default: "open" }], // open|resolved|dismissed
  ["string", { key: "passenger_name", size: 256, required: false }],
  ["string", { key: "admin_note", size: 512, required: false }],
]);

console.log("\nDone.");
