# Apna Samaj — Batch 14O.2B: Read-Only Supabase Database Verification Report

**Date**: 2026-10-29  
**Repository**: [https://github.com/ravindrakewat/ApnaSamaj.git](https://github.com/ravindrakewat/ApnaSamaj.git)  
**Branch**: `main`  
**Current HEAD Commit**: `88ce7b8`  
**Scope**: Strictly Read-Only Pre-Migration Verification of Supabase Configuration, Project Identification, and Backup Tooling.

---

## 1. Executive Summary

This read-only verification audits the Supabase database configuration, tenant routing, and backup tooling prior to executing the pending `PostAppeal` migration (`20261028193000_add_post_appeal_model`).

### Key Findings:
1. **Target Project Identity**: 100% verified and consistent across all configuration parameters. The project reference `tgyrrobrdhbzgheygvdz` matches across `SUPABASE_URL`, `SUPABASE_JWKS_URL`, `DATABASE_URL` (pooler username), and `DIRECT_URL` (direct username).
2. **Region & Ports**: Confirmed targeting AWS Tokyo (`ap-northeast-1`):
   - **Application Query Port**: `6543` (PgBouncer transaction pooler with `?pgbouncer=true`).
   - **Direct Migration Port**: `5432` (Session pooler / direct connection for DDL locks).
3. **Tenant Targeting Safety**: Exactly one tenant (`kewat`) is configured and registered. Gupta Samaj is completely unconfigured in environment variables and is strictly skipped by the migration runner.
4. **Backup Reality on Supabase Free Plan**: The user confirmed from the Supabase Console that the project is on the Free tier where **automated daily backups and Point-In-Time-Recovery (PITR) are not included**.
5. **Local Backup Capability**: `pg_dump.exe` (PostgreSQL 18.4) was discovered locally on the system at `C:\Program Files\PostgreSQL\18\bin\pg_dump.exe`. This enables creating a local schema + data backup before running any migration.

---

## 2. Git and Repository Integrity

- **Current Branch**: `main`
- **HEAD Commit**: `88ce7b8 docs: add production readiness audit and migration safety review reports (batches 14N, 14O.1, 14O.2A)`
- **Working Tree**: Clean. Zero modified application files.
- **Sync Status**: Local `main` is completely in sync with `origin/main`.

---

## 3. Environment-Variable Names Audit (Zero Secret Values)

Inspection of `.env` without printing or storing secret values reveals the following declared variable names:

| Variable Name | Purpose | Configuration Status |
| :--- | :--- | :--- |
| `PORT` | API Server listen port | Declared (`4000`) |
| `NODE_ENV` | Environment identifier | Declared (`development`) |
| `CLIENT_URL` | Frontend client origin for CORS | Declared |
| `ADMIN_URL` | Admin console origin for CORS | Declared |
| `DATABASE_URL` | Transaction pooled database connection | Declared |
| `DIRECT_URL` | Session direct connection for Prisma migrations | Declared |
| `JWT_ACCESS_SECRET` | Secret key for JWT access token signing | Declared (>= 32 chars) |
| `BOOTSTRAP_ADMIN_*` | Initial seed credentials | Declared |
| `SUPABASE_URL` | Supabase API gateway endpoint | Declared |
| `SUPABASE_PUBLISHABLE_KEY` | Client publishable key | Declared |
| `SUPABASE_SECRET_KEY` | Service role key for storage administration | Declared |
| `SUPABASE_JWKS_URL` | JSON Web Key Set endpoint | Declared |

### Tenant Variable State:
- `COMMUNITY_KEWAT_DATABASE_URL`: **Not explicitly set**; automatically falls back to `DATABASE_URL`.
- `COMMUNITY_KEWAT_DIRECT_URL`: **Not explicitly set**; automatically falls back to `DIRECT_URL`.
- `COMMUNITY_GUPTA_DATABASE_URL`: **Not set** (Gupta Samaj remains unconfigured).

---

## 4. Target Database Identification & Safe Connection Metadata

Extracted safely without exposing credentials, usernames, or passwords:

| Parameter | Application Connection (`DATABASE_URL`) | Migration Connection (`DIRECT_URL`) | Supabase Gateway (`SUPABASE_URL`) |
| :--- | :--- | :--- | :--- |
| **Protocol** | `postgresql:` | `postgresql:` | `https:` |
| **Host** | `aws-0-ap-northeast-1.pooler.supabase.com` | `aws-0-ap-northeast-1.pooler.supabase.com` | `tgyrrobrdhbzgheygvdz.supabase.co` |
| **Port** | `6543` | `5432` | `443` |
| **Path** | `/postgres` | `/postgres` | `/` |
| **Pooler Mode** | Transaction (`pgbouncer=true`) | Session / Direct | N/A |
| **Region** | Tokyo (`ap-northeast-1`) | Tokyo (`ap-northeast-1`) | Tokyo (`ap-northeast-1`) |

---

## 5. Supabase Project Reference Comparison

Inspection of pooler connection usernames confirms the embedded project identifier:
- **`DATABASE_URL` Pooler User Ref**: `tgyrrobrdhbzgheygvdz`
- **`DIRECT_URL` Pooler User Ref**: `tgyrrobrdhbzgheygvdz`
- **`SUPABASE_URL` Subdomain**: `tgyrrobrdhbzgheygvdz`
- **`SUPABASE_JWKS_URL` Subdomain**: `tgyrrobrdhbzgheygvdz`

**Result**: **100% Match**. All database and API client connections target the identical Supabase project instance. There is zero risk of connection mismatch across different environments.

---

## 6. Tenant Isolation & Migration Runner Targeting

**File**: [`packages/database/src/migrate-all-tenants.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/packages/database/src/migrate-all-tenants.ts)  
**Manager**: [`packages/database/src/tenant-manager.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/packages/database/src/tenant-manager.ts)

- **Registered Tenants**: Exactly **one (1)** tenant is registered in `TenantDatabaseManager`:
  - `slug`: `"kewat"` (`Kewat Samaj`)
- **Unregistered Tenants**: Gupta Samaj (`gupta`) is not configured in environment variables.
- **Targeting Verification**:
  - `runMultiTenantMigrations()` iterates strictly over `tenantDbManager.getAllCommunityConfigs()`.
  - When executed, it targets exclusively `kewat`.
  - If `--tenant=gupta` is passed, the runner detects zero matching targets and halts immediately with `{ success: false, results: [] }` without executing any migration SQL.
- **DDL Port Verification**: The runner injects `DIRECT_URL` pointing to session port `5432`, satisfying PostgreSQL advisory locking requirements.

---

## 7. Local `pg_dump` Availability Assessment

Inspection of system binaries confirms:
- **`pg_dump` Installed**: **Yes**
- **Location**: `C:\Program Files\PostgreSQL\18\bin\pg_dump.exe`
- **Client Version**: `pg_dump (PostgreSQL) 18.4`
- **Execution Test**: Only `--version` was called; no database connection or data export was initiated.
- **Implication**: Because the Supabase Free Plan lacks automated dashboard snapshots, `pg_dump.exe` provides a verified local mechanism to export a full standalone database backup (`.dump` or `.sql`) prior to running migrations.

---

## 8. Missing Configurations & Uncertainties

1. **Free Tier Automated Backup Absence**:
   - The Supabase dashboard confirms project backups are not included on the Free plan.
   - Any recovery plan that relies on clicking "Restore Snapshot" in the Supabase UI is invalid for this project.
2. **PostgreSQL Server vs. Client Version**:
   - The local `pg_dump` is PostgreSQL 18.4. Supabase typically runs PostgreSQL 15.x or 16.x. `pg_dump` is designed to be backward compatible with older servers, but a dry-run check (or schema-only export) should precede full data dumping.
3. **Single Database Fallback in Development**:
   - `COMMUNITY_KEWAT_DATABASE_URL` is not distinctly declared; it falls back to `DATABASE_URL`. This means Kewat community data and central control plane data share the same database cluster in the current `.env`.

---

## 9. Recommended Next Safe Steps

Since automated backups are unavailable on the Free Plan:

1. **Step 1 (Create Local Pre-Migration Backup)**:
   - Use the discovered `C:\Program Files\PostgreSQL\18\bin\pg_dump.exe` to create a pre-migration database snapshot file (e.g. `apnasamaj_kewat_pre_migration_backup.dump`).
   - Connect strictly via the direct port `5432` (`DIRECT_URL`).
2. **Step 2 (Verify Backup Artifact)**:
   - Confirm the generated dump file size is non-zero and valid before proceeding.
3. **Step 3 (Execute Additive Migration)**:
   - Execute `npm run migrate:all` to apply `20261028193000_add_post_appeal_model`.
4. **Step 4 (Verify Post-Migration Endpoints)**:
   - Verify `GET /api/v1/appeals/me` and `GET /api/v1/admin/appeals` return HTTP 200.

