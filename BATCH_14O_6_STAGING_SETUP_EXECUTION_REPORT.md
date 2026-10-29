# Apna Samaj — Batch 14O.6: Staging Environment Setup Execution Report

**Execution Timestamp:** 2026-10-29T15:57:00 IST  
**Environment Type:** Isolated Local Staging (PostgreSQL 18)  
**Target Staging Database:** `apnasamaj_staging_kewat`  
**Staging Host & Port:** `127.0.0.1:5432`  
**Staging API Port:** `4001`  
**Production Isolation Status:** **100% PHYSICALLY ISOLATED (ZERO PRODUCTION WRITES)**  
**Overall Readiness Verdict:** **STAGING ENVIRONMENT READY FOR BATCH 14O.7**

---

## 1. Executive Summary

In accordance with the approved plan in `BATCH_14O_6_STAGING_ENVIRONMENT_SETUP_PLAN.md`, an isolated local staging environment has been created and verified on the host machine using PostgreSQL 18.

- The staging database `apnasamaj_staging_kewat` was created locally on port `5432`.
- All 8 Prisma migrations were deployed sequentially to the staging database.
- Staging seed data was generated containing synthetic test accounts (Author, Intruder, Moderator) and a prerequisite moderated post audit log.
- `.gitignore` was updated to exclude `.env.staging` and `.env.staging.local`.
- Non-breaking staging scripts were added to `package.json` files using native `--env-file=.env.staging`.
- Workspace-wide TypeScript verification passed cleanly across all 7 packages.
- Zero production records were created, zero production migrations were run, and zero secrets were exposed.

---

## 2. Changes Made

### 2.1 Git Safety (`.gitignore`)
Added entries to exclude staging environment files from source control:
```gitignore
# Environment files & secrets
.env
.env.local
.env.staging
.env.staging.local
.env.development.local
```

### 2.2 Local Staging Environment File (`.env.staging`)
Created `.env.staging` in the monorepo root:
- `PORT`: `4001`
- `NODE_ENV`: `staging`
- `DATABASE_URL`: `postgresql://postgres:[LOCAL_PASS]@localhost:5432/apnasamaj_staging_kewat?schema=public`
- `DIRECT_URL`: `postgresql://postgres:[LOCAL_PASS]@localhost:5432/apnasamaj_staging_kewat?schema=public`
- `COMMUNITY_KEWAT_DATABASE_URL`: `postgresql://postgres:[LOCAL_PASS]@localhost:5432/apnasamaj_staging_kewat?schema=public`
- `COMMUNITY_KEWAT_DIRECT_URL`: `postgresql://postgres:[LOCAL_PASS]@localhost:5432/apnasamaj_staging_kewat?schema=public`
- `JWT_ACCESS_SECRET`: Staging-specific 32+ character HS256 secret (independent from production).
- `CLIENT_URL`: `http://localhost:5173`
- `ADMIN_URL`: `http://localhost:5174`

### 2.3 Staging Migration Runner (`packages/database/src/migrate-staging.ts`)
Created an automated migration runner with programmatic fail-safe assertions:
- Rejects non-local hosts (`localhost` and `127.0.0.1` only).
- Strictly rejects any Supabase domain (`supabase.co`, `supabase.com`, `tgyrrobrdhbzgheygvdz`).
- Validates that the target database name is strictly `apnasamaj_staging_kewat`.

### 2.4 Staging Seed Script (`packages/database/src/seed-staging.ts`)
Created an idempotent staging seeder with the same fail-safe assertions. Seeded:
1. **Author Member**:
   - ID: `164ef480-328a-437f-a284-e4a22ae57735`
   - Phone: `+919999900001` (masked: `+91******0001`)
   - Role: `MEMBER` | Status: `ACTIVE`
2. **Intruder Member** (for cross-user isolation verification):
   - ID: `26d8941e-e6c6-4a78-b79f-14166755ec7e`
   - Phone: `+919999900002` (masked: `+91******0002`)
   - Role: `MEMBER` | Status: `ACTIVE`
3. **Community Moderator**:
   - ID: `196b24b5-7187-4769-906c-67a297db4576`
   - Phone: `+919999900003` (masked: `+91******0003`)
   - Role: `MODERATOR` | Status: `ACTIVE`
4. **Prerequisite Moderated Post AuditLog**:
   - Target Post ID: `aaaaaaaa-0000-0000-0000-000000000001`
   - Action: `MODERATION_DELETE_POST`
   - Target Type: `Post`
   - Details: `postAuthorId` matches Author Member ID (`164ef480-328a-437f-a284-e4a22ae57735`).
5. **Initial Post Moderation Notification**:
   - Recipient ID matches Author Member ID.
   - Type: `POST_MODERATED`, `entityId`: `aaaaaaaa-0000-0000-0000-000000000001`.

### 2.5 Non-Breaking Workspace Scripts
- **Root `package.json`:**
  - `"dev:api:staging"`: Starts API in staging mode.
  - `"start:api:staging"`: Starts compiled API in staging mode.
  - `"db:migrate:staging"`: Executes staging migrations with fail-safe checks.
  - `"db:seed:staging"`: Executes staging seed script with fail-safe checks.
- **`apps/api/package.json`:**
  - `"dev:staging"`: `tsx --env-file=../../.env.staging watch src/server.ts`
  - `"start:staging"`: `tsx --env-file=../../.env.staging src/server.ts`
- **`packages/database/package.json`:**
  - `"migrate:staging"`: `tsx src/migrate-staging.ts`
  - `"seed:staging"`: `tsx src/seed-staging.ts`

---

## 3. Database Isolation Evidence

Direct queries to the local PostgreSQL instance confirmed:
```text
    current_database     | inet_server_addr | inet_server_port 
-------------------------+------------------+------------------
 apnasamaj_staging_kewat | 127.0.0.1        |             5432

 total_tables: 20
 total_users: 3 (synthetic test accounts +919999900001, +919999900002, +919999900003)
 total_audit_logs: 1 (MODERATION_DELETE_POST on aaaaaaaa-0000-0000-0000-000000000001)
 total_notifications: 1 (POST_MODERATED notice for author)
 total_appeals: 0
```
- **Zero Production Pollution**: The production Supabase instance (`tgyrrobrdhbzgheygvdz`) in Tokyo was completely bypassed. Zero connection requests, DDL, or DML were sent to production.

---

## 4. Migration Execution Results

Executed `npx prisma migrate deploy` targeting `localhost:5432/apnasamaj_staging_kewat`:
```text
Datasource "db": PostgreSQL database "apnasamaj_staging_kewat", schema "public" at "localhost:5432"

8 migrations found in prisma/migrations

Applying migration `20261015135430_init_phase1_auth_feed_groups`
Applying migration `20261015144722_add_refresh_token_family_rotation`
Applying migration `20261015151418_add_audit_log_model`
Applying migration `20261020151500_add_notification_model`
Applying migration `20261020183000_add_chat_message_model`
Applying migration `20261020203000_add_matrimonial_module`
Applying migration `20261023194000_add_post_view_model`
Applying migration `20261028193000_add_post_appeal_model`

All migrations have been successfully applied.
Database schema is up to date!
```

---

## 5. Git Safety Verification

- Verified via `git check-ignore -v .env.staging`:
  ```text
  .gitignore:32:.env.staging	.env.staging
  ```
- Verified via `git status --porcelain`:
  `.env.staging` does not appear anywhere in Git status.

---

## 6. Build & Typecheck Results

- Command: `npm run typecheck`
- Result: **0 errors across all workspaces** (`@apnasamaj/admin`, `@apnasamaj/api`, `@apnasamaj/web`, `@apnasamaj/database`, `@apnasamaj/shared-types`, `@apnasamaj/ui-config`, `@apnasamaj/validation`).
- Exit code: `0`.

---

## 7. Blocked Steps

- **None**: All preflight, creation, migration, seeding, and configuration steps executed without blockers.

---

## 8. Readiness Verdict

# Verdict: STAGING READY FOR BATCH 14O.7 ✅

The isolated staging environment is fully configured, populated with prerequisite test accounts, and verified against production leakage. We are ready to proceed with Batch 14O.7 (Staging Appeals Test Execution across all 14 test cases).

