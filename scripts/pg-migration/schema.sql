-- Coolpool PostgreSQL schema — migration target for Appwrite data.
-- Appwrite document ids are preserved as text primary keys so every existing
-- cross-reference (trip_id, booking_id, host_id, …) keeps working unchanged.
-- Hot/money tables are fully typed; long-tail tables land as lossless JSONB
-- and get promoted to typed columns during the application port.

BEGIN;

-- ── Auth ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id             text PRIMARY KEY,
  email          text UNIQUE,
  phone          text,
  name           text,
  password_hash  text,            -- Appwrite argon2id hash, verified as-is: no re-registration
  hash_algo      text,            -- 'argon2' expected
  hash_options   jsonb,
  prefs          jsonb NOT NULL DEFAULT '{}'::jsonb,  -- roles, memberCode, gender, fullName, defaultPhone…
  labels         text[] NOT NULL DEFAULT '{}',        -- 'admin' label lives here
  email_verified boolean NOT NULL DEFAULT false,
  phone_verified boolean NOT NULL DEFAULT false,
  status         boolean NOT NULL DEFAULT true,
  registered_at  timestamptz,
  raw            jsonb            -- full exported user object (lossless)
);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users (phone);

CREATE TABLE IF NOT EXISTS sessions (
  id          text PRIMARY KEY,
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

-- ── Trips ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trips (
  id                  text PRIMARY KEY,
  host_id             text NOT NULL,
  from_location       text NOT NULL,
  from_lat            double precision,
  from_lng            double precision,
  to_location         text NOT NULL,
  to_lat              double precision,
  to_lng              double precision,
  polyline            text,
  total_distance_km   double precision,
  total_price         double precision,
  price_per_km        double precision,
  total_seats         integer,
  departure_at        timestamptz,
  arrival_at          timestamptz,
  duration_minutes    integer,
  host_display_name   text,
  host_rating         double precision,
  host_rating_count   integer,
  vehicle_model       text,
  vehicle_color       text,
  status              text NOT NULL DEFAULT 'scheduled',
  notes               text,
  vehicle_id          text,
  assigned_driver_id  text,
  seat_config         text[],
  trip_code           text,
  segment_prices      jsonb,
  current_lat         double precision,
  current_lng         double precision,
  current_heading     double precision,
  location_updated_at timestamptz,
  active              boolean NOT NULL DEFAULT true,
  created_at          timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trips_code ON trips (trip_code) WHERE trip_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trips_host ON trips (host_id);
CREATE INDEX IF NOT EXISTS idx_trips_departure ON trips (departure_at);
CREATE INDEX IF NOT EXISTS idx_trips_status ON trips (status);

CREATE TABLE IF NOT EXISTS trip_stops (
  id                      text PRIMARY KEY,
  trip_id                 text NOT NULL,
  host_id                 text,
  stop_index              integer NOT NULL,
  location                text,
  lat                     double precision,
  lng                     double precision,
  stop_type               text,
  distance_from_origin_km double precision,
  price_from_origin       double precision
);
CREATE INDEX IF NOT EXISTS idx_trip_stops_trip ON trip_stops (trip_id);

CREATE TABLE IF NOT EXISTS trip_seat_reservations (
  id         text PRIMARY KEY,   -- deterministic tripId_seatCode (optimistic lock preserved)
  trip_id    text NOT NULL,
  seat_code  text NOT NULL,
  booking_id text,
  gender     text
);
CREATE INDEX IF NOT EXISTS idx_seat_res_trip ON trip_seat_reservations (trip_id);

-- ── Bookings ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id                 text PRIMARY KEY,
  trip_id            text NOT NULL,
  traveler_id        text NOT NULL,
  from_stop_index    integer,
  to_stop_index      integer,
  seats_booked       integer,
  segment_price      double precision,
  passenger_name     text,
  passenger_phone    text,
  passengers_json    jsonb,
  status             text NOT NULL DEFAULT 'pending',
  otp                text,
  verified           boolean NOT NULL DEFAULT false,
  payment_method     text,
  payment_reference  text,
  created_at         timestamptz
);
CREATE INDEX IF NOT EXISTS idx_bookings_trip ON bookings (trip_id);
CREATE INDEX IF NOT EXISTS idx_bookings_traveler ON bookings (traveler_id);

-- ── Money ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payout_requests (
  id                  text PRIMARY KEY,
  driver_user_id      text NOT NULL,
  amount              double precision NOT NULL,
  gross_amount        double precision,
  platform_fee        double precision,
  status              text NOT NULL DEFAULT 'pending',
  requested_at        timestamptz,
  processed_at        timestamptz,
  payment_reference   text,
  admin_note          text,
  account_holder_name text,
  account_number      text,
  ifsc_code           text,
  upi_id              text,
  trip_id             text,
  trip_route          text,
  trip_date           timestamptz,
  deduction           double precision NOT NULL DEFAULT 0,
  paid_amount         double precision NOT NULL DEFAULT 0,
  entry_source        text NOT NULL DEFAULT 'host'
);
CREATE INDEX IF NOT EXISTS idx_payouts_driver ON payout_requests (driver_user_id);

CREATE TABLE IF NOT EXISTS bank_accounts (
  id                  text PRIMARY KEY,
  driver_user_id      text NOT NULL,
  account_holder_name text,
  account_number      text,
  ifsc_code           text,
  upi_id              text
);
CREATE INDEX IF NOT EXISTS idx_bank_driver ON bank_accounts (driver_user_id);

-- ── Operational ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS otp_codes (
  id         text PRIMARY KEY,   -- otp_<purpose>_<digits> (deterministic, resend overwrites)
  phone      text,
  code       text,
  purpose    text,
  expires_at timestamptz,
  attempts   integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS counters (
  id   text PRIMARY KEY,          -- e.g. trip_code_seq
  data jsonb NOT NULL
);

-- ── Long tail: lossless JSONB now, typed during the app port ────────────────
CREATE TABLE IF NOT EXISTS drivers          (id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz);
CREATE TABLE IF NOT EXISTS vehicles         (id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz);
CREATE TABLE IF NOT EXISTS profiles         (id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz);
CREATE TABLE IF NOT EXISTS user_roles       (id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz);
CREATE TABLE IF NOT EXISTS pricing_rules    (id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz);
CREATE TABLE IF NOT EXISTS reviews          (id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz);
CREATE TABLE IF NOT EXISTS hero_banners     (id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz);
CREATE TABLE IF NOT EXISTS trip_shares      (id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz);
CREATE TABLE IF NOT EXISTS deleted_accounts (id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz);

-- ── Files (S3 manifest) ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS files (
  id          text PRIMARY KEY,   -- Appwrite file id, preserved in S3 keys
  bucket      text NOT NULL,      -- source bucket → S3 prefix
  name        text,
  mime_type   text,
  size_bytes  bigint,
  s3_key      text,               -- filled at S3 upload time
  created_at  timestamptz
);

COMMIT;
