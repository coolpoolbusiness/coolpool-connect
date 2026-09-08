#!/usr/bin/env node
// Creates two admin-support collections (idempotent):
//   coolpool_admin_log      — audit trail of admin actions (server-written only)
//   coolpool_contact_messages — messages from the public Contact form
// Both are read/written server-side with the API key, so no user permissions.
// Run: node --env-file=.env scripts/create-admin-collections.mjs
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

async function make(collectionId, name, permissions, attrs, indexes) {
  console.log(`\n${name} (${collectionId})`);
  okOrExists(await api("POST", `/databases/${databaseId}/collections`, {
    collectionId, name, permissions, documentSecurity: false,
  }), "collection");
  for (const [type, body] of attrs) {
    okOrExists(await api("POST", `/databases/${databaseId}/collections/${collectionId}/attributes/${type}`, body), `attr ${body.key} (${type})`);
    await sleep(400);
  }
  console.log("  … waiting for attributes to settle before indexing");
  await sleep(2500);
  for (const idx of (indexes || [])) {
    okOrExists(await api("POST", `/databases/${databaseId}/collections/${collectionId}/indexes`, idx), `index ${idx.key}`);
    await sleep(600);
  }
}

await make("coolpool_admin_log", "Coolpool Admin Log", [], [
  ["string", { key: "admin_id", size: 64, required: false }],
  ["string", { key: "admin_name", size: 128, required: false }],
  ["string", { key: "action", size: 64, required: true }],
  ["string", { key: "target_type", size: 32, required: false }],
  ["string", { key: "target_id", size: 64, required: false }],
  ["string", { key: "target_label", size: 256, required: false }],
  ["string", { key: "details", size: 512, required: false }],
], [
  { key: "idx_created", type: "key", attributes: ["$createdAt"], orders: ["DESC"] },
]);

await make(
  "coolpool_contact_messages",
  "Coolpool Contact Messages",
  ['create("any")'], // the public contact form (may be logged out) submits here
  [
    ["string", { key: "name", size: 128, required: true }],
    ["string", { key: "email", size: 256, required: false }],
    ["string", { key: "subject", size: 128, required: false }],
    ["string", { key: "message", size: 4000, required: true }],
    ["string", { key: "status", size: 16, required: false, default: "open" }],
  ],
  [{ key: "idx_status", type: "key", attributes: ["status"] }],
);

console.log("\nDone.");
