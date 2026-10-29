# Apna Samaj — Batch 14O.2C: Local Database Backup and Verification Report

**Date**: 2026-10-29  
**Repository**: [https://github.com/ravindrakewat/ApnaSamaj.git](https://github.com/ravindrakewat/ApnaSamaj.git)  
**Target Branch**: `main`  
**Current HEAD Commit**: `88ce7b8`  
**Scope**: Full Pre-Migration Database Backup Creation and Archive Verification for Kewat Samaj (`aws-0-ap-northeast-1.pooler.supabase.com`).

---

## 1. Executive Summary

In accordance with the safety requirements established in Batches 14O.1 and 14O.2B, a complete local PostgreSQL custom-format archive (`.dump`) was created for the configured Kewat Samaj production database prior to running migration `20261028193000_add_post_appeal_model`.

The backup was generated using the verified `DIRECT_URL` connection on direct session port `5432` with SSL enabled. The backup file was created **outside** the Git repository, verified via `pg_restore --list`, and its integrity confirmed with an explicit SHA-256 cryptographic checksum.

---

## 2. Sanitized Database Target Verification

The backup was performed against the verified Supabase cluster using non-secret connection metadata:

| Attribute | Verified Value | Notes |
| :--- | :--- | :--- |
| **Community Tenant** | `kewat` (`Kewat Samaj`) | Primary production community |
| **Supabase Project Ref** | `tgyrrobrdhbzgheygvdz` | Verified across all configuration parameters |
| **Host** | `aws-0-ap-northeast-1.pooler.supabase.com` | AWS Tokyo region (`ap-northeast-1`) |
| **Port** | `5432` | Supabase Direct Session connection (`DIRECT_URL`) |
| **Database Name** | `postgres` | Target database |
| **SSL Mode** | `require` | Enforced encrypted transit |
| **Client Tool** | `pg_dump (PostgreSQL) 18.4` | Located at `C:\Program Files\PostgreSQL\18\bin\pg_dump.exe` |
| **Gupta Samaj Tenant** | **Unconfigured** | Strictly omitted and untouched |

---

## 3. Backup File Identification & Integrity Metrics

The backup file was created outside the Git repository in the designated local backup directory:

- **Absolute File Path**: `C:\Users\PC\Documents\ApnaSamajBackups\apna_samaj_kewat_20261029_145720.dump`
- **File Format**: PostgreSQL Custom Archive (`-F c`, compressed)
- **Timestamp Generated**: `2026-10-29 14:57:20` (Local System Time)
- **File Size**: `500,778 bytes` (`489.04 KB`)
- **Cryptographic SHA-256 Checksum**:
  ```text
  DB096AA41D2157A1FA75A5C0E087093E58295AD6637979DB7774BF83B8C11213
  ```

---

## 4. `pg_dump` Execution Status

- **Command Invocation**: Executed via Node child process `spawn` with in-memory environment variables (`PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE`, `PGPASSWORD`, `PGSSLMODE`). Zero secrets were placed in shell command arguments or history.
- **Process Exit Code**: `0` (Success)
- **Execution Log Highlights**:
  - Successfully read extensions, schemas, tables, functions, access methods, and types.
  - Successfully dumped table DDL and table contents for all public application tables and auxiliary schemas (`auth`, `storage`, `realtime`).
  - Zero errors or connection timeouts reported.

---

## 5. `pg_restore --list` Verification Result

Running `pg_restore.exe --list` against the generated `.dump` file confirmed that the archive is structurally valid, uncorrupted, and readable. The archive TOC contains **739 entries**.

### Application Tables Verified in Archive:
Both table definitions (`TABLE public <name>`) and table data blocks (`TABLE DATA public <name>`) were verified present for all 19 application tables:

1. `public.User` (Table DDL + Table Data)
2. `public.Profile` (Table DDL + Table Data)
3. `public.RefreshToken` (Table DDL + Table Data)
4. `public.PasswordResetToken` (Table DDL + Table Data)
5. `public.Group` (Table DDL + Table Data)
6. `public.GroupMember` (Table DDL + Table Data)
7. `public.Post` (Table DDL + Table Data)
8. `public.PostMedia` (Table DDL + Table Data)
9. `public.Comment` (Table DDL + Table Data)
10. `public.PostLike` (Table DDL + Table Data)
11. `public.PostView` (Table DDL + Table Data)
12. `public.AuditLog` (Table DDL + Table Data)
13. `public.Notification` (Table DDL + Table Data)
14. `public.ChatMessage` (Table DDL + Table Data)
15. `public.MatrimonialProfile` (Table DDL + Table Data)
16. `public.MatrimonialPartnerPreference` (Table DDL + Table Data)
17. `public.MatrimonialPhoto` (Table DDL + Table Data)
18. `public.MatrimonialInterest` (Table DDL + Table Data)
19. `public._prisma_migrations` (Table DDL + Table Data)

> [!NOTE]
> `PostAppeal` table is absent from this backup, confirming that the backup represents the **exact pre-migration baseline** state of the Kewat production database.

---

## 6. Warnings, Limitations & Recovery Guidance

1. **Restoration Caveat**:
   - Verification via `pg_restore --list` confirms archive completeness and data block integrity.
   - However, a real-world database restore requires appropriate target user privileges, clean or dropped schemas, and proper handling of Supabase internal schemas (`auth`, `storage`).
   - Never restore over an active production database without prior testing on an isolated database instance.
2. **PostgreSQL Client/Server Versions**:
   - The backup tool used is PostgreSQL 18.4 client (`pg_dump` 18.4).
   - If restoring onto a PostgreSQL 15/16 server, use matching server tools or SQL text extraction if binary custom format restore encounters version mismatch.
3. **Manual Rollback Script Alternative**:
   - Because the pending migration is 100% additive (`CREATE TABLE "PostAppeal"` and `CREATE TYPE "PostAppealStatus"`), the quickest and lowest-risk recovery mechanism remains the SQL rollback script documented in Batch 14O.1:
     ```sql
     BEGIN;
     DROP TABLE IF EXISTS "PostAppeal" CASCADE;
     DROP TYPE IF EXISTS "PostAppealStatus";
     DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261028193000_add_post_appeal_model';
     COMMIT;
     ```

---

## 7. Migration Recommendation: **GO**

### **DECISION: GO (Approved for Migration Execution)**

All safety and recovery prerequisites have been satisfied:
- **Pre-Migration Backup**: Created, verified, and SHA-256 hashed at `C:\Users\PC\Documents\ApnaSamajBackups\apna_samaj_kewat_20261029_145720.dump`.
- **Target Confidence**: Verified targeting only Kewat (`tgyrrobrdhbzgheygvdz`) on Tokyo Supabase cluster; Gupta remains skipped.
- **Migration Safety**: Migration `20261028193000_add_post_appeal_model` is 100% additive with zero existing table alterations or data deletions.
- **Direct Port Readiness**: `DIRECT_URL` (port `5432`) is confirmed and ready for Prisma advisory locks.

### Next Execution Step:
Execute the migration across configured tenants using the multi-tenant runner:
```bash
npm run migrate:all
```
*(Wait for explicit user confirmation before executing)*

