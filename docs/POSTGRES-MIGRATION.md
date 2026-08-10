# Coolpool → AWS RDS PostgreSQL migration

Goal: retire self-hosted Appwrite entirely. Data in **RDS Postgres**, files in
**S3**, auth owned by the app (argon2 + JWT sessions), all data access through
the app's server-function layer.

## Status

### ✅ Proven, rehearsed with real production data (scripts/pg-migration/)

| Piece | Proof |
|---|---|
| Postgres schema (`schema.sql`) | Applied on Postgres 16 (same major as RDS target) |
| Full export (`export-appwrite.mjs`) | 27 users, 74 trips, 258 stops, 14 bookings, all 17 collections, 27 files (8.3 MB) — read-only against live Appwrite |
| Import (`import-postgres.mjs`) | Entire dataset loaded + verified into local Postgres 16 |
| **Zero re-login** (`verify-hash.mjs`) | Appwrite exports argon2id password hashes; verified round-trip with the `argon2` package. 19/27 users carry hashes; the other 8 are Google-login accounts (no password by design) |

Dumps land in `scripts/pg-migration/dump/` — **gitignored (hashes + PII), never commit**.

### 🔨 Remaining application port (the real work, ~1.5–2 weeks)

1. **DB layer** — `pg` client module + config (PG_URL), connection pooling
2. **Repository port** — `src/data/appwrite-repository.ts` functions re-implemented
   as SQL behind server functions, preserving every signature so ~30 call sites
   don't change. Long-tail JSONB tables promoted to typed columns as they're ported
3. **Auth** — phone+PIN login verifying migrated argon2 hashes; signup; JWT
   session cookie; OTP flows re-pointed at `otp_codes` table; **Google OAuth
   re-implemented directly** (new redirect URI must be added in Google Cloud
   console — needs the owner's console session)
4. **Files** — uploads/reads → S3 presigned URLs; migrate dumped files with
   `aws s3 sync`, fill `files.s3_key`
5. **Server functions already in the right shape** (payments, OTP, booking
   finalizer, admin payouts) — swap their Appwrite calls for SQL
6. **Full QA checklist re-run** — auth + money paths are blocking

## Migration day (once the port is code-complete)

Prereqs from owner: AWS credentials, region ap-south-1 confirmed, Google
Cloud console access (OAuth redirect), a quiet cutover window.

1. Provision: **RDS Postgres 16** (db.t4g.small, 20 GB gp3, automated backups
   ON, private subnet) · **S3 bucket** (private, presigned access) · **EC2
   t3.small** for the app (Appwrite's big box no longer needed) · security
   groups: app→RDS 5432 only
2. `psql -f schema.sql` against RDS
3. **Site lock ON** (freeze writes)
4. Fresh `export-appwrite.mjs` → `PG_URL=<rds> import-postgres.mjs` →
   `aws s3 sync dump/files/ s3://<bucket>/`
5. Deploy the ported app (env: PG_URL, S3 bucket, JWT secret, existing
   Razorpay/SMS/Maps keys)
6. Add the new Google OAuth redirect URI (owner, console)
7. Verification: existing user logs in with old PIN · Google login · search ·
   ₹1 cross-account booking → refund · images load from S3 · admin panel ·
   payout ledger figures match pre-migration exactly
8. DNS cutover → unlock → old server stays as rollback for 7 days

## Cost after (vs t3.large lift-and-shift ~$60/mo)

EC2 t3.small ~$15 + RDS db.t4g.small ~$25 + S3 ~$1 ≈ **$41/mo**, with managed
backups and point-in-time recovery built in.
