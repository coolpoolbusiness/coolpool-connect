// Import the ./dump produced by export-appwrite.mjs into PostgreSQL.
// Idempotent: applies schema.sql, truncates, reloads. Point PG_URL at the
// rehearsal DB locally, or at RDS on migration day.
// Run: PG_URL=postgresql://localhost:5432/coolpool_migration node scripts/pg-migration/import-postgres.mjs
import pg from "pg";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const DUMP = join(here, "dump");
const PG_URL = process.env.PG_URL || "postgresql://localhost:5432/coolpool_migration";

const client = new pg.Client({ connectionString: PG_URL });
await client.connect();

const jsonl = (name) => {
  const p = join(DUMP, `${name}.jsonl`);
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
};
const ts = (v) => (v ? new Date(v) : null);
const num = (v) => (v == null ? null : Number(v));

console.log("applying schema…");
await client.query(readFileSync(join(here, "schema.sql"), "utf8"));

const TABLES = [
  "users","trips","trip_stops","trip_seat_reservations","bookings","payout_requests",
  "bank_accounts","otp_codes","counters","drivers","vehicles","profiles","user_roles",
  "pricing_rules","reviews","hero_banners","trip_shares","deleted_accounts","files","sessions",
];
await client.query(`TRUNCATE ${TABLES.join(", ")} CASCADE`);

async function insert(table, cols, rows, mapper) {
  if (!rows.length) { console.log(`${table}: 0`); return; }
  const ph = (r) => cols.map((_, i) => `$${r * cols.length + i + 1}`).join(",");
  // batch in chunks of 50 rows
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const values = chunk.flatMap(mapper);
    const tuples = chunk.map((_, r) => `(${ph(r)})`).join(",");
    await client.query(
      `INSERT INTO ${table} (${cols.join(",")}) VALUES ${tuples} ON CONFLICT (id) DO NOTHING`,
      values,
    );
  }
  console.log(`${table}: ${rows.length}`);
}

// ── users ───────────────────────────────────────────────────────────────────
await insert(
  "users",
  ["id","email","phone","name","password_hash","hash_algo","hash_options","prefs","labels","email_verified","phone_verified","status","registered_at","raw"],
  jsonl("users"),
  (u) => [
    u.$id, u.email || null, u.phone || null, u.name || null,
    u.password || null, u.hash || null, JSON.stringify(u.hashOptions ?? null),
    JSON.stringify(u.prefs ?? {}), u.labels ?? [],
    !!u.emailVerification, !!u.phoneVerification, u.status !== false,
    ts(u.registration || u.$createdAt), JSON.stringify(u),
  ],
);

// ── trips ───────────────────────────────────────────────────────────────────
await insert(
  "trips",
  ["id","host_id","from_location","from_lat","from_lng","to_location","to_lat","to_lng","polyline","total_distance_km","total_price","price_per_km","total_seats","departure_at","arrival_at","duration_minutes","host_display_name","host_rating","host_rating_count","vehicle_model","vehicle_color","status","notes","vehicle_id","assigned_driver_id","seat_config","trip_code","segment_prices","current_lat","current_lng","current_heading","location_updated_at","active","created_at"],
  jsonl("trips"),
  (d) => [
    d.$id, d.host_id, d.from_location, num(d.from_lat), num(d.from_lng), d.to_location,
    num(d.to_lat), num(d.to_lng), d.polyline ?? null, num(d.total_distance_km),
    num(d.total_price), num(d.price_per_km), num(d.total_seats), ts(d.departure_at),
    ts(d.arrival_at), num(d.duration_minutes), d.host_display_name ?? null,
    num(d.host_rating), num(d.host_rating_count), d.vehicle_model ?? null,
    d.vehicle_color ?? null, d.status ?? "scheduled", d.notes ?? null,
    d.vehicle_id ?? null, d.assigned_driver_id ?? null, d.seat_config ?? [],
    d.trip_code ?? null, d.segment_prices ?? null, num(d.current_lat), num(d.current_lng),
    num(d.current_heading), ts(d.location_updated_at), d.active !== false, ts(d.$createdAt),
  ],
);

await insert(
  "trip_stops",
  ["id","trip_id","host_id","stop_index","location","lat","lng","stop_type","distance_from_origin_km","price_from_origin"],
  jsonl("trip_stops"),
  (d) => [d.$id, d.trip_id, d.host_id ?? null, num(d.stop_index), d.location ?? null, num(d.lat), num(d.lng), d.stop_type ?? null, num(d.distance_from_origin_km), num(d.price_from_origin)],
);

await insert(
  "trip_seat_reservations",
  ["id","trip_id","seat_code","booking_id","gender"],
  jsonl("trip_seat_reservations"),
  (d) => [d.$id, d.trip_id, d.seat_code, d.booking_id ?? null, d.gender ?? null],
);

await insert(
  "bookings",
  ["id","trip_id","traveler_id","from_stop_index","to_stop_index","seats_booked","segment_price","passenger_name","passenger_phone","passengers_json","status","otp","verified","payment_method","payment_reference","created_at"],
  jsonl("bookings"),
  (d) => [
    d.$id, d.trip_id, d.traveler_id, num(d.from_stop_index), num(d.to_stop_index),
    num(d.seats_booked), num(d.segment_price), d.passenger_name ?? null,
    d.passenger_phone ?? null,
    typeof d.passengers_json === "string" ? d.passengers_json : JSON.stringify(d.passengers_json ?? null),
    d.status ?? "pending", d.otp != null ? String(d.otp) : null, !!d.verified,
    d.payment_method ?? null, d.payment_reference ?? null, ts(d.$createdAt),
  ],
);

await insert(
  "payout_requests",
  ["id","driver_user_id","amount","gross_amount","platform_fee","status","requested_at","processed_at","payment_reference","admin_note","account_holder_name","account_number","ifsc_code","upi_id","trip_id","trip_route","trip_date","deduction","paid_amount","entry_source"],
  jsonl("payout_requests"),
  (d) => [
    d.$id, d.driver_user_id, num(d.amount), num(d.gross_amount), num(d.platform_fee),
    d.status ?? "pending", ts(d.requested_at), ts(d.processed_at), d.payment_reference ?? null,
    d.admin_note ?? null, d.account_holder_name ?? null, d.account_number ?? null,
    d.ifsc_code ?? null, d.upi_id ?? null, d.trip_id ?? null, d.trip_route ?? null,
    ts(d.trip_date), num(d.deduction) ?? 0, num(d.paid_amount) ?? 0, d.entry_source ?? "host",
  ],
);

await insert(
  "bank_accounts",
  ["id","driver_user_id","account_holder_name","account_number","ifsc_code","upi_id"],
  jsonl("bank_accounts"),
  (d) => [d.$id, d.driver_user_id, d.account_holder_name ?? null, d.account_number ?? null, d.ifsc_code ?? null, d.upi_id ?? null],
);

await insert(
  "otp_codes",
  ["id","phone","code","purpose","expires_at","attempts"],
  jsonl("otp_codes"),
  (d) => [d.$id, d.phone ?? null, d.code != null ? String(d.code) : null, d.purpose ?? null, ts(d.expires_at), num(d.attempts) ?? 0],
);

await insert("counters", ["id","data"], jsonl("counters"), (d) => [d.$id, JSON.stringify(d)]);

// ── long-tail jsonb tables ──────────────────────────────────────────────────
for (const table of ["drivers","vehicles","profiles","user_roles","pricing_rules","reviews","hero_banners","trip_shares","deleted_accounts"]) {
  await insert(table, ["id","data","created_at"], jsonl(table), (d) => [d.$id, JSON.stringify(d), ts(d.$createdAt)]);
}

// ── files manifest ──────────────────────────────────────────────────────────
const fileRows = [...jsonl("files_driver_docs"), ...jsonl("files_banners")];
await insert(
  "files",
  ["id","bucket","name","mime_type","size_bytes","s3_key","created_at"],
  fileRows,
  (f) => [f.$id, f.bucket, f.name ?? null, f.mimeType ?? null, num(f.sizeOriginal), null, ts(f.$createdAt)],
);

// ── verify ──────────────────────────────────────────────────────────────────
console.log("\n── verification ──");
for (const t of TABLES.filter((t) => t !== "sessions")) {
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${t}`);
  console.log(`${t}: ${rows[0].n}`);
}
const spot = await client.query(
  "SELECT trip_code, from_location, total_seats, status FROM trips WHERE trip_code IS NOT NULL ORDER BY created_at DESC LIMIT 3",
);
console.log("spot check:", JSON.stringify(spot.rows, null, 1));
await client.end();
console.log("IMPORT COMPLETE");
