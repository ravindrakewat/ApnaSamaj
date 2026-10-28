# Apna Samaj — Batch 14O.2A: Pre-Migration Backup Verification Report

**Date**: 2026-10-28  
**Repository**: [https://github.com/ravindrakewat/ApnaSamaj.git](https://github.com/ravindrakewat/ApnaSamaj.git)  
**Target Branch**: `main`  
**Current HEAD Commit**: `815b535` (`feat: secure moderation appeals and improve appeal UX`)  
**Scope**: Verification of database backup status and migration targeting safety before applying migration `20261028193000_add_post_appeal_model`.

---

## 1. Target Database Identification

Inspection of the multi-tenant database manager ([`packages/database/src/tenant-manager.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/packages/database/src/tenant-manager.ts)) and active environment configuration yields the following safe, non-sensitive connection metadata:

| Attribute | Configuration Value | Safe Metadata Observed |
| :--- | :--- | :--- |
| **Community Tenant** | `kewat` (`Kewat Samaj`) | Primary production community |
| **Database Host** | `aws-0-ap-northeast-1.pooler.supabase.com` | Supabase AWS Tokyo cluster |
| **Application Query Port** | `6543` | Supabase Transaction Pooler (PgBouncer) |
| **Direct Migration Port** | `5432` | Supabase Session Pooler / Direct Connection (`DIRECT_URL`) |
| **Database Name** | `postgres` | Default PostgreSQL database |
| **Secondary Tenants** | `gupta` (Gupta Samaj) | **Unconfigured** (`hasGuptaUrl: false`, zero database URLs registered) |

---

## 2. Backup and Snapshot Status: **UNVERIFIED**

> [!WARNING]
> **Backup Status: UNVERIFIED**  
> External Supabase Dashboard and Supabase Management API access are not available within this local development environment.  
> In strict accordance with the mandatory safety rules, backup readiness cannot be inferred from the platform's default automated backup schedule alone.

### Current Status Details:
- **Dashboard Access**: Unavailable from terminal/local agent environment.
- **Management API Token**: Not provided in local environment.
- **Evidence of Recent Snapshot**: **None directly verifiable from local machine**.
- **Backup Timestamp**: **Unconfirmed**.
- **Backup Scope**: Expected to cover full cluster database (`postgres`), but cannot be attested without dashboard verification.

---

## 3. Evidence and Timestamp Record

- **Verified Backup Artifact**: None currently accessible locally.
- **Last Automated Snapshot Timestamp**: **Unconfirmed** (Requires operator verification in Supabase Console).
- **Physical Dump Files**: Zero local `.sql` or `.dump` backup files exist in the repository tree.

---

## 4. Recovery Method and Rollback Plan

When a verified backup is in place, the following recovery pathways are available:

### Method A: Supabase Dashboard Point-in-Time Recovery (PITR) or Snapshot Restore (Recommended)
1. Navigate to **Supabase Dashboard -> Project Settings -> Database -> Backups**.
2. If Point-in-Time Recovery (PITR) is enabled, select the timestamp immediately preceding migration execution.
3. If daily snapshots are used, trigger a manual snapshot or select the latest scheduled backup.

### Method B: Additive DDL Rollback Script (Manual SQL Reversal)
Because migration `20261028193000_add_post_appeal_model` is strictly additive (creates a new table and enum without altering or deleting existing tables), a manual SQL rollback is also available:
```sql
BEGIN;

-- 1. Drop the appeal table and foreign keys
DROP TABLE IF EXISTS "PostAppeal" CASCADE;

-- 2. Drop the custom enum type
DROP TYPE IF EXISTS "PostAppealStatus";

-- 3. Remove the migration record from Prisma tracking table
DELETE FROM "_prisma_migrations" 
WHERE "migration_name" = '20261028193000_add_post_appeal_model';

COMMIT;
```

---

## 5. Migration Runner Targeting Review

**File**: [`packages/database/src/migrate-all-tenants.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/packages/database/src/migrate-all-tenants.ts)

1. **Strict Tenant Registry**:
   - The runner queries `tenantDbManager.getAllCommunityConfigs()`.
   - Inspection confirms that only `kewat` is registered.
   - Gupta Samaj is unconfigured and will not be targeted or migrated.
2. **Direct Connection for DDL Execution**:
   - The runner sets `DIRECT_URL: config.directUrl || config.databaseUrl`.
   - The environment provides `DIRECT_URL` pointing to port `5432` (`aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`), guaranteeing session-level connectivity for PostgreSQL advisory locks and DDL execution.
3. **Deterministic Working Directory**:
   - Child process execution explicitly specifies `cwd: path.resolve(__dirname, '..')`, preventing path resolution failures.
4. **Log Sanitization**:
   - Any connection string emitted in console logs or error traces is filtered through `sanitizeDatabaseUrl()`, stripping all credentials.

---

## 6. Git Status

- **Branch**: `main`
- **HEAD**: `815b535 feat: secure moderation appeals and improve appeal UX`
- **Sync Status**: Local `main` is completely in sync with `origin/main`.
- **Working Tree**: Clean. Zero modified tracked files; only the markdown audit documents are present.

---

## 7. Recommendation: **HOLD / CONDITIONAL NO-GO**

### **VERDICT: HOLD / CONDITIONAL NO-GO (Pending Manual Dashboard Confirmation)**

Although the migration SQL is 100% additive and the runner is safely configured:
- **The safety prerequisite established in Batch 14O.1 requires confirming a recoverable backup before executing migrations.**
- Because dashboard access is unavailable locally, the backup status remains **UNVERIFIED**.
- **Action Required by Human Operator**:
  1. Open the [Supabase Dashboard](https://supabase.com/dashboard).
  2. Navigate to **Project Settings -> Database -> Backups**.
  3. Verify that a recent backup exists (or trigger a manual snapshot).
  4. Once confirmed, grant approval to execute the migration.

*DO NOT execute `npm run migrate:all` until this operator confirmation is completed.*

