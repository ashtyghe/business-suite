# FieldOps AWS Backup & Recovery Plan

## What We're Protecting

| Component | Detail | Size Estimate |
|-----------|--------|---------------|
| **Database** | 30 tables across 8 schemas (jobs, shared, timesheets, bills, scheduling, kpi, dam + auth) | ~50-500MB |
| **Storage files** | 2 private buckets: `attachments`, `documents` (PDFs, images, forms) | ~1-50GB |
| **Edge Functions** | 11 Deno functions (Xero sync, AI extraction, email, OAuth, accept-document) | ~500KB |
| **Frontend** | React 18 + Vite app | Already in Git |
| **Voice Assistant** | Node.js/Express + OpenAI Realtime + Twilio | Already in Git |
| **Secrets inventory** | 10+ API keys (Xero, Anthropic, Resend, Twilio, OpenAI, Supabase) | Manifest only |

---

## Phase 1: Setup (One-Time)

### 1.1 AWS Account & S3 Bucket

```
Region:          ap-southeast-2 (Sydney)
Bucket name:     fieldops-backup-sydney
Versioning:      Enabled (keeps prior versions of every object)
Encryption:      SSE-S3 (AES-256, free, at rest)
Access:          Private — no public access
```

**Folder structure inside the bucket:**

```
fieldops-backup-sydney/
├── db/
│   ├── daily/
│   │   ├── 2026-03-23_roles.sql
│   │   ├── 2026-03-23_schema.sql
│   │   └── 2026-03-23_data.sql
│   └── weekly/
│       └── 2026-W12_full.sql
├── storage/
│   ├── attachments/          (mirror of Supabase bucket)
│   └── documents/            (mirror of Supabase bucket)
├── code/
│   ├── edge-functions/       (snapshot of apps/api/supabase/functions/)
│   ├── migrations/           (snapshot of apps/api/supabase/migrations/)
│   └── config.toml
├── secrets/
│   └── secrets-manifest.json (names + last-rotated dates, NOT values)
└── logs/
    └── backup-run-2026-03-23.json
```

### 1.2 IAM Setup

Create a dedicated IAM user `fieldops-backup` with a policy scoped to:
- `s3:PutObject`, `s3:GetObject`, `s3:ListBucket` on `fieldops-backup-sydney` only
- No delete permissions (prevents accidental/malicious purge)
- MFA-protected delete via bucket versioning

### 1.3 Lifecycle Rules

| Rule | Action |
|------|--------|
| Daily DB dumps older than 30 days | Move to S3 Infrequent Access (~40% cheaper) |
| Daily DB dumps older than 90 days | Move to S3 Glacier Instant Retrieval (~70% cheaper) |
| Storage file versions older than 90 days | Move to Glacier Instant Retrieval |
| Everything older than 365 days | Delete (configurable) |

### 1.4 Backup Script

A single Node.js script (`apps/api/scripts/backup-to-s3.ts`) that:

1. **Database export** — runs `supabase db dump` three times:
   - `--role-only` → roles.sql
   - `--schema-only` → schema.sql
   - `--data-only` → data.sql
   - Alternative: direct `pg_dump` via `DATABASE_URL` if CLI unavailable
2. **Storage sync** — uses Supabase service role to list all objects in `attachments` and `documents` buckets, downloads each, uploads to S3 (only new/changed files using ETags for diffing)
3. **Code snapshot** — zips `supabase/functions/`, `supabase/migrations/`, `supabase/config.toml`
4. **Secrets manifest** — writes a JSON listing all expected env var names (not values) with last-known-good dates
5. **Run log** — writes a summary JSON with counts, sizes, duration, any errors

### 1.5 Scheduling

**Option A — GitHub Actions (recommended, free):**
- Cron workflow runs daily at 2am AEST
- Uses repository secrets for AWS credentials + Supabase DB connection string
- Stores backup script output as workflow artifact for debugging

**Option B — AWS Lambda:**
- EventBridge rule triggers a Lambda daily
- Lambda runs the backup script
- More AWS-native but adds complexity

---

## Phase 2: Daily Operation

### What runs every day (2am AEST):

```
1. Connect to Supabase DB (via connection string)
2. pg_dump roles → s3://fieldops-backup-sydney/db/daily/YYYY-MM-DD_roles.sql
3. pg_dump schema → s3://fieldops-backup-sydney/db/daily/YYYY-MM-DD_schema.sql
4. pg_dump data → s3://fieldops-backup-sydney/db/daily/YYYY-MM-DD_data.sql
5. List all files in Supabase Storage buckets
6. Diff against S3 manifest (stored as storage-manifest.json)
7. Upload only new/changed files to s3://fieldops-backup-sydney/storage/
8. Zip edge functions + migrations → s3://fieldops-backup-sydney/code/
9. Write backup log → s3://fieldops-backup-sydney/logs/
10. Send success/failure notification (via Resend email or Slack webhook)
```

### Monitoring:

- **Success:** Email/Slack notification with summary (X tables, Y files, Z MB)
- **Failure:** Alert with error details, retry once, then alert again
- **Weekly:** Manual spot-check — download a random backup and verify restore locally

### Estimated costs:

| Item | Monthly cost |
|------|-------------|
| S3 Standard (10GB) | $0.25 |
| S3 PUT requests (~1000/day) | $0.15 |
| S3 GET requests (rare) | ~$0.01 |
| Data transfer in (to S3) | Free |
| GitHub Actions (minutes) | Free tier |
| **Total** | **~$0.50/mo** |

---

## Phase 3: Recovery — Back to Supabase

> Scenario: Current Supabase project is compromised, corrupted, or needs to be rebuilt.

### 3.1 Create new Supabase project

```bash
# Create new project via dashboard or CLI
supabase projects create fieldops-recovery --region ap-southeast-2
```

### 3.2 Restore database (30-60 min)

```bash
# Download latest backup from S3
aws s3 cp s3://fieldops-backup-sydney/db/daily/LATEST_roles.sql ./
aws s3 cp s3://fieldops-backup-sydney/db/daily/LATEST_schema.sql ./
aws s3 cp s3://fieldops-backup-sydney/db/daily/LATEST_data.sql ./

# Connect to new project and restore
psql $NEW_DATABASE_URL -c "SET session_replication_role = 'replica';"
psql $NEW_DATABASE_URL -f roles.sql
psql $NEW_DATABASE_URL -f schema.sql
psql $NEW_DATABASE_URL -f data.sql
psql $NEW_DATABASE_URL -c "SET session_replication_role = 'origin';"
```

### 3.3 Restore storage files (1-2 hours depending on volume)

```bash
# Script downloads from S3 and uploads to new Supabase Storage
node scripts/restore-storage.ts \
  --source s3://fieldops-backup-sydney/storage/ \
  --target $NEW_SUPABASE_URL \
  --service-role-key $NEW_SERVICE_ROLE_KEY
```

### 3.4 Deploy Edge Functions

```bash
# Download code snapshot from S3, extract, deploy
aws s3 cp s3://fieldops-backup-sydney/code/edge-functions.zip ./
unzip edge-functions.zip -d supabase/functions/
supabase functions deploy --project-ref $NEW_PROJECT_REF
```

### 3.5 Restore secrets

```bash
# Use the manifest to know which secrets to set
supabase secrets set XERO_CLIENT_ID=xxx XERO_CLIENT_SECRET=xxx ...
supabase secrets set ANTHROPIC_API_KEY=xxx RESEND_API_KEY=xxx ...
# Values come from your password manager — manifest tells you what's needed
```

### 3.6 Update DNS & frontend config

```bash
# Update frontend environment
VITE_SUPABASE_URL=https://NEW_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=new_anon_key

# Redeploy frontend to Netlify
netlify deploy --prod

# Update voice assistant env vars on Railway
railway variables set SUPABASE_URL=https://NEW_PROJECT.supabase.co
```

### Recovery time estimate: 2-4 hours

---

## Phase 4: Porting to Full AWS Stack

> Scenario: Moving off Supabase entirely to run on AWS in Sydney.

### Architecture mapping:

| Supabase Component | AWS Replacement | Notes |
|-------------------|-----------------|-------|
| PostgreSQL 17 | **RDS PostgreSQL 17** (db.t4g.micro: ~$15/mo) | Restore SQL dumps directly |
| Auth (GoTrue) | **AWS Cognito** | User pools, JWT tokens. Migrate auth.users to Cognito user pool |
| Edge Functions (Deno) | **Lambda + API Gateway** | Rewrite Deno → Node.js (minimal changes, mostly imports) |
| Storage (S3-compatible) | **S3** (already there!) | Files are already in S3 — just make them the primary store |
| Realtime (WebSockets) | **API Gateway WebSocket** or skip | Only needed if you use Supabase Realtime subscriptions |
| REST API (PostgREST) | **Lambda + API Gateway** or **PostgREST on ECS** | Can run PostgREST as a container, or build thin API layer |
| RLS policies | **Application-level auth** or keep RLS in Postgres | RLS works on any Postgres — policies transfer with schema |
| Dashboard/Studio | **Custom admin** or pgAdmin | Supabase Studio is open-source, can self-host |

### Step-by-step port:

#### 4.1 Database (Day 1)

```bash
# RDS is in the same region, zero egress cost
aws rds create-db-instance \
  --db-instance-identifier fieldops-prod \
  --engine postgres --engine-version 17 \
  --db-instance-class db.t4g.micro \
  --allocated-storage 20 \
  --region ap-southeast-2

# Restore from S3 backup
psql $RDS_ENDPOINT -f roles.sql
psql $RDS_ENDPOINT -f schema.sql
psql $RDS_ENDPOINT -f data.sql
```

**Cost: ~$15/mo** (db.t4g.micro, 20GB storage)

#### 4.2 Storage (Day 1)

S3 bucket already has all files. Just update the app to read/write directly to S3 instead of Supabase Storage API.

- Replace `supabase.storage.from('attachments').upload()` with S3 SDK `PutObject`
- Replace `supabase.storage.from('attachments').createSignedUrl()` with S3 presigned URLs
- Add CloudFront distribution for fast file delivery

**Cost: ~$1/mo** (already paying for backup bucket, add CloudFront)

#### 4.3 Auth (Day 1-2)

Option A — **Cognito** (managed, ~$0.0055/MAU after 50k free):
- Create user pool with email/password
- Migrate users: export from auth.users, import to Cognito
- Update frontend to use `amazon-cognito-identity-js` instead of `@supabase/supabase-js`

Option B — **Self-host Supabase Auth (GoTrue)** on ECS:
- GoTrue is open source, runs as a Go binary
- Keeps existing auth flow unchanged
- **Cost:** ~$5-10/mo on Fargate

#### 4.4 Edge Functions → Lambda (Day 2-3)

Each Supabase Edge Function becomes a Lambda:

| Function | Lambda conversion effort |
|----------|------------------------|
| invite-user | Low — replace Supabase client with direct Cognito/RDS calls |
| send-email | Low — Resend API calls stay the same |
| extract-bill | Low — Anthropic API calls stay the same |
| xero-oauth | Medium — update token storage to RDS |
| xero-sync-* (4 functions) | Medium — update DB client from Supabase to pg/knex |
| ai-insight | Low — Anthropic API calls stay the same |
| accept-document | Low — update DB queries |

Key changes:
- `Deno.env.get()` → `process.env`
- `import { createClient } from 'supabase'` → `import pg from 'pg'`
- Supabase CORS helpers → API Gateway handles CORS

**Cost: ~$0** (Lambda free tier covers this volume easily)

#### 4.5 API Layer (Day 3)

Replace PostgREST (Supabase's auto-generated REST API) with:

Option A — **Keep PostgREST** (open source, run on ECS):
- Frontend code stays unchanged
- Just point to new PostgREST endpoint
- **Cost:** ~$5/mo on Fargate

Option B — **Thin API via Lambda**:
- Create API routes that match current Supabase REST patterns
- More control, but more code to maintain

#### 4.6 Frontend (Day 3-4)

Update `apps/frontend/src/lib/supabase.js`:
- Replace `@supabase/supabase-js` with direct API calls to your new endpoints
- Update auth flow for Cognito (or keep GoTrue)
- Update storage calls to use S3 presigned URLs
- Deploy to Netlify/CloudFront

#### 4.7 Voice Assistant (Day 4)

Minimal changes:
- Update `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` to point to new API + RDS
- If using PostgREST, almost no code changes
- Redeploy on Railway or move to ECS

### AWS monthly cost estimate:

| Service | Cost |
|---------|------|
| RDS PostgreSQL (db.t4g.micro) | $15 |
| S3 (storage + backup, 50GB) | $1.25 |
| CloudFront (CDN for files) | $1-5 |
| Lambda (API + functions) | $0 (free tier) |
| API Gateway | $1-3 |
| Cognito (< 50k MAU) | $0 (free tier) |
| **Total** | **~$20-25/mo** |

vs. Supabase Pro at $25/mo — comparable cost but you own the infrastructure.

---

## Implementation Priority

| # | Task | Effort | Priority |
|---|------|--------|----------|
| 1 | Create S3 bucket in Sydney with lifecycle rules | 30 min | **Now** |
| 2 | Build backup script (DB + Storage + Code) | 4-6 hours | **Now** |
| 3 | Set up GitHub Actions daily schedule | 1 hour | **Now** |
| 4 | Build restore-to-Supabase script | 2-3 hours | **Next** |
| 5 | Test full backup → restore cycle | 2 hours | **Next** |
| 6 | Document secrets in password manager | 1 hour | **Next** |
| 7 | AWS stack port (if/when needed) | 3-5 days | **Later** |

---

## Decision Points

1. **Scheduling:** GitHub Actions (free, simple) vs Lambda (AWS-native)?
2. **Secrets storage:** Password manager only, or also AWS Secrets Manager ($0.40/secret/mo)?
3. **Notification channel:** Email via Resend, or Slack webhook?
4. **Recovery target:** Just Supabase restore for now, or build AWS port scripts too?
