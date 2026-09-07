#!/usr/bin/env node
// Creates the Appwrite collection that powers Messages / Inbox:
//   coolpool_messages — one doc per chat message between a guest and a host
//                       about a specific trip (after the guest has booked).
// Document security: each message grants read+update to BOTH participants, so
// the client SDK can list a user's own threads. Idempotent.
// Run: node --env-file=.env scripts/create-messages-collection.mjs
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

const collectionId = "coolpool_messages";
console.log(`\nCoolpool Messages (${collectionId})`);
const col = await api("POST", `/databases/${databaseId}/collections`, {
  collectionId,
  name: "Coolpool Messages",
  permissions: ['create("users")'], // any logged-in user can send a message
  documentSecurity: true,
});
okOrExists(col, "collection");

const attrs = [
  ["string", { key: "thread_id", size: 128, required: true }],
  ["string", { key: "trip_id", size: 64, required: true }],
  ["string", { key: "host_user_id", size: 64, required: true }],
  ["string", { key: "guest_user_id", size: 64, required: true }],
  ["string", { key: "sender_user_id", size: 64, required: true }],
  ["string", { key: "body", size: 2000, required: true }],
  ["boolean", { key: "read_by_host", required: false, default: false }],
  ["boolean", { key: "read_by_guest", required: false, default: false }],
  ["string", { key: "trip_route", size: 256, required: false }],
  ["string", { key: "host_name", size: 128, required: false }],
  ["string", { key: "guest_name", size: 128, required: false }],
];
for (const [type, body] of attrs) {
  const r = await api("POST", `/databases/${databaseId}/collections/${collectionId}/attributes/${type}`, body);
  okOrExists(r, `attr ${body.key} (${type})`);
  await sleep(400);
}

// Indexes need their attributes to be "available" first.
console.log("  … waiting for attributes to settle before indexing");
await sleep(2500);
const indexes = [
  { key: "idx_thread", type: "key", attributes: ["thread_id"] },
  { key: "idx_host", type: "key", attributes: ["host_user_id"] },
  { key: "idx_guest", type: "key", attributes: ["guest_user_id"] },
];
for (const idx of indexes) {
  const r = await api("POST", `/databases/${databaseId}/collections/${collectionId}/indexes`, idx);
  okOrExists(r, `index ${idx.key}`);
  await sleep(600);
}

console.log("\nDone.");
