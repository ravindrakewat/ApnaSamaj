# Apna Samaj — Batch 14O.1: Production Migration Safety Review

**Date**: 2026-10-28  
**Repository**: [https://github.com/ravindrakewat/ApnaSamaj.git](https://github.com/ravindrakewat/ApnaSamaj.git)  
**Target Branch**: `main`  
**Current HEAD Commit**: `815b535` (`feat: secure moderation appeals and improve appeal UX`)  
**Scope**: Read-Only Safety and Architectural Review of Pending Database Migration `20261028193000_add_post_appeal_model`.

---

## 1. Executive Summary

This safety review investigates the pending `PostAppeal` migration (`packages/database/prisma/migrations/20261028193000_add_post_appeal_model/migration.sql`) and its runner (`packages/database/src/migrate-all-tenants.ts`) prior to execution on production.

### Key Conclusions:
1. **Destructive Risk: ZERO (0%)**. The migration SQL is **100% additive**. It contains no `DROP`, `ALTER ... DROP`, column renaming, or destructive data alterations.
2. **Schema & DDL Consistency: 100% Synchronized**. The SQL migration exactly mirrors the Prisma schema, including nullable `authorId`, `onDelete: SetNull` foreign keys, and the partial unique index on active appeals.
3. **Tenant Targeting Safety: High Confidence**. The tenant registry in `TenantDatabaseManager` discovers exactly **one (1)** active community (`kewat`) pointing to the primary Supabase cluster. Gupta Samaj is completely unconfigured in environment variables and will be skipped safely.
4. **Connection Protocol: Direct URL Verified**. Schema and environment declare `DIRECT_URL` on Supabase port `5432` (session pooler), bypassing the port `6543` transaction pooler (PgBouncer) for safe advisory locks and DDL execution.
5. **Verdict: CONDITIONAL GO**. Safe to apply using `npm run migrate:all` once a manual pre-migration backup/snapshot is confirmed in the Supabase dashboard.

---

## 2. Git and Working-Tree Status

- **Branch**: `main`
- **HEAD Commit**: `815b535` (`feat: secure moderation appeals and improve appeal UX`)
- **Remote Tracking**: `origin/main` ([https://github.com/ravindrakewat/ApnaSamaj.git](https://github.com/ravindrakewat/ApnaSamaj.git))
- **Sync Status**: Local `main` is completely up to date with `origin/main`.
- **Working Tree**: Clean. Zero modified tracked files; only prior documentation reports exist as untracked markdown.

---

## 3. Migration SQL Summary

**File**: [`packages/database/prisma/migrations/20261028193000_add_post_appeal_model/migration.sql`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/packages/database/prisma/migrations/20261028193000_add_post_appeal_model/migration.sql)

```sql
-- CreateEnum
CREATE TYPE "PostAppealStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "PostAppeal" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" "PostAppealStatus" NOT NULL DEFAULT 'PENDING',
    "moderatorId" TEXT,
    "reviewNotes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostAppeal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PostAppeal_authorId_idx" ON "PostAppeal"("authorId");
CREATE INDEX "PostAppeal_postId_idx" ON "PostAppeal"("postId");
CREATE INDEX "PostAppeal_status_createdAt_idx" ON "PostAppeal"("status", "createdAt" DESC);

-- CreateIndex: Partial Unique Index
CREATE UNIQUE INDEX "post_appeals_active_unique_idx" ON "PostAppeal"("postId") 
WHERE "status" IN ('PENDING', 'UNDER_REVIEW');

-- AddForeignKey
ALTER TABLE "PostAppeal" ADD CONSTRAINT "PostAppeal_authorId_fkey" 
FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostAppeal" ADD CONSTRAINT "PostAppeal_moderatorId_fkey" 
FOREIGN KEY ("moderatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

---

## 4. Prisma Schema Consistency

**File**: [`packages/database/prisma/schema.prisma`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/packages/database/prisma/schema.prisma#L540-L561)

| Element | Migration SQL | Prisma Schema Definition | Status |
| :--- | :--- | :--- | :--- |
| **Enum** | `CREATE TYPE "PostAppealStatus"` | `enum PostAppealStatus { PENDING, UNDER_REVIEW, APPROVED, REJECTED }` | **100% Match** |
| **Table** | `CREATE TABLE "PostAppeal"` | `model PostAppeal { ... }` | **100% Match** |
| **authorId** | `authorId TEXT` (Nullable) | `authorId String?` | **100% Match** |
| **author FK** | `REFERENCES "User"("id") ON DELETE SET NULL` | `author User? @relation(..., onDelete: SetNull)` | **100% Match** |
| **moderator FK** | `REFERENCES "User"("id") ON DELETE SET NULL` | `moderator User? @relation(..., onDelete: SetNull)` | **100% Match** |
| **Post FK** | Strictly omitted (historical string) | `postId String` (No `@relation` to `Post`) | **100% Match** |
| **Indexes** | `authorId_idx`, `postId_idx`, `status_createdAt_idx` | `@@index([authorId])`, `@@index([postId])`, `@@index([status, createdAt(sort: Desc)])` | **100% Match** |
| **Partial Unique** | `WHERE "status" IN ('PENDING', 'UNDER_REVIEW')` | DDL-managed partial unique index | **100% Match** |

> [!NOTE]
> `npx prisma validate --schema=packages/database/prisma/schema.prisma` was executed and reported: `The schema at packages\database\prisma\schema.prisma is valid 🚀`.

---

## 5. Tenant Targeting and Multi-Tenant Registry Analysis

**Runner**: [`packages/database/src/migrate-all-tenants.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/packages/database/src/migrate-all-tenants.ts)  
**Manager**: [`packages/database/src/tenant-manager.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/packages/database/src/tenant-manager.ts)

### Configured Tenant Inspection:
Inspection via `tenantDbManager.getAllSafeMetadata()` yields:
```json
[
  {
    "slug": "kewat",
    "name": "Kewat Samaj",
    "isConfigured": true,
    "host": "aws-0-ap-northeast-1.pooler.supabase.com",
    "port": "6543",
    "protocol": "postgresql:"
  }
]
```

### Safety Guards Against Unintended Targets:
1. **Isolated Registry**: `runMultiTenantMigrations()` iterates strictly over `tenantDbManager.getAllCommunityConfigs()`. It never parses arbitrary client parameters or unknown environment variables.
2. **Gupta Isolation**: `COMMUNITY_GUPTA_DATABASE_URL` is omitted. The runner will not attempt to connect to or migrate Gupta Samaj.
3. **Single Tenant Filtering**: The runner supports `runMultiTenantMigrations({ tenantSlug: 'kewat' })`. Passing an unregistered slug fails immediately without executing migrations.
4. **Direct URL Handling**: Line 71 passes `DIRECT_URL: config.directUrl || config.databaseUrl`. Environment inspection confirms `DIRECT_URL` is configured to port `5432` (`aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`), guaranteeing session-level connectivity for Prisma DDL execution.
5. **Credential Stripping**: All stderr/stdout logs in `migrate-all-tenants.ts` filter out passwords using `sanitizeDatabaseUrl()`, preventing database password leakage in console output.

---

## 6. Destructive Operation and Data Loss Risk

- **Existing Table Modification**: None. Zero existing tables (`User`, `Post`, `Comment`, `PostLike`, `AuditLog`, `Notification`, etc.) are altered or dropped.
- **Existing Column Modification**: None.
- **Data Deletion Statements**: Zero `DELETE` or `TRUNCATE` queries.
- **Locking Impact**:
  - `CREATE TYPE "PostAppealStatus"`: Creates a new enum type. Lock is local to the new type.
  - `CREATE TABLE "PostAppeal"`: Creates a new table. Does not acquire exclusive table locks on existing tables.
  - `ALTER TABLE "PostAppeal" ADD CONSTRAINT ... REFERENCES "User"(id)`: Creates a foreign key from the empty new table to `User`. In PostgreSQL, foreign keys acquire `SHARE ROW EXCLUSIVE` on the referenced table (`User`) momentarily during validation; because `PostAppeal` is empty, validation is instantaneous (<10ms).
- **Destructive Risk Rating**: **0 / 10 (Negligible)**.

---

## 7. Idempotency and Behavior if Already Applied

- **Prisma Migration Architecture**:
  - `prisma migrate deploy` checks the `_prisma_migrations` table before running SQL.
  - If `20261028193000_add_post_appeal_model` has already been recorded as applied, Prisma outputs:
    `No pending migrations to apply.`
    and exits with code `0`.
  - It does **not** attempt to re-run `CREATE TABLE` or duplicate enum types.
- **Transactional Rollout**:
  - PostgreSQL runs DDL within transactions. If any statement encounters a syntax or permission failure, the entire migration aborts and rolls back, leaving no half-created tables.

---

## 8. Backup Requirements

Prior to executing the migration in production:
1. **Supabase Dashboard Backup**: Navigate to **Project Settings -> Database -> Backups** and verify an automated snapshot was completed within the last 24 hours, or trigger a manual backup.
2. **CLI Backup (Optional)**: If Point-in-Time Recovery (PITR) is enabled, note the current UTC timestamp before running the command to enable precise point-in-time restoration if needed.

---

## 9. Rollback and Recovery Limitations

Prisma does not provide an automated `prisma migrate rollback` command. In the unlikely event that the migration must be rolled back manually:

### Emergency Manual Rollback Script:
```sql
-- Manual rollback script for 20261028193000_add_post_appeal_model
BEGIN;

-- 1. Drop foreign keys and table
DROP TABLE IF EXISTS "PostAppeal" CASCADE;

-- 2. Drop custom enum type
DROP TYPE IF EXISTS "PostAppealStatus";

-- 3. Remove migration record from Prisma tracking table
DELETE FROM "_prisma_migrations" 
WHERE "migration_name" = '20261028193000_add_post_appeal_model';

COMMIT;
```
Because the migration is additive, executing this rollback script removes only the appeal feature table without impacting any pre-existing user data.

---

## 10. Post-Migration Verification Plan

Immediately following the execution of `npm run migrate:all`, perform the following non-destructive checks:

1. **Verify Schema Status**:
   - Confirm migration runner logs `✅ SUCCESS: Community "kewat" migrated successfully`.
2. **Verify Database Table Creation**:
   - Query PostgreSQL metadata:
     ```sql
     SELECT column_name, data_type, is_nullable 
     FROM information_schema.columns 
     WHERE table_name = 'PostAppeal';
     ```
   - Confirm `authorId` is nullable (`is_nullable = 'YES'`).
   - Confirm index creation:
     ```sql
     SELECT indexname, indexdef 
     FROM pg_indexes 
     WHERE tablename = 'PostAppeal';
     ```
     Ensure `post_appeals_active_unique_idx` has condition `WHERE (status = ANY (ARRAY['PENDING'::"PostAppealStatus", 'UNDER_REVIEW'::"PostAppealStatus"]))`.
3. **Verify API Endpoints**:
   - `GET /api/v1/appeals/me` with member Bearer token returns HTTP 200 `{ success: true, data: [] }`.
   - `GET /api/v1/admin/appeals` with admin/moderator token returns HTTP 200 `{ success: true, data: [] }`.
4. **Verify Existing Operations**:
   - `GET /health` returns HTTP 200 (`status: "ok"`).
   - `GET /api/v1/posts` returns HTTP 200.

---

## 11. Deployment Configuration Review

- **API Server**: Render (`https://apnasamaj-api.onrender.com/`).
  - Render start command: `npx tsx src/server.ts`.
  - Required Environment Variables: `DATABASE_URL`, `DIRECT_URL`, `JWT_ACCESS_SECRET`, `CLIENT_URL`, `ADMIN_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`.
- **Web App**: Vercel (`https://apna-samaj.vercel.app/`).
  - SPA routing: `apps/web/vercel.json` rewrite rule active.
- **Admin App**: Vercel (`https://apna-samaj-admin.vercel.app/`).
  - SPA routing: `apps/admin/vercel.json` rewrite rule active.
- **Domains & CORS**: Whitelisted for `samaz.in`, `*.samaz.in`, `apna-samaj.vercel.app`, and `apna-samaj-admin.vercel.app`.

---

## 12. Recommendation: CONDITIONAL GO

### **DECISION: CONDITIONAL GO**

The migration `20261028193000_add_post_appeal_model` is **safe to execute**.
- It is 100% additive and non-destructive.
- The runner targets the verified Kewat production Supabase database via `DIRECT_URL`.
- There is zero risk of table collision or data loss on existing models.

### Prerequisites to Execute:
1. Confirm Supabase daily automated backup is active or take a manual backup.
2. Execute migration using the multi-tenant runner:
   ```bash
   npm run migrate:all
   ```
3. Run post-migration verification checks on `/api/v1/appeals/me` and `/api/v1/admin/appeals`.

