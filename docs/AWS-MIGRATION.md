# Coolpool → AWS migration runbook

Turnkey lift-and-shift of the entire platform (frontend + self-hosted Appwrite
+ nginx) from the Hostinger VPS to an AWS EC2 instance. Total hands-on time:
~2–3 hours plus DNS propagation. The app code is already portable — nothing in
the repo references the old machine (verified; the last box-specific fallback
was removed in this commit).

## What moves

| Piece | How it moves |
|---|---|
| Appwrite 1.7.4 stack (all data: users, trips, bookings, files) | MariaDB dump + volume tars + compose/env restore |
| Frontend container (this repo) | Fresh clone + build on the new box |
| nginx (`appwrite-proxy`) | Config file copy |
| Secrets | `/root/coolpool-secrets/coolpool-production.env` copy |
| DNS `coolpool.in` | A-record flip at the registrar |

Razorpay, PowersText SMS, Google OAuth/Maps need **no changes** — they key off
the domain, which comes along.

## Prerequisites

- AWS account with billing enabled; region **ap-south-1 (Mumbai)**
- EC2 **t3.large** (2 vCPU / 8 GB — Appwrite's stack is memory-hungry),
  **Ubuntu 24.04**, 60+ GB gp3 disk
- **Elastic IP** allocated and associated (the IP must survive reboots)
- Security group: inbound 22 (your IP only), 80, 443
- SSH keypair downloaded
- Access to the DNS panel that manages `coolpool.in`

## Step 0 — Full backup of the current server (~5 min, run from Mac)

```bash
ssh -i ~/.ssh/coolpool_deploy root@187.127.156.240 '
set -e
B=/root/migration-backup/bundle && rm -rf $B && mkdir -p $B/volumes $B/configs
docker exec appwrite-mariadb-ljdtlive600781krllbzu915 sh -c \
  "mariadb-dump -u root -p\"\$MYSQL_ROOT_PASSWORD\" --all-databases --single-transaction" \
  | gzip > $B/mariadb-all.sql.gz
for v in appwrite-uploads appwrite-config appwrite-certificates appwrite-functions appwrite-builds appwrite-sites appwrite-imports; do
  docker run --rm -v ljdtlive600781krllbzu915_$v:/data:ro -v $B/volumes:/backup alpine \
    tar czf /backup/$v.tar.gz -C /data .
done
cp /data/coolify/services/ljdtlive600781krllbzu915/docker-compose.yml $B/configs/appwrite-compose.yml
cp /data/coolify/services/ljdtlive600781krllbzu915/.env            $B/configs/appwrite.env
cp /root/coolpool-secrets/coolpool-production.env                   $B/configs/
cp /root/deploy.sh                                                  $B/configs/
cd /root/migration-backup && tar czf bundle.tar.gz bundle && sha256sum bundle.tar.gz'
```

> `appwrite.env` contains `_APP_OPENSSL_KEY_V1` — **without it the restored
> data cannot be decrypted.** Verify it exists in the bundle before cutover.

## Step 1 — Provision the EC2 box

```bash
ssh -i aws-key.pem ubuntu@<ELASTIC_IP>
sudo su -
apt update && apt install -y ca-certificates curl
curl -fsSL https://get.docker.com | sh
```

## Step 2 — Transfer the bundle

```bash
scp -3 -i ~/.ssh/coolpool_deploy -i aws-key.pem \
  root@187.127.156.240:/root/migration-backup/bundle.tar.gz \
  ubuntu@<ELASTIC_IP>:/home/ubuntu/
# on AWS box:
sudo mv /home/ubuntu/bundle.tar.gz /root/ && cd /root && tar xzf bundle.tar.gz
sha256sum bundle.tar.gz   # must match Step 0's checksum
```

## Step 3 — Restore Appwrite

```bash
mkdir -p /root/appwrite && cd /root/appwrite
cp /root/bundle/configs/appwrite-compose.yml docker-compose.yml
cp /root/bundle/configs/appwrite.env .env
# Compose file references Coolify volume names (ljdtlive..._appwrite-*).
# Keep them: pre-create each volume and load its data BEFORE first start:
for v in appwrite-uploads appwrite-config appwrite-certificates appwrite-functions appwrite-builds appwrite-sites appwrite-imports; do
  docker volume create ljdtlive600781krllbzu915_$v
  docker run --rm -v ljdtlive600781krllbzu915_$v:/data -v /root/bundle/volumes:/backup alpine \
    tar xzf /backup/$v.tar.gz -C /data
done
docker compose up -d appwrite-mariadb   # start DB alone first
sleep 30
zcat /root/bundle/mariadb-all.sql.gz | docker compose exec -T appwrite-mariadb \
  sh -c 'mariadb -u root -p"$MYSQL_ROOT_PASSWORD"'
docker compose up -d                    # full stack
```

## Step 4 — Deploy the frontend + nginx

```bash
mkdir -p /root/coolpool-secrets
cp /root/bundle/configs/coolpool-production.env /root/coolpool-secrets/
git clone https://github.com/Grigarin-baby/coolpool-connect.git /root/coolpool-connect
cp /root/bundle/configs/deploy.sh /root/deploy.sh && chmod +x /root/deploy.sh
bash /root/deploy.sh                    # builds + starts coolpool-frontend
# nginx (appwrite-proxy) comes from the repo's nginx.conf via docker-compose:
cd /root/coolpool-connect && docker compose up -d appwrite-proxy
```

## Step 5 — Cutover (schedule a quiet hour)

1. **Site lock ON** on the old server (freeze bookings — see site-lock runbook).
2. Re-run **Step 0 + 2 + 3's SQL import only** for a final fresh copy
   (data changed since the first bundle).
3. Flip `coolpool.in` A-record → `<ELASTIC_IP>` (TTL low beforehand if possible).
4. Watch TLS renew/issue on the new box; `curl -I https://coolpool.in` until 200.
5. Run the verification checklist below. **Unlock the site.**

## Verification checklist (before unlocking)

- [ ] Home page + search return results
- [ ] Existing traveler can log in (phone + PIN) — proves DB + encryption key
- [ ] Trip wizard opens for a host; admin dashboard loads
- [ ] One ₹1 cross-account test booking end-to-end (then refund it)
- [ ] Uploaded images load (vehicle photos / banners) — proves volume restore
- [ ] Live tracking page updates
- [ ] `deploy.sh` runs green on the new box (future deploys work)

## Rollback

DNS back to `187.127.156.240` — the old box stays untouched and site-locked
for **7 days** post-migration. Any bookings made on AWS during a rollback
window are in the AWS database only; export before rolling back.

## After migration

- Update `~/.ssh` config / deploy target IP in local notes and memory
- Keep the old VPS one billing cycle, then cancel
- Set up an EBS snapshot schedule (this replaces the "no backup" situation)
